/*
 * 실화면 카드 딸깍 스크립트 — 슬라이드별 개별 4:5 영상 출력(레퍼런스 정합).
 * 사용법:
 *   1) 클립(mp4, 16:9 권장)을 public/clips/<아무경로>/ 에 넣는다
 *   2) public/mediadecks/<덱>.json 에 카드들(clip·label·title·body[]) 작성
 *   3) node scripts/mediacards.mjs <덱>
 * → out/<덱>/01.mp4, 02.mp4 … (카드 길이 = 클립 실측 길이, 3~15s 클램프)
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, sep, relative } from 'node:path';

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

/* 무드 정본 — 색·글꼴·레이아웃 한 벌(public/moods.json).
   MediaCard가 직접 읽지 않고 여기서 골라 props로 넘긴다 — 렌더러는 무드 목록을 몰라도 되고,
   정본 파일 위치를 옮겨도 컴포넌트를 안 건드린다. */
const MOOD_DOC = JSON.parse(readFileSync(join('public', 'moods.json'), 'utf8'));
const MOODS = MOOD_DOC.무드;
const moodList = () => MOODS.map((m) => `      ${m.id}  (${m.이름} — ${m.쓰임})`).join('\n');

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
  /* 모르는 무드 이름은 조용히 기본값으로 떨어진다 — 그러면 사용자는 오타를 친 줄 모르고
     "왜 색이 안 나오지"에서 막힌다. 여기서 이름을 짚어준다. 목록은 moods.json 정본에서 읽는다
     (예전엔 스크립트에 이름을 또 적어둬서 무드를 추가할 때마다 두 곳을 고쳐야 했다). */
  /* theme·surface는 무드 체계로 바뀌면서 없어졌다(2026-08-22). 그냥 무시하면 예전 덱을
     가진 사람이 "흑백으로 해놨는데 왜 빨강이지"에서 막힌다 — 무엇으로 바뀌었는지 알려준다. */
  const 옛필드 = { theme: 'mood', surface: 'bg' };
  for (const [old, now] of Object.entries(옛필드)) {
    if (deck.brand?.[old] !== undefined) {
      bad.push(`"${old}" 는 더 이상 쓰지 않습니다 — "${now}" 로 바뀌었습니다.
` +
        (now === 'mood' ? `    쓸 수 있는 무드:\n` + moodList() : `    예: "bg": "#0d0d0d"`));
    }
  }

  const mn = deck.brand?.mood;
  if (mn !== undefined && !MOODS.some((m) => m.id === mn)) {
    bad.push(`"mood": "${mn}" 는 없는 무드입니다. 쓸 수 있는 값:
` + moodList());
  }
  (Array.isArray(deck.cards) ? deck.cards : []).forEach((c, i) => {
    if (!c || typeof c !== 'object') { bad.push(`카드 ${i + 1}이 { } 형태가 아닙니다.`); return; }
    if (typeof c.title !== 'string' || !c.title.trim()) bad.push(`카드 ${i + 1}에 "title"이 없습니다.`);
    if (c.body !== undefined && !Array.isArray(c.body)) bad.push(`카드 ${i + 1}의 "body"는 [ ] 목록이어야 합니다(한 문장 = 한 줄).`);
    /* 타입이 어긋나면 렌더 도중 원시 스택트레이스로 죽는다 — 이 스크립트가 지키려는 건
       "비개발자에게 스택트레이스를 안 보여준다"이므로 여기서 짚는다. */
    if (c.clip !== undefined && typeof c.clip !== 'string') bad.push(`카드 ${i + 1}의 "clip"은 파일 경로 문자열이어야 합니다.`);
    if (c.duration !== undefined && !Number.isFinite(c.duration)) bad.push(`카드 ${i + 1}의 "duration"은 숫자(초)여야 합니다.`);
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
/* @remotion/cli 로 좁혀서 판정한다 — 폴더 존재만 보면, 설치가 중간에 끊겨 껍데기만
   남았을 때 재설치를 건너뛰고 npx가 레지스트리에서 핀 밖 최신 버전을 끌어온다. */
if (!existsSync(join('node_modules', '@remotion', 'cli'))) {
  console.log('\n처음 실행이라 필요한 부품을 인터넷에서 받습니다 — 몇 분 걸립니다(이번 한 번만).\n  · npm 패키지와 헤드리스 브라우저(약 200MB)를 내려받습니다.\n');
  /* npm install이 아니라 npm ci — package-lock.json 을 그대로 재현한다.
     install은 lock을 갱신할 수 있어 핀 고정이 깨진다. node_modules가 없는 상황이라 ci가 맞다. */
  const r = spawnSync('npm ci', { shell: true, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('\n부품을 받지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.\n');
    process.exit(1);
  }
}

/* 클립 길이·픽셀은 Remotion이 들고 온 것으로 잰다 — 시스템에 ffmpeg가 깔려 있지 않아도 된다.
   예전엔 시스템 ffprobe를 직접 불러서, 안 깔린 컴퓨터에선 stdout이 없어 원시 스택트레이스로
   죽었다(2026-08-13). 배포용 도구라 남의 컴퓨터에 뭘 더 깔라고 요구하지 않는다.
   한 번 호출로 길이·가로·세로가 다 나오므로 예전 probe/probeDims 두 번을 한 번으로 줄인다. */
const { getVideoMetadata, ensureBrowser } = await import('@remotion/renderer');

/* npm install로 받는 건 Remotion 라이브러리 코드뿐이다 — 실제로 화면을 그리는 헤드리스
   크롬은 별개로, npx remotion render/still을 맨 처음 실행하는 순간 Remotion이 알아서
   따로 받는다(ensure-browser.js, ~100~200MB). 이미 받아져 있으면 즉시 통과하는 함수라
   카드 루프 시작 전에 여기서 한 번 불러 둔다 — 그래야 "부품 받는 중"이라는 안내가
   카드 1번 렌더 중간에 뜬금없이 끼어들지 않고, 대기 시간 안내와 한 자리에 모인다
   (2026-08-14: "완전 로컬"이라고만 해두고 이 두 번째 다운로드를 안내에서 빠뜨렸었다). */
console.log('부품 확인 중 — 헤드리스 브라우저가 없으면 한 번만 더 받습니다(수 분, 이후엔 안 걸립니다)...');
await ensureBrowser();

// 자료 실측 픽셀 — 창이 자료 비율을 따라가게(크롭 금지) MediaCard에 주입한다
/* 클립 경로는 **public 안으로 가둔다.**
   join('public', '../../..') 는 상위 폴더로 그냥 나간다 — 덱 JSON은 남이 만들어 건네줄 수
   있는 파일이고(이 도구는 공개 배포된다), 그러면 받은 사람 컴퓨터의 아무 파일이나 읽어
   카드에 그릴 수 있다. 정규화한 절대경로가 public 아래인지 확인하고, 아니면 거기서 끊는다.
   (2026-08-22 공개 전 보안 점검에서 실제로 탈출되는 걸 확인하고 막았다) */
const PUBLIC_DIR = resolve('public');
const 안쪽 = (abs) => abs === PUBLIC_DIR || abs.startsWith(PUBLIC_DIR + sep);
const 경로거부 = (cardNo, p, 이유) => {
  console.error(
    `
카드 ${cardNo}의 clip 경로를 쓸 수 없습니다: ${p}
` +
    `  ${이유}
` +
    `  자료는 public/clips/<폴더>/ 아래에 두고, 그 아래 상대경로만 적어주세요.
` +
    `  (예: "clips/내주제/영상.mp4")
`,
  );
  process.exit(1);
};
const safeClipPath = (p, cardNo) => {
  /* 널바이트가 들어오면 fs 함수가 원시 에러를 던진다 — 비개발자가 볼 화면이 아니다.
     경로 판정을 우회하려는 시도이기도 하니 여기서 먼저 끊는다. */
  if (typeof p !== 'string' || p.includes('\0')) 경로거부(cardNo, JSON.stringify(p), '경로에 쓸 수 없는 문자가 있습니다.');
  const full = resolve(PUBLIC_DIR, p);
  if (!안쪽(full)) 경로거부(cardNo, p, 'public 폴더를 벗어납니다.');
  return full;
};
/* 심볼릭 링크로 빠져나가는 걸 막는다. resolve()는 링크를 **따라가지 않아서**,
   public 안에 바깥을 가리키는 링크가 하나 있으면 위 검사를 그대로 통과한다 —
   클립 폴더를 통째로 받아 쓰는 경우(이 도구는 공개 배포된다) 실제로 가능한 경로다.
   파일이 있는 걸 확인한 뒤 실제 경로로 한 번 더 판정한다. */
const assertRealInside = (full, p, cardNo) => {
  let real;
  try { real = realpathSync(full); } catch { return; }   // 못 풀면 아래 존재 검사가 잡는다
  if (!안쪽(real)) 경로거부(cardNo, p, 'public 밖을 가리키는 링크입니다.');
};

const probeClip = async (p, cardNo) => {
  const full = safeClipPath(p, cardNo);
  /* 파일이 없으면 예전엔 길이가 0으로 나와서 "0.0초입니다 — 최소 10초" 라고 엉뚱하게 알렸다.
     경로 오타인데 멀쩡한 영상을 계속 다시 자르게 만드는 오진이라 여기서 끊는다. */
  if (!existsSync(full)) {
    console.error(
      `\n클립 파일이 없습니다: ${full}\n` +
      `  덱의 "clip" 경로와 실제 파일 이름이 같은지 확인하세요 — 대소문자·확장자까지 같아야 합니다.\n`,
    );
    process.exit(1);
  }
  assertRealInside(full, p, cardNo);
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
  /* 표지(cover)는 무드에 따라 자료 없이도 성립한다 — photo 무드만 사진이 필요하고,
     minimal·solid는 아예 안 쓰며 frame은 있으면 쓰고 없으면 타이포로 찬다(2026-08-22). */
  const needsClip = deck.cards[i].cover && deck.brand?.mood === 'photo';
  const isTypographic = (deck.cards[i].cover && !needsClip)
    || deck.cards[i].cta || deck.cards[i].compare || deck.cards[i].steps || !deck.cards[i].clip;
  /* clip 없는 일반 카드는 텍스트 카드로 렌더된다(2026-08-23). 예전엔 여기서 막았는데,
     화면 녹화·사진이 없는 사용자가 정보 카드를 만들 길이 없었다. */

  const info = deck.cards[i].clip ? await probeClip(deck.cards[i].clip, i + 1) : null;
  /* **검증한 경로를 그대로 렌더러에 넘긴다.** 예전엔 safeClipPath()가 만든 안전한 경로를
     getVideoMetadata에만 쓰고 버린 뒤, props에는 덱의 원본 문자열을 실어 보냈다. Remotion
     쪽 방어가 겹쳐 있어 뚫리지는 않았지만, 검증한 값과 쓰는 값이 다른 구조는 회귀 사고의
     씨앗이다. public 기준 상대경로로 정규화해서 넘긴다. */
  const safeClip = deck.cards[i].clip
    ? relative(PUBLIC_DIR, safeClipPath(deck.cards[i].clip, i + 1)).split(sep).join('/')
    : undefined;
  const card = {
    ...deck.cards[i],
    ...(safeClip ? { clip: safeClip } : {}),
    ...(info ? { clipW: info.width, clipH: info.height } : {}),
  };
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
  const mood = MOODS.find((m) => m.id === (deck.brand.mood ?? MOOD_DOC.기본무드)) ?? MOODS[0];
  const look = MOOD_DOC.룩[mood.룩];
  const props = { brand: deck.brand, card, durFrames, deck: summary, mood, look, scrim: MOOD_DOC.사진스크림 };

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
  const isStill = !!card.cover || !!card.cta || !!card.compare || !!card.steps || !card.clip || (isImage && !card.motion);
  const outFile = join('out', deckName, `${n}.${isStill ? 'png' : 'mp4'}`);
  console.log(`카드 ${i + 1}/${deck.cards.length}: ${card.title.replace(/\n/g, ' ')} ${isStill ? '(정지 PNG)' : `(${(durFrames / 30).toFixed(1)}s)`}`);

  /* 셸을 안 쓴다 — 인자 배열로 직접 넘긴다(2026-08-22 검토 지적).
     예전엔 `npx remotion ...` 문자열을 만들어 spawnSync(cmd, {shell:true})로 돌렸다.
     지금은 덱 이름 정규식이 셸 메타문자를 전부 거부해서 주입이 막혀 있지만, 그 안전이
     **정규식 하나가 완벽하다는 것에만** 걸려 있었다 — "덱 이름에 공백 좀 쓰게 해달라"는
     요청 한 번에 무너지는 구조다. 셸을 안 거치면 그 표면 자체가 없어진다.
     npx도 안 쓴다: node_modules가 부분 손상되면 npx가 레지스트리에서 핀(4.0.484) 밖
     최신 버전을 끌어온다. 로컬 진입점을 node로 직접 부르면 그럴 일이 없다.
     (Windows에서 npx는 .cmd라 shell:false로는 못 부른다 — 그래서 CLI의 .js를 직접 쓴다.) */
  const REMOTION_CLI = join('node_modules', '@remotion', 'cli', 'remotion-cli.js');
  const args = isStill
    ? [REMOTION_CLI, 'still', 'src/index.ts', 'MediaCard', outFile, '--frame=0', `--props=${propsPath}`]
    // 화질: 프레임 캡처는 기본 JPEG 80이라 화면 녹화·UI 글자가 뭉개진다(전체가 "흐리멍텅"해지는 진짜 원인).
    // 무손실 PNG 캡처 + crf 14 로 뽑는다 — 렌더가 조금 느려지는 대신 대비가 살아난다.
    /* --muted: 오디오 트랙 자체를 넣지 않는다. 무음 트랙이라도 남으면 인스타가 '오리지널 오디오'로
       잡아 음악 라이브러리 붙이기가 걸린다. 소리는 인스타 앱에서 얹는다(라이선스 해결 경로). */
    /* 동시성은 지정하지 않는다 — Remotion이 그 컴퓨터 코어 수를 보고 정하게 둔다.
       예전엔 --concurrency=1로 묶여 있었다(2026-08-12). 탭 두 개가 각각 Pretendard를 로드하다
       한쪽이 타임아웃에 걸려 렌더가 죽었기 때문인데, 그 원인은 폰트 핸들 누수였고 이미 고쳤다
       (fonts.ts 참고). 그래서 제약을 푼다 — 6코어에서 300프레임 82초 → 25초로 실측 3.3배,
       산출물은 바이트 단위로 동일했다. 숫자를 박지 않는 이유는 남의 컴퓨터가 2코어일 수도
       있어서다: 고정값은 느린 기계에서 오히려 서로 잡아먹는다.
       timeout은 넉넉히 남겨둔다 — 느린 기계에서 OffthreadVideo가 프레임을 못 뽑는 경우 대비. */
    : [REMOTION_CLI, 'render', 'src/index.ts', 'MediaCard', outFile, `--props=${propsPath}`,
       '--timeout=90000', '--image-format=png', '--crf=14', '--muted'];

  const r = spawnSync(process.execPath, args, { encoding: 'utf8', stdio: 'inherit' });
  rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0) { console.error(`렌더 실패: 카드 ${i + 1}`); process.exit(1); }

  // 같은 번호의 옛 확장자 파일이 남아 있으면 업로드 때 헷갈린다
  const stale = join('out', deckName, `${n}.${isStill ? 'mp4' : 'png'}`);
  if (existsSync(stale)) { rmSync(stale, { force: true }); console.log(`  (구버전 ${n}.${isStill ? 'mp4' : 'png'} 제거)`); }
}
console.log(`완료 — out/${deckName}/`);
