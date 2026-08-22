/*
 * 무드 정본(public/moods.json)을 원본 디자인 시스템(src/lib/moods.ts·looks.ts)과 대조한다.
 *
 * 왜 필요한가: 무드 값을 손으로 옮겼다. 손으로 옮기면 반드시 어딘가 틀린다 —
 * 실제로 사진 스크림의 상단 정지점을 주석만 보고 0.16으로 잘못 적었다(원본은 0).
 * 색 하나가 어긋나면 렌더 결과가 조용히 달라지고, 눈으로는 며칠 뒤에나 눈치챈다.
 *
 * 원본은 이 저장소에 없다 — 경로를 안 주면 조용히 건너뛴다(배포본에서 실패하면 안 된다).
 *   node scripts/moods-verify.mjs [원본레포경로]
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/* 원본 레포 경로는 코드에 박지 않는다 — 이 저장소는 공개되고, 남의 컴퓨터 경로는
   그 사람 사용자명과 내부 폴더 구조를 그대로 드러낸다(2026-08-22).
   인자나 환경변수로 받고, 없으면 조용히 건너뛴다. */
const REPO = process.argv[2] ?? process.env.HARU_MOODS_SOURCE;
if (!REPO) {
  console.log('원본 레포 경로가 없어 대조를 건너뜁니다.');
  console.log('  사용법: node scripts/moods-verify.mjs <원본레포경로>');
  console.log('  또는 환경변수 HARU_MOODS_SOURCE 에 지정하세요.');
  process.exit(0);
}

const moodsPath = join(REPO, 'src', 'lib', 'moods.ts');
const looksPath = join(REPO, 'src', 'lib', 'looks.ts');
if (!existsSync(moodsPath)) {
  console.log(`원본이 없어 대조를 건너뜁니다: ${moodsPath}`);
  process.exit(0);
}

const src = readFileSync(moodsPath, 'utf8');
const looksSrc = readFileSync(looksPath, 'utf8');
const mine = JSON.parse(readFileSync('public/moods.json', 'utf8'));

const bad = [];
/* 숫자는 숫자로 비교한다 — 문자열로 대면 1.0과 1이 다르다고 나온다(원본 bodyScale: 1.0). */
const eq = (what, got, want) => {
  const num = got !== null && want !== undefined && !isNaN(Number(got)) && !isNaN(Number(want));
  const same = num ? Number(got) === Number(want) : String(got) === String(want);
  if (!same) bad.push(`${what}: 정본 ${got} ≠ 원본 ${want}`);
};

/* 원본의 theme(...) 호출에서 색 다섯을 뽑는다.
   theme("mood-neon", "검정 + 초록", "#0a0a0a", "#ffffff", "#8e8e93", "#39ff5a", undefined, {...}, "#39ff5a") */
const themeCall = /theme\(\s*"mood-([\w-]+)",\s*"([^"]*)",\s*"(#[0-9a-fA-F]+)",\s*"(#[0-9a-fA-F]+)",\s*"(#[0-9a-fA-F]+)",\s*"(#[0-9a-fA-F]+)",\s*(undefined|"#[0-9a-fA-F]+")/g;
const orig = new Map();
for (const m of src.matchAll(themeCall)) {
  orig.set(m[1], {
    이름: m[2], 바탕: m[3], 글자: m[4], 보조글자: m[5], 강조: m[6],
    어두운바탕: m[7] === 'undefined' ? null : m[7].replace(/"/g, ''),
  });
}

if (orig.size !== mine.무드.length) {
  bad.push(`무드 개수: 정본 ${mine.무드.length}종 ≠ 원본 ${orig.size}종`);
}

for (const m of mine.무드) {
  const o = orig.get(m.id);
  if (!o) { bad.push(`무드 ${m.id}: 원본에 없다`); continue; }
  for (const k of ['이름', '바탕', '글자', '보조글자', '강조', '어두운바탕']) {
    eq(`${m.id}.${k}`, m[k], o[k]);
  }
  // look은 원본에서 그 무드 블록 안의 look: "..." 을 찾는다
  const block = src.slice(src.indexOf(`id: "${m.id}"`));
  const look = block.match(/look:\s*"(\w+)"/)?.[1];
  eq(`${m.id}.룩`, m.룩, look);
}

// 룩 — 숫자·글꼴이 그대로인지
for (const [id, L] of Object.entries(mine.룩)) {
  if (id.startsWith('_')) continue;
  const b = looksSrc.slice(looksSrc.indexOf(`id: "${id}"`));
  const pick = (re) => b.match(re)?.[1];
  eq(`룩.${id}.제목굵기`, L.제목굵기, pick(/headingWeight:\s*([\d.]+)/));
  eq(`룩.${id}.제목자간`, L.제목자간, pick(/headingSpacing:\s*"([^"]*)"/));
  eq(`룩.${id}.제목행간`, L.제목행간, pick(/headingLineHeight:\s*([\d.]+)/));
  eq(`룩.${id}.본문행간`, L.본문행간, pick(/bodyLineHeight:\s*([\d.]+)/));
  eq(`룩.${id}.여백`, L.여백, pick(/pad:\s*([\d.]+)/));
  eq(`룩.${id}.제목위치`, L.제목위치, pick(/titlePos:\s*"(\w+)"/));
  eq(`룩.${id}.정렬`, L.정렬, pick(/align:\s*"(\w+)"/));
  eq(`룩.${id}.제목배율`, L.제목배율, pick(/titleScale:\s*([\d.]+)/));
  eq(`룩.${id}.본문배율`, L.본문배율, pick(/bodyScale:\s*([\d.]+)/));
}

// 기본 무드
eq('기본무드', mine.기본무드, src.match(/DEFAULT_MOOD_ID\s*=\s*"(\w+)"/)?.[1]);

if (bad.length) {
  console.error(`\n무드 정본이 원본과 어긋납니다 (${bad.length}건):`);
  for (const b of bad) console.error(`  · ${b}`);
  process.exit(1);
}
console.log(`무드 ${mine.무드.length}종 · 룩 ${Object.keys(mine.룩).filter((k) => !k.startsWith('_')).length}종 — 원본과 일치합니다.`);
