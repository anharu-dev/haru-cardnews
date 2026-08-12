import { Composition } from 'remotion';
import { MediaCard, MediaCardProps } from './MediaCard';
import './fonts';

// 데모 기본값 — 실제 사용 시 mediacards.mjs가 public/mediadecks/<덱>.json에서
// 카드마다 이 값들을 채워서 넘긴다. 여기 값은 studio 미리보기용 샘플일 뿐이다.
const MEDIA_DEFAULTS: MediaCardProps = {
  brand: { handle: '@내계정', accent: '#0066ff', kicker: '내 브랜드' },
  card: {
    clip: 'clips/sample/sample.mp4',
    label: '샘플 · 테스트 클립',
    title: '카드뉴스 자동화\n실화면 카드 렌더러',
    body: ['클립 하나 + 텍스트 몇 줄이면', '슬라이드별 4:5 영상이 완성됩니다.'],
  },
  durFrames: 300,
};

export const Root: React.FC = () => {
  return (
    <>
      {/* 실화면 카드: 슬라이드 1장 = 클립(mp4/png) 위에 라벨·제목·본문 */}
      <Composition
        id="MediaCard"
        component={MediaCard}
        fps={30}
        width={1080}
        height={1350}
        defaultProps={MEDIA_DEFAULTS}
        durationInFrames={MEDIA_DEFAULTS.durFrames}
        calculateMetadata={({ props }) => ({ durationInFrames: props.durFrames })}
      />
    </>
  );
};
