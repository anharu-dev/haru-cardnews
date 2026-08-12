import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

/* 여기 없는 두께를 쓰면 브라우저가 가장 가까운 두께로 올려버린다 —
   마스트헤드가 600을 요청했는데 700(Bold)로 그려지던 원인이었다(2026-08-01). */
const FACES: Array<[string, string]> = [
  ['fonts/Pretendard-Light.woff2', '300'],
  ['fonts/Pretendard-Regular.woff2', '400'],
  ['fonts/Pretendard-Bold.woff2', '700'],
  ['fonts/Pretendard-ExtraBold.woff2', '800'],
];
for (const [url, weight] of FACES) {
  loadFont({ family: 'Pretendard', url: staticFile(url), weight }).catch((e) => console.error('font', e));
}
