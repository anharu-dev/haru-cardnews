import { continueRender, delayRender, staticFile } from 'remotion';

/* 여기 없는 두께를 쓰면 브라우저가 가장 가까운 두께로 올려버린다 —
   마스트헤드가 600을 요청했는데 700(Bold)로 그려지던 원인이었다(2026-08-01). */
const FACES: Array<[string, string]> = [
  ['fonts/Pretendard-Light.woff2', '300'],
  ['fonts/Pretendard-Regular.woff2', '400'],
  ['fonts/Pretendard-Bold.woff2', '700'],
  ['fonts/Pretendard-ExtraBold.woff2', '800'],
];

/* 핸들은 성공하든 실패하든 반드시 푼다(.finally).
   @remotion/fonts의 loadFont()는 같은 family로 여러 두께를 부르면 일부 약속이 끝내 안 풀려서,
   폰트가 화면에 멀쩡히 나오는데도 벽시계 타이머가 timeout-2000ms에 터져 그때 그리던 프레임을
   죽였다 — 10초짜리 렌더는 통과하고 100초짜리만 죽던 진짜 원인(2026-08-13).
   여기서 직접 FontFace를 다루는 이유는 그 핸들의 수명을 우리가 쥐기 위해서다. */
const handle = delayRender('Pretendard 로딩');
Promise.all(
  FACES.map(async ([url, weight]) => {
    const face = new FontFace('Pretendard', `url(${staticFile(url)}) format('woff2')`, { weight });
    await face.load();
    document.fonts.add(face);
  }),
)
  .catch((e) => console.error('폰트를 못 불러와 기본 글꼴로 렌더합니다:', e))
  .finally(() => continueRender(handle));
