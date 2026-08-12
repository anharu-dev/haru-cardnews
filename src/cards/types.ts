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
};
