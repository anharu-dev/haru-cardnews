import { staticFile } from 'remotion';

/* 여기 없는 두께를 쓰면 브라우저가 가장 가까운 두께로 올려버린다 —
   마스트헤드가 600을 요청했는데 700(Bold)로 그려지던 원인이었다(2026-08-01). */
const FACES: Array<[string, string]> = [
  ['fonts/Pretendard-Light.woff2', '300'],
  ['fonts/Pretendard-Regular.woff2', '400'],
  ['fonts/Pretendard-Bold.woff2', '700'],
  ['fonts/Pretendard-ExtraBold.woff2', '800'],
];

/* ⚠ 여기에 delayRender를 다시 넣지 말 것 (2026-08-13, 실측으로 세 번 확인).

   폰트 로딩을 delayRender 핸들로 감싸면 렌더가 죽는다. 같은 family('Pretendard')로 네 두께를
   올리면 그중 하나의 준비 신호가 **끝내 안 온다** — FontFace.load() 약속도, document.fonts.ready도
   영영 안 풀린다. 폰트 자체는 화면에 멀쩡히 나오는데도 그렇다.
   그러면 핸들이 열린 채 남고, Remotion이 Node 쪽에서 재는 타이머가 timeout-2000ms에 터지면서
   그 순간 그리던 프레임을 죽인다. 300프레임 중 299까지 그리고 마지막에 죽던 원인이 이거다.
   렌더가 타임아웃보다 짧으면 통과하기 때문에 "가끔 되는" 것처럼 보여서 오래 숨어 있었고,
   --timeout을 90초로 올려둔 기존 대응은 결승선만 미루는 것이었다.

   시도해 봤지만 안 되는 것들:
   - @remotion/fonts의 loadFont() → 이게 원래 쓰던 방식이고, 바로 이 버그의 출처다
   - Promise.all(...).finally(continueRender) → 약속이 안 끝나니 finally도 안 돈다
   - 페이지 안 setTimeout으로 기한 걸기 → Remotion은 프레임 사이에 페이지를 멈춰 세워서
     그 타이머가 실시간으로 흐르지 않는다. 발화 자체를 안 한다
   - document.fonts.ready → 이것도 안 풀린다

   그래서 기다리지 않는다. face를 올려두면 브라우저가 알아서 불러 쓴다.
   대가: 아주 느린 컴퓨터라면 첫 프레임이 기본 글꼴로 나갈 수 있다(그 카드만 다시 렌더하면 된다).
   렌더 전체가 죽는 것보다 이쪽이 훨씬 낫다. */
for (const [url, weight] of FACES) {
  const face = new FontFace('Pretendard', `url(${staticFile(url)}) format('woff2')`, { weight });
  document.fonts.add(face);
  face.load().catch(() => {});   // 실패해도 무시 — 기본 글꼴로 나가고 렌더는 계속된다
}
