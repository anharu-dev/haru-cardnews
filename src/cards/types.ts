// 카드뉴스 덱 스키마 — public/mediadecks/<이름>.json
// 카드 자체의 필드(clip·label·title·body…)는 src/MediaCard.tsx의 MediaCardDef에 있다.
export type DeckBrand = {
  handle: string;        // 인스타 핸들 (예: @내계정)
  wordmark?: string;     // 카드 최상단 중앙에 조용히 박히는 표기 (기본 'AI 안하루')
  /** 강조색 hex. 주면 theme의 프리셋 액센트를 덮어쓴다 — 자기 브랜드 색을 쓰는 자리.
   *  예: "#1a7f5a". 바탕(흰색/블랙)은 바꿀 수 없다. */
  accent?: string;
  /** 무드 프리셋. 바꾸는 건 액센트 한 색뿐이고 판형(상단 블랙 존 + 하단 글 존)은 고정이다.
   *  mono-light(기본, 흑백) · claude(코랄) · gpt(딥코발트) · neon(레드, 속보) · gemini(구글 블루).
   *  mono-dark/white/ink/dark는 구버전 별칭이라 mono-light와 같게 동작한다 —
   *  검정 판형을 원하면 theme이 아니라 아래 surface를 'dark'로 준다. */
  theme?: 'mono-light' | 'mono-dark' | 'neon' | 'claude' | 'gemini' | 'gpt' | 'white' | 'ink' | 'dark';
  /** 하단 글 존 판형. 기본 'light'(순백). 'dark'면 카드 전체가 통짜 블랙이 된다. */
  surface?: 'light' | 'dark';
  /** 바탕색을 직접 지정한다(예: "#0b1b2b", "#cfe8ff"). surface보다 우선한다.
   *  이 색의 밝기를 재서 제목·본문·칩 색이 자동으로 뒤집히고, 액센트도 이 바탕에서
   *  4.5:1 이상 대비가 나오게 자동 보정된다 - 사용자가 색 대비를 계산할 필요가 없다. */
  bg?: string;
  /** 종이질감 강도. 기본 없음(순백 그대로) — `light`는 보일락 말락, `heavy`는 눈에 띄게.
   *  자료 창 위에는 안 깔린다(화면 녹화가 지저분해지므로). 2026-08-14: 켜고 끄고만 있던 걸
   *  강도 선택으로 넓혔다 — "선택"이라면서 실제로는 이진값 하나였다는 지적이 있었다. */
  texture?: 'light' | 'heavy';
  /** 표지 골격. 색이 아니라 **레이아웃**을 고르는 자리다(2026-08-22 신설).
   *  minimal 아이보리 + 헤어라인 프레임 (자료 없어도 됨, 기본값)
   *  frame   연한 색면 위 흰 창       (자료 선택 — 있으면 창에, 없으면 타이포)
   *  solid   액센트가 카드를 꽉 채움   (자료 필요 없음)
   *  photo   사진 전면 + 하단 색면 띠  (자료 필요)
   *  색은 여기서 정하지 않는다 — accent·bg로 따로 받는다. */
  mood?: 'minimal' | 'frame' | 'solid' | 'photo';
};

// (카드별 motion 옵션은 MediaCard.tsx의 MediaCardDef에 있다 — 여긴 덱 공통 설정만.)
