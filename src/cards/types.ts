// 카드뉴스 덱 스키마 — public/mediadecks/<이름>.json
// 카드 자체의 필드(clip·label·title·body…)는 src/MediaCard.tsx의 MediaCardDef에 있다.
//
// 2026-08-25 — 이 파일 전체가 옛 정의였다. `theme`·`surface`·`mood('minimal'|'frame'|'solid'|'photo')`는
// 2026-08-22 무드 재설계에서 없어졌는데 타입만 남아, 렌더러가 거부하는 값을 타입은 허용하고 있었다.
// 정의가 두 벌이면 한쪽만 고쳤을 때 어긋난다 — 실제 동작에 맞춰 다시 썼다.
export type DeckBrand = {
  /** 무드 id. **정본은 `public/moods.json`이다** — 여기에 목록을 복사해두지 않는다.
   *  값이 틀리면 `scripts/mediacards.mjs`가 렌더 전에 쓸 수 있는 무드 목록과 함께 막는다.
   *  생략하면 moods.json의 `기본무드`. */
  mood?: string;
  /** 강조색 hex. 주면 무드의 강조색만 덮어쓴다 — 자기 브랜드 색을 쓰는 자리. 예: "#1a7f5a" */
  accent?: string;
  /** 바탕색 hex. 주면 무드의 바탕만 덮어쓴다(예: "#0b1b2b").
   *  이 색의 밝기를 재서 제목·본문·칩 색이 자동으로 뒤집히고, 액센트도 이 바탕에서
   *  4.5:1 이상 대비가 나오게 자동 보정된다 — 사용자가 색 대비를 계산할 필요가 없다. */
  bg?: string;
  /** 종이질감 강도. 생략하면 없음 — `light`는 보일락 말락, `heavy`는 눈에 띄게.
   *  자료 창 위에는 안 깔린다(화면 녹화가 지저분해지므로). 켜면 파일이 커진다(입자는 압축이 잘 안 된다). */
  texture?: 'light' | 'heavy';
  /** 카드에 계정 표기를 넣을지. **기본은 끔**(2026-08-22).
   *  남의 계정 이름을 카드마다 새기는 건 그 사람이 원할 때만 할 일이다 — 인터뷰가 물어본다. */
  showHandle?: boolean;
  /** 표기할 문자열. `showHandle`이 꺼져 있으면 어디에도 안 나온다.
   *  `@`로 시작하면 handle, 아니면 wordmark로 받는다 — 렌더러는 wordmark를 먼저 본다. */
  handle?: string;
  wordmark?: string;
};

// (카드별 motion 옵션은 MediaCard.tsx의 MediaCardDef에 있다 — 여긴 덱 공통 설정만.)
