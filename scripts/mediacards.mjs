/*
 * 실화면 카드 딸깍 스크립트 — 슬라이드별 개별 4:5 영상 출력(레퍼런스 정합).
 * 사용법:
 *   1) 클립(mp4, 16:9 권장)을 public/clips/<아무경로>/ 에 넣는다
 *   2) public/mediadecks/<덱>.json 에 카드들(clip·label·title·body[]) 작성
 *   3) node scripts/mediacards.mjs <덱>
 * → out/<덱>/01.mp4, 02.mp4 … (카드 길이 = 클립 실측 길이, 3~15s 클램프)
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const deckName = process.argv[2];
if (!deckName) { console.error('사용법: node scripts/mediacards.mjs <덱이름> [--only 1,5]'); process.exit(1); }

/* 덱 이름은 아래에서 셸 명령 문자열에 그대로 들어간다(npx remotion ... "out/<덱>/01.mp4").
   따옴표·세미콜론·$() 같은 게 섞이면 명령이 갈라질 수 있어서, 파일명으로 쓸 만한 글자만 허용한다.
   한글·영문·숫자·하이픈·언더스코어·점만 통과. (경로 구분자도 막아 상위 폴더 탈출을 함께 차단) */
/* 점만으로 된 이름(`.`, `..`)은 위 정규식을 통과하지만 결과물이 엉뚱한 폴더로 나간다 */
if (!/^[\w가-힣.-]+$/u.test(deckName) || /^\.+$/.test(deckName)) {
  console.error(
    `\n덱 이름에 쓸 수 없는 문자가 있습니다: ${deckName}\n` +
    `  한글·영문·숫자와 - _ . 만 쓸 수 있습니다. 공백과 특수문자는 빼주세요.\n`,
  );
  process.exit(1);
}

const deckPath = join('public', 'mediadecks', `${deckName}.json`);
let deck;
try {
  deck = JSON.parse(readFileSync(deckPath, 'utf8'));
} catch (e) {
  if (e.code === 'ENOENT') {
    console.error(`\n덱 파일이 없습니다: ${deckPath}\n  public/mediadecks/ 안에 <덱이름>.json 파일이 있는지 확인하세요.\n`);
  } else {
    console.error(`\n덱 JSON을 읽는 중 오류가 났습니다: ${deckPath}\n  ${e.message}\n`);
  }
  process.exit(1);
}
/* 덱이 스키마를 안 지키면 예전엔 렌더 도중 원시 스택트레이스로 죽었다
   ("Cannot read properties of undefined (reading 'length'/'replace')").
   비개발자는 그 화면에서 뭘 고쳐야 할지 알 수 없으므로, 렌더를 시작하기 전에 한 번에 짚어준다. */
const bad = [];
if (!deck || typeof deck !== 'object') bad.push('덱 파일이 { } 로 시작하는 JSON이 아닙니다.');
else {
  if (!Array.isArray(deck.cards) || deck.cards.length === 0) bad.push('"cards" 목록이 없거나 비어 있습니다.');
  if (!deck.brand || typeof deck.brand !== 'object') bad.push('"brand" 항목이 없습니다(handle·theme 등이 들어가는 자리).');
  (Array.isArray(deck.cards) ? deck.cards : []).forEach((c, i) => {
    if (!c || typeof c !== 'object') { bad.push(`카드 ${i + 1}이 { } 형태가 아닙니다.`); return; }
    if (typeof c.title !== 'string' || !c.title.trim()) bad.push(`카드 ${i + 1}에 "title"이 없습니다.`);
    if (c.body !== undefined && !Array.isArray(c.body)) bad.push(`카드 ${i + 1}의 "body"는 [ ] 목록이어야 합니다(한 문장 = 한 줄).`);
  });
}
if (bad.length) {
  console.error(`\n덱 파일을 고쳐야 합니다: ${deckPath}\n${bad.map((m) => `  · ${m}`).join('\n')}\n`);
  process.exit(1);
}
for (const c of deck.cards) if (c.body === undefined) c.body = [];

/* 반려로 카드 한두 장만 고칠 때 — 그 카드만 다시 렌더한다(전체 재렌더 낭비 방지).
   예전엔 값 검증이 없어서 `--only abc`·`--only 99`가 조용히 0장을 렌더하고 "완료"라고 했고,
   `--only`만 쓰고 숫자를 빠뜨리면 원시 TypeError로 죽었다(2026-08-13). */
const onlyIdx = (() => {
  const i = process.argv.indexOf('--only');
  if (i < 0) return null;
  const raw = process.argv[i + 1];
  const nums = (raw ?? '').split(',').map((n) => Number(n.trim()));
  const ok = raw && nums.every((n) => Number.isInteger(n) && n >= 1 && n <= deck.cards.length);
  if (!ok) {
    console.error(
      `\n--only 뒤에는 카드 번호를 씁니다 — 이 덱은 1~${deck.cards.length}번까지 있습니다.\n` +
      `  예: node scripts/mediacards.mjs ${deckName} --only 2\n` +
      `      node scripts/mediacards.mjs ${deckName} --only 2,3\n`,
    );
    process.exit(1);
  }
  return new Set(nums);
})();

mkdirSync(join('out', deckName), { recursive: true });

/* 플러그인은 git clone으로 깔리는데 node_modules는 .gitignore라 안 따라온다 —
   README가 "다 받아진다"고 적어둔 것과 달리 남의 컴퓨터에선 부품이 없다(2026-08-13).
   비개발자에게 "npm install 하세요"는 그 자체로 장벽이라 여기서 한 번만 알아서 받는다. */
if (!existsSync('node_modules')) {
  console.log('\n처음 실행이라 필요한 부품을 받는 중입니다 — 몇 분 걸립니다(이번 한 번만).\n');
  const r = spawnSync('npm install', { shell: true, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('\n부품을 받지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.\n');
    process.exit(1);
  }
}

/* 클립 길이·픽셀은 Remotion이 들고 온 것으로 잰다 — 시스템에 ffmpeg가 깔려 있지 않아도 된다.
   예전엔 시스템 ffprobe를 직접 불러서, 안 깔린 컴퓨터에선 stdout이 없어 원시 스택트레이스로
   죽었다(2026-08-13). 배포용 도구라 남의 컴퓨터에 뭘 더 깔라고 요구하지 않는다.
   한 번 호출로 길이·가로·세로가 다 나오므로 예전 probe/probeDims 두 번을 한 번으로 줄인다. */
const { getVideoMetadata } = await import('@remotion/renderer');

// 자료 실측 픽셀 — 창이 자료 비율을 따라가게(크롭 금지) MediaCard에 주입한다
const probeClip = async (p) => {
  const full = join('public', p);
  /* 파일이 없으면 예전엔 길이가 0으로 나와서 "0.0초입니다 — 최소 10초" 라고 엉뚱하게 알렸다.
     경로 오타인데 멀쩡한 영상을 계속 다시 자르게 만드는 오진이라 여기서 끊는다. */
  if (!existsSync(full)) {
    console.error(
      `\n클립 파일이 없습니다: ${full}\n` +
      `  덱의 "clip" 경로와 실제 파일 이름이 같은지 확인하세요 — 대소문자·확장자까지 같아야 합니다.\n`,
    );
    process.exit(1);
  }
  try {
    return await getVideoMetadata(full);
  } catch (e) {
    console.error(
      `\n이 파일을 읽지 못했습니다: ${full}\n  ${e.message}\n` +
      `  파일이 손상됐거나 지원하지 않는 형식일 수 있습니다(mp4·png·jpg를 씁니다).\n`,
    );
    process.exit(1);
  }
};

for (let i = 0; i < deck.cards.length; i++) {
  if (onlyIdx && !onlyIdx.has(i + 1)) continue;

  /* clip 없는 일반 카드는 창이 빈 검은 상자로 나가므로 미리 막는다.
     (2026-08-12: 예전엔 여기서 join(undefined)로 원시 스택트레이스를 뱉고 죽었다)
     cta·compare·steps는 원래 미디어가 없는 타이포 전용 카드라 예외다. */
  const isTypographic = deck.cards[i].cta || deck.cards[i].compare || deck.cards[i].steps;
  if (!isTypographic && !deck.cards[i].clip) {
    console.error(
      `\n카드 ${i + 1}에 clip이 없습니다.\n` +
      `  이 도구는 '실제 화면 위에 글자를 얹는' 카드를 만듭니다 — 창에 넣을 자료가 있어야 합니다.\n` +
      `  · 영상(mp4) 또는 이미지(png/jpg)를 public/clips/<폴더>/ 에 넣고\n` +
      `    덱의 해당 카드에 "clip": "clips/<폴더>/<파일명>" 을 적으세요.\n` +
      `  · 글자만 있는 카드를 원하면 "cta": true, 비교표는 "compare", 번호 목록은 "steps"를 쓰세요.\n`,
    );
    process.exit(1);
  }

  const info = deck.cards[i].clip ? await probeClip(deck.cards[i].clip) : null;
  const card = { ...deck.cards[i], ...(info ? { clipW: info.width, clipH: info.height } : {}) };
  const isImage = card.clip ? /\.(png|jpe?g|webp)$/i.test(card.clip) : false;
  /* 이미지·CTA·비교·단계는 기본 10초, 클립은 실측 길이. card.duration(초)으로 덮어쓰기 가능.
     **영상은 10초 미만이면 렌더를 멈춘다 (2026-08-01 반려: "뭘 보려면 최소 10초는 돼야지").**
     짧은 클립을 durFrames로 늘리면 마지막 프레임이 얼어붙으므로 패딩하지 않고 소재를 바꾼다. */
  const MIN_SEC = 10;
  const clipSec = card.duration ?? (isTypographic || isImage ? MIN_SEC : info.durationInSeconds);
  if (!isTypographic && !isImage && clipSec < MIN_SEC - 0.05) {
    console.error(
      `\n카드 ${i + 1} 클립이 ${clipSec.toFixed(1)}초입니다 — 최소 ${MIN_SEC}초.\n` +
      `  ${card.clip}\n` +
      `  원본을 더 길게 다시 자르거나, 10초 이상 나오는 다른 소재로 바꾸세요.\n` +
      `  (짧은 클립을 늘리면 마지막 프레임이 얼어붙습니다)\n`,
    );
    process.exit(1);
  }
  const durFrames = Math.round(Math.min(20, Math.max(MIN_SEC, clipSec)) * 30);
  /* 덱 전체의 글 분량을 같이 넘긴다 — 카드가 자기 것만 보고 크기를 정하면 넘길 때
     제목 크기가 튄다. 배율은 카드가 아니라 덱 단위로 정해진다(MediaCard의 fitRatio). */
  const summary = deck.cards.map((c) => ({
    title: c.title, body: c.body, label: c.label, cta: c.cta, compare: c.compare, steps: c.steps,
  }));
  const props = { brand: deck.brand, card, durFrames, deck: summary };

  const tmp = mkdtempSync(join(tmpdir(), 'mediacard-'));
  const propsPath = join(tmp, 'props.json');
  writeFileSync(propsPath, JSON.stringify(props));
  const n = String(i + 1).padStart(2, '0');

  /* CTA 카드는 창이 없어서 모션이 0이다 — 5초짜리 정지 영상을 mp4로 뽑을 이유가 없다.
     PNG 한 장으로 뽑는다(2026-07-31). 인스타 캐러셀은 이미지·영상 혼합을 허용한다. */
  /* 사진·이미지는 기본이 정지 PNG다 — 완성된 사진에 합성 확대(켄번즈)를 억지로 걸지 않는다.
     화면 녹화(mp4)는 원래부터 실제 움직임이 있어서 항상 영상으로 나간다.
     "이미지도 무조건 켄번즈 mp4"였던 예전 기본값이 실사용에서 반려됐다(2026-08-13) —
     스톡 사진 카드가 이유 없이 재생 버튼 붙은 동영상으로 나가서 이상해 보였다. */
  const isStill = !!card.cta || !!card.compare || !!card.steps || (isImage && !card.motion);
  const outFile = join('out', deckName, `${n}.${isStill ? 'png' : 'mp4'}`);
  console.log(`카드 ${i + 1}/${deck.cards.length}: ${card.title.replace(/\n/g, ' ')} ${isStill ? '(정지 PNG)' : `(${(durFrames / 30).toFixed(1)}s)`}`);

  const cmd = isStill
    ? `npx remotion still src/index.ts MediaCard "${outFile}" --frame=0 --props="${propsPath}"`
    // 화질: 프레임 캡처는 기본 JPEG 80이라 화면 녹화·UI 글자가 뭉개진다(전체가 "흐리멍텅"해지는 진짜 원인).
    // 무손실 PNG 캡처 + crf 14 로 뽑는다 — 렌더가 조금 느려지는 대신 대비가 살아난다.
    /* --muted: 오디오 트랙 자체를 넣지 않는다. 무음 트랙이라도 남으면 인스타가 '오리지널 오디오'로
       잡아 음악 라이브러리 붙이기가 걸린다. 소리는 사용자이 인스타 앱에서 얹는다(라이선스 해결 경로). */
    /* 동시성은 지정하지 않는다 — Remotion이 그 컴퓨터 코어 수를 보고 정하게 둔다.
       예전엔 --concurrency=1로 묶여 있었다(2026-08-12). 탭 두 개가 각각 Pretendard를 로드하다
       한쪽이 타임아웃에 걸려 렌더가 죽었기 때문인데, 그 원인은 폰트 핸들 누수였고 이미 고쳤다
       (fonts.ts 참고). 그래서 제약을 푼다 — 6코어에서 300프레임 82초 → 25초로 실측 3.3배,
       산출물은 바이트 단위로 동일했다. 숫자를 박지 않는 이유는 남의 컴퓨터가 2코어일 수도
       있어서다: 고정값은 느린 기계에서 오히려 서로 잡아먹는다.
       timeout은 넉넉히 남겨둔다 — 느린 기계에서 OffthreadVideo가 프레임을 못 뽑는 경우 대비. */
    : `npx remotion render src/index.ts MediaCard "${outFile}" --props="${propsPath}" --timeout=90000 --image-format=png --crf=14 --muted`;

  const r = spawnSync(cmd, { encoding: 'utf8', shell: true, stdio: 'inherit' });
  rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0) { console.error(`렌더 실패: 카드 ${i + 1}`); process.exit(1); }

  // 같은 번호의 옛 확장자 파일이 남아 있으면 업로드 때 헷갈린다
  const stale = join('out', deckName, `${n}.${isStill ? 'mp4' : 'png'}`);
  if (existsSync(stale)) { rmSync(stale, { force: true }); console.log(`  (구버전 ${n}.${isStill ? 'mp4' : 'png'} 제거)`); }
}
console.log(`완료 — out/${deckName}/`);
