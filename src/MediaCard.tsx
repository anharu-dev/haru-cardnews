import type { CSSProperties } from 'react';
import { AbsoluteFill, Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame, Easing } from 'remotion';
import { DeckBrand } from './cards/types';

/** `*단어*` 강조를 그리는 유일한 자리.
    예전엔 CTA 분기와 일반 카드가 이 로직을 각각 복붙해 갖고 있어서 같은 종류 사고가 두 번 났다
    (2026-08-01 CTA 본문에 별표가 그대로 찍힘 / 2026-08-13 흑백 무드에서 제목 강조가 사라짐).
    한 곳으로 모아 둔 이유가 그거다 — 강조 규칙을 바꿀 땐 여기만 고친다. */
const emphasize = (text: string, style: CSSProperties) =>
  text.split(/\*([^*]+)\*/g).map((seg, j) =>
    j % 2 === 1 ? <span key={j} style={style}>{seg}</span> : <span key={j}>{seg}</span>,
  );

/* 줄 수는 `\n`만 세면 안 된다 — 브라우저가 폭에 맞춰 저절로 접은 줄까지 세야 실제 높이가 나온다.
   예전엔 `\n` 개수만 세서, 긴 제목·본문이 카드 아래로 흘러 나가도 축소(fit)가 안 걸렸다(2026-08-13).
   한글·가나·한자는 약 1em, 그 밖(영문·숫자·기호·공백)은 약 0.5em으로 친다. 브라우저 실측 없이
   쓰는 어림이라 정확하진 않지만, 넉넉히 잡아 **넘침을 막는 쪽으로만** 틀린다. */
const CJK = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿︰-﹏＀-｠]/;
const lineCount = (s: string, fontSize: number, tracking: number, boxW: number) => {
  const em = [...s.replace(/\*/g, '')].reduce((w, ch) => w + (CJK.test(ch) ? 1 : 0.5), 0);
  return Math.max(1, Math.ceil(em / (boxW / (fontSize * (1 + tracking)))));
};

/**
 * 실화면 카드(레퍼런스 정합): 상단 = 실제 화면 녹화 클립이 라운드 창에서 재생,
 * 하단 = 화이트 텍스트 존(제목 + 본문 줄들). 슬라이드 1장 = 영상 1개.
 * 한 문장 = 한 줄(body 배열이 곧 줄바꿈).
 *
 * theme: 'ink'(기본) = 잉크 상단 존에 창이 뜸 / 'white' = 순백 바탕에 헤어라인 창.
 * 클립이 대개 밝은 UI 화면이라 잉크가 기본 — 창 경계가 서고 흰 카드뿐인 피드에서 눈에 걸린다.
 * 덱 brand.theme 으로 덮어쓴다.
 */
export type MediaCardDef = {
  clip?: string;           // clips/<...>.mp4 또는 .png/.jpg. cta 카드는 생략
  clipW?: number;          // 자료 실측 픽셀 — 렌더 스크립트가 채운다. 없으면 16:9 간주
  clipH?: number;
  label?: string;          // 창 아래 캡션 (예: 출처명 · CASE 01)
  title: string;
  body: string[];
  /** 카드 길이(초) 직접 지정. 렌더 스크립트가 읽으며, 지정해도 10~20초 안으로 맞춰진다 */
  duration?: number;
  /** 전면 판형 — 자료가 카드를 꽉 채우고, 하단 그라데이션 위에 흰 글자를 얹는다.
   *  사진·생성이미지처럼 '보여주는 게 주인공'인 자료용. 화면 녹화(16:9 UI)는 기본 창 판형이 낫다 —
   *  전면으로 깔면 4:5에 맞추느라 좌우가 크게 잘려서 정작 봐야 할 UI가 날아간다. */
  full?: boolean;
  /** 사진·이미지 소스에 켄번즈(천천히 확대)를 걸어 mp4로 뽑는다. 기본 false — 정지 이미지 그대로 png.
   *  화면 녹화(mp4)는 이 필드와 무관하게 항상 그 자체로 영상이다. 완성된 사진(스톡·자체 촬영)에
   *  합성 확대를 억지로 걸면 안 하느니만 못하다는 게 기본 판단이라, 원할 때만 켠다(2026-08-13). */
  motion?: boolean;
  cta?: boolean;           // 마지막 장 전용 — 창 없이 타이포 중앙 배치(실자료 규칙의 유일한 예외)
  keyword?: string;        // cta 카드의 댓글 키워드 — "댓글에 '키미'" 알약으로 박힌다
  action?: string;         // cta 알약 문구 — '팔로우' | '공유하기' | '저장하기' … 기본 '팔로우'
  /** @deprecated 출처는 본문 문장에 녹인다 — 별도 줄로 찍지 않는다(2026-07-31) */
  source?: string;
  /** 카드 왼쪽 위 작은 라벨 칩(예: "TREND"·"HOW TO"). 짧은 한두 단어만 — 줄바꿈 없이 한 줄로 찍힌다.
   *  cta 카드에는 안 붙는다. 색은 브랜드 무드를 그대로 따르고 사용자가 못 바꾼다(2026-08-13). */
  badge?: string;
  /** 비교(vs) 카드 — 미디어 없이 두 항목을 나란히 대비시키는 타이포 판형.
   *  clip·full과 같이 못 쓴다(그러면 그냥 무시되고 비교 판형이 이긴다). */
  compare?: { left: { label: string; text: string }; right: { label: string; text: string } };
  /** 단계(steps) 카드 — 미디어 없이 번호 매긴 목록을 세로로 나열하는 타이포 판형. 3~5개 권장,
   *  그 이상이면 한 카드에 다 안 들어가 자동으로 줄어들다 못해 잘릴 수 있다. */
  steps?: string[];
  /** 표지 카드 — 무드(brand.mood)에 따라 레이아웃 자체가 달라지는 유일한 카드다. 덱의 1장에 쓴다. */
  cover?: boolean;
  /** 표지 상단 킥 라벨 한 줄. 레퍼런스 24종 중 거의 전부에 있다. */
  kicker?: string;
};

/** 덱 전체의 글 분량 — 글자 배율을 카드마다가 아니라 덱 단위로 맞추려고 렌더 스크립트가 넘긴다. */
export type DeckSummary = {
  title: string; body?: string[]; label?: string; cta?: boolean;
  compare?: unknown; steps?: unknown; // 있으면 자기 혼자 기준으로 줄이는 카드 — 덱 배율 계산에서 뺀다
};

export type MediaCardProps = {
  brand: DeckBrand;
  card: MediaCardDef;
  durFrames: number;
  deck?: DeckSummary[];
};

/* ── 레이아웃 (1080×1350) ─────────────────────────────────────────────
   여백 하나(M)로 창과 텍스트 컬럼의 좌측을 맞춘다. 예전엔 창 50 / 텍스트 96 으로 어긋나 있었다. */
const M = 56;
const MEDIA_ZONE_W = 1080 - M * 2; // 968 — 미디어 존 폭(고정)
const MEDIA_ZONE_H = 545;          // 미디어 존 높이(고정) = 16:9가 폭에 꽉 차는 값
const MEDIA_TOP = 106;   // 마스트헤드(상단 중앙) 자리를 비워둔다
const LABEL_GAP = 25;              // 창 ↔ 캡션
const LABEL_H = 31;                // 캡션 실높이(25px 폰트)
const TEXT_GAP = 56;               // 캡션 ↔ 제목
const BOTTOM_SAFE = 96;            // 이 아래로는 글자가 내려가지 않는다

const TEXT_W = 1080 - M * 2;       // 텍스트 컬럼 폭 — 미디어 존과 같은 968
const TITLE_SIZE = 92;
const TITLE_LH = 1.14;
const TITLE_TRACK = -0.035;        // 제목 자간(em) — 높이 계산과 실제 렌더가 같은 값을 써야 한다
const BODY_SIZE = 43;
const BODY_LH = 1.56;
const BODY_TRACK = -0.012;         // 본문 자간(em)
const BODY_GAP = 36;

/* ── 무드 팔레트 ───────────────────────────────────────────────────────
   흑백 2종이 기본값(혁신 정보·실구동 영상·X 자료), X 영상이 주면 mono-dark 통짜.
   neon = 임팩트 속보(검정+네온 레드). claude/gemini/gpt = 해당 주제 전용 브랜드 무드.
   포인트 컬러는 캡션(라벨) 한 곳에만 — 본문·제목은 무드와 무관하게 침묵한다. */
type Theme = {
  page: string;
  topZone: string | null;
  ink: string;
  body: string;
  label: string;
  labelGlow: string;
  accent: string;        // 제목 *하이라이트* 색 — 무드의 존재감은 여기서 나온다
  accentDark: string;    // 통짜 블랙 판형에서 쓰는 액센트(흰 바탕용 진한 톤은 검정에서 죽는다)
  inkDark: string;       // 통짜 블랙 판형의 제목 색
  ring: string;
  shadow: string;
  chipBg: string;
  chipText: string;
};

/**
 * 마스트헤드 — 카드 최상단 중앙. 잡지 제호처럼 얇고 넓은 자간으로.
 * 하단 우측에 두면 아래만 잘라 퍼가기 쉬워서 위로 올렸다 — 여길 자르면 화면(자료)이 같이 날아간다.
 */
const Masthead: React.FC<{ text?: string; color: string }> = ({ text, color }) =>
  text ? (
    <div
      style={{
        position: 'absolute', left: 0, right: 0, top: 50, textAlign: 'center',
        /* 얇고 자간 넓게 — 로고가 아니라 워터마크다(2026-08-01 반려).
           300은 fonts.ts에 실제로 로드된 두께여야 한다. 없는 두께를 쓰면 700으로 올라간다. */
        fontFamily: 'Pretendard', fontSize: 19, fontWeight: 300,
        letterSpacing: '0.26em', color, opacity: 0.34,
      }}
    >
      {text}
    </div>
  ) : null;

/**
 * 라벨 칩 — 카드 왼쪽 위, 마스트헤드와 같은 높이대. "장식은 템플릿이 정하고 사용자는 텍스트만
 * 준다"는 원칙으로 만들었다(2026-08-13) — 위치·크기·색은 고정, 문구 한 줄만 바뀐다.
 * 색은 새로 만들지 않고 CTA 알약·코드칩과 같은 chipBg/chipText를 그대로 쓴다 — 그 둘은 이미
 * light/dark 판형 양쪽에서 대비가 검증된 조합이라, 배지만 따로 새 색을 정하면 그게 새 사고 지점이 된다.
 */
const Badge: React.FC<{ text?: string; bg: string; fg: string }> = ({ text, bg, fg }) =>
  text ? (
    <div
      style={{
        position: 'absolute', left: M, top: 40, zIndex: 5,
        padding: '11px 24px', borderRadius: 999, background: bg, color: fg,
        fontFamily: 'Pretendard', fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  ) : null;

/* 색 원칙 (2026-07-30 확정)
   - 블랙은 **중립 근사 블랙 하나**로 통일한다. 차콜·네이비·웜그레이 같은 틴트 섞기 금지 —
     애매한 회색 바탕이 요즘 AI 슬롭의 표식이다. 순검정보다 한 단계만 낮춰 눈만 덜 아프게.
   - 무드 정체성은 배경이 아니라 **액센트 한 색**이 낸다.
   - 판형은 무드와 무관하게 하나다(2026-08-01): 상단 블랙 존 + 하단 순백. 라이트/다크 교대는 폐기. */
const BLACK = '#0d0d0d';        // 상단 미디어 존 공용 중립 블랙
const INK = '#101010';          // 제목 잉크
const BODY_L = '#2b2f33';       // 본문 — 흰 바탕 대비 13:1 (2026-08-01: #43474b에서 더 진하게)

/* 판형 통일 (2026-08-01 반려 — "하단 텍스트 배경 화이트로, 대비 높여").
   예전엔 다크 3종이 통짜 블랙이라 본문이 회색(#b7bbc0)으로 떠서 흐릿했다.
   이제 **모든 무드가 같은 판형**이다: 상단 = 블랙 존(자료 창 + 출처 캡션), 하단 = 순백 + 진한 잉크.
   무드 정체성은 배경이 아니라 **액센트 한 색**이 낸다 — 그래서 액센트는 전부 흰 바탕에서
   읽히는 채도로 다시 잡았다(옛 다크 전용 액센트는 흰 바탕에서 물에 탄 것처럼 보였다). */
const mood = (o: {
  label: string; accent: string; accentDark?: string; inkDark?: string;
  ring?: string; shadow?: string; chipBg?: string; chipText?: string;
}): Theme => ({
  page: '#ffffff',
  topZone: BLACK,
  ink: INK,
  body: BODY_L,
  label: o.label,
  labelGlow: 'none',
  accent: o.accent,
  accentDark: o.accentDark ?? o.accent,
  inkDark: o.inkDark ?? '#ffffff',
  ring: o.ring ?? 'rgba(255,255,255,0.14)',
  shadow: o.shadow ?? '0 24px 48px -20px rgba(0,0,0,0.62)',
  chipBg: o.chipBg ?? BLACK,
  chipText: o.chipText ?? '#e9eaec',
});

const MONO_MOOD = mood({
  label: 'rgba(255,255,255,0.64)', accent: INK,
  // 통짜 블랙에서 흑백 무드는 '흰 하이라이트 vs 조금 죽인 제목'으로 대비를 낸다
  accentDark: '#ffffff', inkDark: '#d5d8db',
});

/* 통짜 블랙 판형 (2026-08-05 제작자 지시 — 이 덱 포함 3편 시험).
   2026-08-01에 다크를 폐기한 이유는 '검정이라서'가 아니라 **본문이 #b7bbc0 회색으로 떠서 흐릿**했기 때문이다.
   그래서 부활시키되 본문을 #e6e8ea로 올려 대비 15:1을 확보한다. 회색 본문으로 되돌리지 말 것. */
const BODY_D = '#e6e8ea';

/* -- 임의 배경색 지원 (2026-08-21 신설) ------------------------------------------
   기존엔 바탕이 흰색/블랙 두 가지뿐이라 "하늘색으로 해줘" 같은 요청을 못 받았다.
   brand.bg에 아무 hex나 주면, 그 색의 상대 휘도(WCAG)를 재서 제목·본문·칩 색을
   자동으로 뒤집는다 - 사용자가 색 대비까지 신경 쓰지 않게 하는 게 요점이다. */
const hexToRgb = (hex: string): [number, number, number] => {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const luminance = (hex: string): number => {
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const [r, g, b] = hexToRgb(hex).map((v) => f(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastRatio = (a: string, b: string): number => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
const pickOn = (bg: string, dark: string, light: string) =>
  contrastRatio(bg, dark) >= contrastRatio(bg, light) ? dark : light;
/* 액센트가 배경에서 안 읽히면(4.5:1 미만) 읽힐 때까지 밝기를 민다 */
const fitAccent = (accent: string, bg: string): string => {
  if (contrastRatio(accent, bg) >= 4.5) return accent;
  const toDarkSide = luminance(bg) > 0.5;
  let [r, g, b] = hexToRgb(accent);
  for (let i = 0; i < 24; i++) {
    const k = toDarkSide ? 0.88 : 1.14;
    const add = toDarkSide ? 0 : 8;
    r = Math.max(0, Math.min(255, Math.round(r * k + add)));
    g = Math.max(0, Math.min(255, Math.round(g * k + add)));
    b = Math.max(0, Math.min(255, Math.round(b * k + add)));
    const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    if (contrastRatio(hex, bg) >= 4.5) return hex;
  }
  return pickOn(bg, '#101010', '#ffffff');
};
const toCustomBg = (t: Theme, bg: string): Theme => {
  const ink = pickOn(bg, INK, '#ffffff');
  const isLightBg = luminance(bg) > 0.5;
  return {
    ...t,
    page: bg,
    ink,
    body: isLightBg ? BODY_L : BODY_D,
    accent: fitAccent(t.accent === t.ink ? ink : t.accent, bg),
    ring: isLightBg ? 'rgba(16,16,16,0.14)' : 'rgba(255,255,255,0.17)',
    shadow: isLightBg ? '0 24px 48px -20px rgba(0,0,0,0.35)' : '0 24px 48px -20px rgba(0,0,0,0.9)',
    chipBg: ink,
    chipText: pickOn(ink, INK, '#ffffff'),
  };
};

const toDark = (t: Theme): Theme => ({
  ...t,
  page: BLACK,
  ink: t.inkDark,
  body: BODY_D,
  accent: t.accentDark,
  ring: 'rgba(255,255,255,0.17)',
  shadow: '0 24px 48px -20px rgba(0,0,0,0.9)',
  // 알약·코드칩은 바탕과 반대색이라 블랙 판형에선 흰색으로 뒤집힌다
  chipBg: '#ffffff',
  chipText: BLACK,
});

const THEMES: Record<string, Theme> = {
  'mono-light': MONO_MOOD,
  // Anthropic·Claude 주제 전용 — 코랄
  claude: mood({ label: '#e08a6b', accent: '#c2572f', accentDark: '#f08b64' }),
  // OpenAI·GPT 주제 전용 — 안하루 딥코발트
  gpt: mood({ label: '#7aa5f5', accent: '#0047ab', accentDark: '#7aa5f5' }),
  // 임팩트 속보 — 레드(흰 바탕용으로 채도를 낮춰 잡았다. #ff2e4d는 흰 바탕에서 3.7:1로 흐리다)
  neon: mood({
    label: '#ff5c74',
    accent: '#d40f2c',
    accentDark: '#ff2e4d',      // 검정에선 원래의 네온 레드가 산다
    ring: 'rgba(255,46,77,0.34)',
    // 창 주변 붉은 발광은 반려됐다 — 임팩트는 ring 한 줄로 낸다. 글로우는 AI 슬롭의 표식이다.
    shadow: '0 24px 48px -20px rgba(0,0,0,0.75)',
  }),
  // Google·Gemini 주제 전용 — 구글 블루(흰 바탕용 진한 톤)
  gemini: mood({ label: '#7ab6f0', accent: '#1263cf', accentDark: '#5b9dfa' }),
};

/* 2026-08-22 — 여기 'mono-dark' / 'white' / 'ink' / 'dark' 네 이름이 전부 MONO_MOOD를
   가리키는 별칭으로 있었다. 이름이 9개인데 결과는 5가지라, 배포하면 사용자는 "dark를
   골랐는데 왜 안 어둡지"에서 막힌다 — 조용히 흑백 라이트가 나오니 원인도 안 보인다.
   무드는 **액센트 한 색만** 정하고, 밝기는 surface·bg가 정한다(축이 둘). 별칭을 지워
   그 경계를 흐리지 않는다. 어둡게 하려면 surface:'dark' 또는 bg를 쓴다.
   쓰는 덱이 하나도 없는 걸 확인하고 지웠다. */
export const MOOD_NAMES = Object.keys(THEMES);

/** 본문 줄 중 '명령어/경로'인 줄 — 회색 본문으로 흘리지 않고 코드 칩으로 묶어 보여준다. */
const isCodeLine = (s: string) =>
  !/[가-힣]/.test(s) &&
  (/^(npx|npm|pnpm|yarn|pip|git|curl|brew|node|uv|docker)\s/.test(s.trim()) ||
    /^https?:\/\//.test(s.trim()) ||
    /^[\w.@-]+\/[\w./-]+$/.test(s.trim()));

type Block = { kind: 'text'; text: string } | { kind: 'code'; text: string };

/** 연속한 코드 줄은 한 칩으로 합친다 ("npx skills add" + "user/repo" → 한 줄 명령어). */
const toBlocks = (lines: string[]): Block[] => {
  const out: Block[] = [];
  for (const line of lines) {
    if (isCodeLine(line)) {
      const last = out[out.length - 1];
      if (last && last.kind === 'code') last.text += ` ${line.trim()}`;
      else out.push({ kind: 'code', text: line.trim() });
    } else {
      out.push({ kind: 'text', text: line });
    }
  }
  return out;
};

const MONO = "ui-monospace, 'Cascadia Mono', Consolas, 'SF Mono', Menlo, monospace";

/* 종이질감 — brand.texture로 켜는 선택 항목이고 기본은 꺼져 있다(순백 그대로).
   feTurbulence는 시드가 고정이라 프레임마다 같은 무늬가 나온다 — 렌더 결정성이 깨지지 않는다.
   "켜고 끄고"만 있던 걸 강도 2단으로 나눴다(2026-08-14) — 안 보이면 선택한 의미가 없고,
   너무 세면 그냥 노이즈로 보인다("입자가 보일락 말락 해야 종이지" 원칙은 옅게 쪽에 그대로
   남기고, 진하게는 눈에 띄게 다른 값을 준다). 인스타 압축에서 더 뭉개지는 것도 감안. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
const GRAIN_OPACITY: Record<'light' | 'heavy', number> = { light: 0.05, heavy: 0.13 };

const Grain: React.FC<{ level?: 'light' | 'heavy' }> = ({ level }) =>
  level ? (
    <div
      style={{
        position: 'absolute', inset: 0, backgroundImage: GRAIN,
        opacity: GRAIN_OPACITY[level], mixBlendMode: 'multiply', pointerEvents: 'none',
      }}
    />
  ) : null;

/** 카드 한 장의 글이 글 존에 들어가는 배율 — 1보다 크면 여유가 남고, 작으면 넘친다. */
const fitRatio = (c: { title: string; body?: string[]; label?: string }) => {
  const titleH =
    c.title.split('\n').reduce((n, l) => n + lineCount(l, TITLE_SIZE, TITLE_TRACK, TEXT_W), 0)
    * TITLE_SIZE * TITLE_LH;
  const blocks = toBlocks(c.body ?? []);
  const bodyH = blocks.reduce(
    (h, b) => h + (b.kind === 'code'
      ? BODY_SIZE * 1.5 + 28
      : lineCount(b.text, BODY_SIZE, BODY_TRACK, TEXT_W) * BODY_SIZE * BODY_LH),
    0,
  );
  const needed = titleH + (blocks.length ? BODY_GAP + bodyH : 0);
  const textTop = MEDIA_TOP + MEDIA_ZONE_H + LABEL_GAP + (c.label ? LABEL_H : 0) + TEXT_GAP;
  return (1350 - BOTTOM_SAFE - textTop) / Math.max(1, needed);
};

export const MediaCard: React.FC<MediaCardProps> = ({ brand, card, durFrames, deck }) => {
  const frame = useCurrentFrame();
  const preset = THEMES[brand.theme ?? 'mono-light'] ?? THEMES['mono-light'];
  /* brand.accent(hex)로 프리셋 액센트를 덮어쓴다 — 자기 브랜드 색을 쓰라고 열어둔 자리다.
     바탕(흰색/블랙)은 못 바꾼다: 판형이 흔들리면 카드가 아마추어로 보이고, 무드 정체성은
     배경이 아니라 액센트 한 색이 내는 게 이 포맷의 원칙이다. */
  const base = brand.accent
    ? { ...preset, accent: brand.accent, accentDark: brand.accent }
    : preset;
  /* 우선순위: brand.bg(임의 색) > surface:'dark' > 기본 흰 바탕 */
  const t = brand.bg
    ? toCustomBg(brand.surface === 'dark' ? toDark(base) : base, brand.bg)
    : brand.surface === 'dark' ? toDark(base) : base;

  /* 흑백 무드는 액센트가 제목 잉크와 같은 색이라(MONO_MOOD) 제목 *강조*가 색으로는 사라진다 —
     기본 무드가 이거라서, 강조 문법을 처음 써본 사람은 아무 일도 안 일어나는 걸 본다(2026-08-13).
     무드 정체성이 '색 없음'인 건 의도한 설계라 색을 넣지 않고, 그때만 색면으로 표시한다.
     밑줄이 아니라 색면인 이유: 밑줄은 한글 받침을 갉아먹는다. */
  const titleEmph: CSSProperties = t.accent === t.ink
    ? {
        background: brand.surface === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(16,16,16,0.11)',
        borderRadius: 8, padding: '0 0.10em',
        boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone',
      }
    : { color: t.accent };
  // 본문 강조는 어느 무드에서나 색이 아니라 굵기로 준다 — 한 카드에 색이 두 군데면 시선이 갈라진다.
  const bodyEmph: CSSProperties = { fontWeight: 700, color: t.ink };

  /* 0프레임부터 카드가 완성돼 있어야 한다 — 인스타는 첫 프레임을 피드 썸네일로 쓰고,
     슬라이드는 루프 재생된다. 등장 페이드인·끝 페이드아웃은 썸네일 공백과 검은 깜빡임을 만든다.
     모션은 '이미 보이는 것'을 거드는 데까지만: 창이 0.6% 앉는 정도, 글자는 건드리지 않는다. */
  const settle = interpolate(frame, [0, 12], [0.994, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  // 이미지 자료의 Ken Burns — 내용을 확대하면 인용 자료 가장자리가 깎이므로,
  // 창 '자체'가 천천히 커진다(내용 크롭 0, 움직임은 유지).
  const clipSrc = card.clip ?? '';
  const isImageClip = /\.(png|jpe?g|webp)$/i.test(clipSrc);
  const kb = isImageClip ? 1 + (frame / Math.max(1, durFrames)) * 0.015 : 1;

  const blocks = toBlocks(card.body);
  const titleLines = card.title.split('\n');

  /* ── 표지(cover) — 무드가 레이아웃까지 바꾸는 유일한 자리 ────────────────────
     2026-08-22 재설계. 그전까지 '무드'는 액센트 한 색만 바꿨다. 5종을 뽑아 나란히
     놓으니 색만 다른 같은 카드였고, "그럴 거면 색을 물어보는 게 낫다"는 반려를 받았다.

     미리캔버스 카드뉴스 템플릿 24종을 실제로 받아서 확인한 사실(2026-08-22):
     · 흰 바탕에 글자만 놓은 건 **0개**다. 전부 색면·사진·프레임·일러스트로 차 있다
     · 사진 없이 성립하는 게 대다수 — 색면과 큰 타이포만으로 만든다
     · 거의 전부 상단에 킥 라벨 한 줄이 있다("초보자를 위한 입문 가이드" 같은)
     그래서 무드를 **골격 4종**으로 다시 잡았다. 색(accent)은 무드에서 떼어 따로 받는다.

     minimal 아이보리 바탕 + 헤어라인 프레임 + 큰 타이포   (자료 없어도 됨)
     frame   연한 색면 위에 흰 창, 그 안에 내용            (자료 선택)
     solid   액센트가 카드를 꽉 채우고 흰 글씨              (자료 필요 없음)
     photo   사진 전면 + 하단 색면 띠에 제목                (자료 필요) */
  if (card.cover) {
    const mood = brand.mood ?? 'minimal';
    const accent = t.accent;
    const hasAccent = accent !== t.ink;
    const kicker = card.kicker;

    /* 표지 제목은 본문 카드보다 크다 — 레퍼런스가 전부 그렇다. 넘치면 줄인다(키우진 않는다:
       표지는 원래 글이 짧아서, 키우면 두세 글자짜리 제목이 카드를 잡아먹는다). */
    const coverFit = (size: number, w: number, room: number) => {
      const h = titleLines.reduce((n, l) => n + lineCount(l, size, TITLE_TRACK, w), 0) * size * TITLE_LH;
      return Math.min(1, room / Math.max(1, h));
    };

    const Kicker: React.FC<{ bg: string; fg: string; border?: string }> = ({ bg, fg, border }) =>
      kicker ? (
        <div
          style={{
            display: 'inline-block', padding: '14px 28px', borderRadius: 999,
            background: bg, color: fg, border: border ?? 'none',
            fontFamily: 'Pretendard', fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em',
          }}
        >
          {kicker}
        </div>
      ) : null;

    /* 색면(solid·photo 띠) 위의 제목 강조. 액센트로 칠하면 바탕이 이미 그 액센트라 사라진다 —
       흰 글씨 위에서는 반투명 흰 색면으로 띄운다. 이걸 안 쓰고 {l}을 그대로 찍었다가
       별표가 화면에 그대로 나갔다(2026-08-22). CTA에서 똑같은 사고가 있었다(2026-08-01) —
       강조는 어느 판형에서든 반드시 emphasize()를 거친다. */
    const onFillEmph = (on: string): CSSProperties => ({
      background: on === '#ffffff' ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.10)',
      borderRadius: 8, padding: '0 0.10em',
      boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone',
    });

    const Handle: React.FC<{ color: string }> = ({ color }) => (
      <div
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 64, textAlign: 'center',
          fontFamily: 'Pretendard', fontSize: 26, fontWeight: 600, color,
          letterSpacing: '0.08em',
        }}
      >
        {brand.wordmark ?? brand.handle ?? ''}
      </div>
    );

    /* ── minimal — 아이보리 바탕 + 안쪽 헤어라인 프레임 ──────────────────
       "배경이 비면 안 된다"의 가장 조용한 해법: 색면 대신 **프레임**이 공간을 잡는다.
       종이 위에 인쇄한 것처럼 보이게 아이보리로 살짝 눕힌다(순백은 화면에서 빈 느낌이 난다). */
    if (mood === 'minimal') {
      const page = brand.bg ?? '#f7f5f0';
      const ink = pickOn(page, INK, '#ffffff');
      const line = `color-mix(in srgb, ${ink} 22%, ${page})`;
      const fit = coverFit(96, 1080 - 200 - 96, 560);
      return (
        <AbsoluteFill style={{ backgroundColor: page }}>
          <Grain level={brand.texture ?? 'light'} />
          <div style={{ position: 'absolute', inset: 40, border: `2px solid ${line}`, borderRadius: 8 }} />
          <div
            style={{
              position: 'absolute', left: 100, right: 100, top: 0, bottom: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', textAlign: 'center', gap: 44,
            }}
          >
            <Kicker bg="transparent" fg={ink} border={`2px solid ${line}`} />
            <div
              style={{
                fontFamily: 'Pretendard', fontSize: 96 * fit, fontWeight: 800, color: ink,
                letterSpacing: `${TITLE_TRACK}em`, lineHeight: TITLE_LH,
                wordBreak: 'keep-all', overflowWrap: 'anywhere',
              }}
            >
              {titleLines.map((l, i) => <div key={i}>{emphasize(l, titleEmph)}</div>)}
            </div>
            {/* 제목 아래 짧은 규칙선 — 레퍼런스가 제목과 발신자 사이를 이렇게 끊는다 */}
            <div style={{ width: 120, height: 3, background: hasAccent ? accent : line }} />
            {card.body.length ? (
              <div
                style={{
                  fontFamily: 'Pretendard', fontSize: 34, fontWeight: 400,
                  color: `color-mix(in srgb, ${ink} 68%, ${page})`,
                  lineHeight: 1.6, wordBreak: 'keep-all', maxWidth: 720,
                }}
              >
                {card.body.map((l, i) => <div key={i}>{emphasize(l, bodyEmph)}</div>)}
              </div>
            ) : null}
          </div>
          <Handle color={`color-mix(in srgb, ${ink} 52%, ${page})`} />
        </AbsoluteFill>
      );
    }

    /* ── solid — 액센트가 카드를 통째로 채운다 ────────────────────────────
       자료가 하나도 없는 사람의 기본값. 색이 없으면(흑백 무드) 잉크로 채운다 —
       비교·단계 카드가 쓰는 "색이 아니라 채움으로 대비를 낸다"와 같은 원칙. */
    if (mood === 'solid') {
      const fill = brand.bg ?? (hasAccent ? accent : INK);
      const on = pickOn(fill, INK, '#ffffff');
      const sub = on === '#ffffff' ? 'rgba(255,255,255,0.74)' : 'rgba(16,16,16,0.66)';
      const fit = coverFit(104, 1080 - M * 2 - 40, 620);
      return (
        <AbsoluteFill style={{ backgroundColor: fill }}>
          <Grain level={brand.texture} />
          {/* 통짜 색면이 밋밋해지지 않게 큰 원 하나를 아주 옅게 깐다(글자 대비는 건드리지 않는다) */}
          <div
            style={{
              position: 'absolute', right: -220, top: -180, width: 720, height: 720,
              borderRadius: 999, background: on === '#ffffff' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
            }}
          />
          <div
            style={{
              position: 'absolute', left: M + 20, right: M + 20, top: 0, bottom: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              justifyContent: 'center', gap: 40,
            }}
          >
            <Kicker bg={on === '#ffffff' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)'} fg={on} />
            <div
              style={{
                fontFamily: 'Pretendard', fontSize: 104 * fit, fontWeight: 800, color: on,
                letterSpacing: `${TITLE_TRACK}em`, lineHeight: TITLE_LH,
                wordBreak: 'keep-all', overflowWrap: 'anywhere',
              }}
            >
              {titleLines.map((l, i) => <div key={i}>{emphasize(l, onFillEmph(on))}</div>)}
            </div>
            {card.body.length ? (
              <div
                style={{
                  fontFamily: 'Pretendard', fontSize: 36, fontWeight: 400, color: sub,
                  lineHeight: 1.62, wordBreak: 'keep-all', maxWidth: 800,
                }}
              >
                {card.body.map((l, i) => <div key={i}>{emphasize(l, { fontWeight: 700, color: on })}</div>)}
              </div>
            ) : null}
          </div>
          <Handle color={sub} />
        </AbsoluteFill>
      );
    }

    /* ── photo — 사진 전면 + 하단 색면 띠 ────────────────────────────────
       레퍼런스에서 사진형 표지는 사진 위에 글자를 얹지 않는다. **띠를 깔고 그 위에** 얹는다 —
       사진이 어떤 색이든 글자 대비가 보장되기 때문이다(우리 full 판형이 그라데이션 스크림으로
       버티다 어두운 사진에서 무너졌던 것과 같은 문제를, 레퍼런스는 띠로 푼다). */
    if (mood === 'photo') {
      const bandH = 552;   // 핸들(하단 중앙)과 본문이 27px까지 붙던 걸 띄운다(2026-08-22 실측)
      const band = brand.bg ?? (hasAccent ? accent : INK);
      const on = pickOn(band, INK, '#ffffff');
      const sub = on === '#ffffff' ? 'rgba(255,255,255,0.76)' : 'rgba(16,16,16,0.66)';
      const fit = coverFit(84, 1080 - M * 2 - 40, 300);
      return (
        <AbsoluteFill style={{ backgroundColor: band }}>
          {clipSrc ? (
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 1350 - bandH, overflow: 'hidden' }}>
              {isImageClip ? (
                <Img src={staticFile(clipSrc)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${kb})` }} />
              ) : (
                <OffthreadVideo src={staticFile(clipSrc)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>
          ) : null}
          <div
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, height: bandH,
              background: band, padding: `48px ${M + 20}px 0`,
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 30,
            }}
          >
            <Kicker bg={on === '#ffffff' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)'} fg={on} />
            <div
              style={{
                fontFamily: 'Pretendard', fontSize: 84 * fit, fontWeight: 800, color: on,
                letterSpacing: `${TITLE_TRACK}em`, lineHeight: TITLE_LH,
                wordBreak: 'keep-all', overflowWrap: 'anywhere',
              }}
            >
              {titleLines.map((l, i) => <div key={i}>{emphasize(l, onFillEmph(on))}</div>)}
            </div>
            {card.body.length ? (
              <div style={{ fontFamily: 'Pretendard', fontSize: 32, fontWeight: 400, color: sub, lineHeight: 1.6, wordBreak: 'keep-all' }}>
                {emphasize(card.body[0], { fontWeight: 700, color: on })}
              </div>
            ) : null}
          </div>
          <Handle color={sub} />
        </AbsoluteFill>
      );
    }

    /* ── frame — 연한 색면 위에 흰 창 ────────────────────────────────────
       자료가 있으면 창 안에 넣고, 없으면 창 안이 타이포로 찬다. 자료 유무로 갈리지 않는
       유일한 무드라 인터뷰에서 기본으로 권하기 좋다. */
    const wash = brand.bg ?? (hasAccent ? `color-mix(in srgb, ${accent} 14%, #ffffff)` : '#eceae5');
    const ink = INK;
    const fit = coverFit(78, 1080 - 96 * 2 - 88, clipSrc ? 260 : 480);
    return (
      <AbsoluteFill style={{ backgroundColor: wash }}>
        <Grain level={brand.texture} />
        {/* 창 높이를 top/bottom으로 못박아 뒀더니, 자료 없는 표지에서 창의 아래 3분의 2가
            텅 빈 채로 남았다(2026-08-22 실측, 창 채움 23%). 비교·단계 카드에서 이미 두 번
            겪은 병이다 — **자료가 있을 때만 창을 크게 잡고, 없으면 내용 높이에 맞춘다.**
            세로 중앙은 transform으로 유지한다. */}
        <div
          style={{
            position: 'absolute', left: 76, right: 76,
            ...(clipSrc
              ? { top: 120, bottom: 150 }
              : { top: '50%', transform: 'translateY(-50%)' }),
            background: '#ffffff', borderRadius: 36,
            boxShadow: '0 30px 60px -24px rgba(0,0,0,0.22)',
            padding: clipSrc ? 56 : 72, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 34,
          }}
        >
          <Kicker bg={hasAccent ? `color-mix(in srgb, ${accent} 16%, #ffffff)` : '#f0eeea'} fg={hasAccent ? accent : ink} />
          <div
            style={{
              fontFamily: 'Pretendard', fontSize: 78 * fit, fontWeight: 800, color: ink,
              letterSpacing: `${TITLE_TRACK}em`, lineHeight: TITLE_LH,
              wordBreak: 'keep-all', overflowWrap: 'anywhere',
            }}
          >
            {titleLines.map((l, i) => <div key={i}>{emphasize(l, titleEmph)}</div>)}
          </div>
          {clipSrc ? (
            <div style={{ width: '100%', flex: 1, minHeight: 0, borderRadius: 20, overflow: 'hidden', background: '#f4f4f4' }}>
              {isImageClip ? (
                <Img src={staticFile(clipSrc)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <OffthreadVideo src={staticFile(clipSrc)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>
          ) : card.body.length ? (
            <div
              style={{
                fontFamily: 'Pretendard', fontSize: 34, fontWeight: 400, color: '#4a4f55',
                lineHeight: 1.62, wordBreak: 'keep-all', maxWidth: 700,
              }}
            >
              {card.body.map((l, i) => <div key={i}>{emphasize(l, bodyEmph)}</div>)}
            </div>
          ) : null}
        </div>
        <Handle color={pickOn(wash, 'rgba(16,16,16,0.58)', 'rgba(255,255,255,0.7)')} />
      </AbsoluteFill>
    );
  }

  /* CTA 전용 마지막 장 — 큐레이터·매거진 판형(2026-07-31 확정).
     좌측정렬 문단 + 우하단 워터마크는 "글이 끊긴 자리"처럼 보여 반려됐다. 대신 축을 하나로 세운다:
     제목 → 본문 → 알약 버튼(계정+행동) → 출처 한 줄, 전부 가운데. 버튼이 시선의 종착점이다. */
  if (card.cta) {
    const inkC = t.ink;
    // 알약은 바탕과 반대색으로 — 카드에서 유일하게 색이 뒤집히는 곳이라 저절로 눈이 간다.
    // 흰 판형이면 블랙 알약, 통짜 블랙 판형이면 흰 알약(chipBg/chipText가 이미 뒤집혀 있다).
    const pillBg = t.chipBg;
    const pillFg = t.chipText;
    const mark = brand.wordmark ?? brand.handle ?? 'AI 안하루';
    const pillText = card.keyword
      ? `${mark} · 댓글에 '${card.keyword}'`
      : `${mark} · ${card.action ?? '팔로우'}`;

    /* CTA는 창이 없어 세로 공간을 통째로 제목·본문·알약이 나눠 쓴다 — 일반 카드처럼 축소가
       안 걸려 있어서, 제목을 길게 쓴 마지막 장이 위아래로 그냥 잘려 나갔다(2026-08-13).
       CTA는 덱에 보통 한 장뿐이라(§3 "마지막 장은 CTA 전용") 덱 전체 배율과 안 묶고
       이 카드 혼자 기준으로 줄인다 — 늘리진 않는다, 알약이 이미 있어 허전해 보이지 않는다. */
    const CTA_PILL_BLOCK = 58 + 52 + 48; // marginTop + 알약 상하패딩 + 텍스트 한 줄
    const ctaTitleH = (f: number) =>
      titleLines.reduce((n, l) => n + lineCount(l, 92 * f, TITLE_TRACK, TEXT_W), 0) * 92 * f * TITLE_LH;
    const ctaBodyH = (f: number) =>
      card.body.length
        ? 46 * f + card.body.reduce((h, line) => h + lineCount(line, 42 * f, BODY_TRACK, 800 * f) * 42 * f * 1.6, 0)
        : 0;
    const ctaRoom = 1350 - BOTTOM_SAFE * 2;
    /* 2026-08-22 — 상한이 1이라 '줄이기'만 됐다. "알약이 있어 허전해 보이지 않는다"고 적어뒀지만
       실측하니 콘텐츠가 카드의 36%뿐이고 위아래가 각각 3분의 1씩 비었다 — 비교·단계 카드가
       겪은 것과 같은 병이다. 배율마다 다시 재서(키우면 줄바꿈이 늘어난다) 안 넘치는 최대값을 쓴다. */
    let ctaFit = 1;
    for (const f of [1.5, 1.4, 1.3, 1.2, 1.1, 1.0]) {
      if (ctaTitleH(f) + ctaBodyH(f) + CTA_PILL_BLOCK * f <= ctaRoom) { ctaFit = f; break; }
    }
    if (ctaFit === 1 && ctaTitleH(1) + ctaBodyH(1) + CTA_PILL_BLOCK > ctaRoom) {
      ctaFit = Math.min(1, (ctaRoom - CTA_PILL_BLOCK) / Math.max(1, ctaTitleH(1) + ctaBodyH(1)));
    }

    return (
      <AbsoluteFill style={{ backgroundColor: t.page }}>
        <Grain level={brand.texture} />
        <div
          style={{
            position: 'absolute', left: M, right: M, top: 0, bottom: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: 'Pretendard', fontSize: 92 * ctaFit, fontWeight: 800, color: inkC,
              letterSpacing: `${TITLE_TRACK}em`, lineHeight: TITLE_LH,
              // keep-all은 어절을 지키지만, 띄어쓰기 없는 긴 덩어리(URL 등)는 컬럼 밖으로 흘러나간다.
              // anywhere를 같이 주면 평소엔 어절을 지키고 넘칠 때만 끊는다.
              wordBreak: 'keep-all', overflowWrap: 'anywhere',
            }}
          >
            {titleLines.map((l, i) => (
              <div key={i}>{emphasize(l, titleEmph)}</div>
            ))}
          </div>

          {card.body.length ? (
            <div style={{ marginTop: 46 * ctaFit, maxWidth: 800 * ctaFit }}>
              {card.body.map((line, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily: 'Pretendard', fontSize: 42 * ctaFit, fontWeight: 400, color: t.body,
                    lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'anywhere',
                    letterSpacing: `${BODY_TRACK}em`,
                  }}
                >
                  {emphasize(line, bodyEmph)}
                </div>
              ))}
            </div>
          ) : null}

          <div
            style={{
              marginTop: 58 * ctaFit, padding: `${26 * ctaFit}px ${46 * ctaFit}px`, borderRadius: 999,
              background: pillBg, color: pillFg,
              display: 'flex', alignItems: 'center', gap: 16 * ctaFit,
              fontFamily: 'Pretendard', fontSize: 40 * ctaFit, fontWeight: 800, letterSpacing: '-0.02em',
            }}
          >
            <span>{pillText}</span>
            <span style={{ opacity: 0.7, fontWeight: 700 }}>→</span>
          </div>

          {/* 출처는 별도 도장처럼 찍지 않는다 — 본문 문장 안에 자연스럽게 녹인다(2026-07-31) */}
        </div>
      </AbsoluteFill>
    );
  }

  /* 비교(vs) 카드 — 미디어 없는 타이포 판형. CTA와 같은 이유로 덱 전체 배율에 안 묶이고
     이 카드 혼자 기준으로 줄인다(늘리진 않는다) — 비교 카드는 보통 덱에 한두 장뿐이라
     다른 카드 분량에 맞춰 커지거나 작아지면 오히려 부자연스럽다(2026-08-13 신설). */
  if (card.compare) {
    const { left, right } = card.compare;
    const outerTop = 200;   // 마스트헤드 아래, 존이 시작하는 자리
    const blockGap = 56;    // 제목 ↔ 패널
    /* 카드 중앙엔 지름 68의 VS 배지 원이 떠 있다(반지름 34). 갭이 40이면 컬럼 박스 안쪽 경계가
       중앙에서 20만큼만 떨어져 있어 원 안으로 14가 파고들고, 컬럼 패딩(16)을 더해도 텍스트가
       원과 2px 간격으로 거의 붙는다 — 오른쪽 컬럼이 3줄까지 차는 비교(vs) 카드에서 실제로
       "이것도"의 이 자가 원에 닿는 걸 확인했다(2026-08-15). 갭을 넓혀 패딩 뒤에도
       원과 최소 20px는 떨어지게 한다. */
    const colGap = 80;
    const colW = (1080 - M * 2 - colGap) / 2;
    const hasCaption = card.body.length > 0;
    const outerBottom = 1350 - BOTTOM_SAFE;
    const captionGap = 42;    // 패널 ↔ 캡션
    const captionLineH = 34;  // 캡션은 항상 한 줄(28px 폰트)이라 줄바꿈 계산이 필요 없다
    const captionBlockH = hasCaption ? captionGap + captionLineH : 0;

    const titleH = titleLines.reduce((n, l) => n + lineCount(l, 64, TITLE_TRACK, TEXT_W), 0) * 64 * TITLE_LH;
    const maxPanelH = outerBottom - outerTop - titleH - blockGap - captionBlockH; // 패널 높이 상한

    /* 문구가 짧으면 크게 — 비교 카드의 본체는 이 숫자/단문 대비이지, 제목이 아니다.
       46px 고정이면 "6시간" 같은 두세 글자가 여백 한가운데 조그맣게 떠서, 카드가 비어
       보이는 진짜 원인이었다(2026-08-15, 위치·여백을 아무리 옮겨도 안 고쳐졌다 — "여기다
       뭘 채울래" 반려). 한 줄에 들어가는 한도 안에서 최대한 큰 단을 쓰고, 그것도 안 되는
       (문장형) 문구만 원래 로직(46, 3줄 넘으면 32)으로 내려간다. */
    const phraseSize = (t: string, f = 1) => {
      for (const size of [104, 88, 72, 60].map((v) => v * f)) {
        if (lineCount(t, size, TITLE_TRACK, colW - 32) === 1) return size;
      }
      /* 2026-08-21 — 후보가 60→46으로 끊겨 있어 열 자 안팎 문구가 46까지 떨어지고 거기서도
         2줄이 됐다(작아지면서 줄바꿈까지 되는 최악). 두 줄까지 허용하고 그 안에서 최대 단을 쓴다. */
      for (const size of [72, 64, 58, 52].map((v) => v * f)) {
        if (lineCount(t, size, TITLE_TRACK, colW - 32) <= 2) return size;
      }
      return lineCount(t, 46, TITLE_TRACK, colW - 32) > 3 ? 32 : 46;
    };
    const colContentH = (s: { text: string }, f = 1) => {
      const size = phraseSize(s.text, f);
      return 22 * f + 14 * f + lineCount(s.text, size, TITLE_TRACK, colW - 32) * size * 1.25;
    };
    /* 제목을 고정하고 그 아래만 쌓았더니(2026-08-15) 문구가 짧은 — 실사용 대부분인 — 케이스에서
       카드 하단 거의 절반이 빈 채로 남았다("여따가는 뭐 쓸래" 반려, 스크린샷으로 확인).
       비교 카드엔 채울 다른 소재가 없으니 그 자리를 채울 방법이 없다 — 유일한 답은 여백을
       위아래로 고르게 나누는 것뿐이다. **제목+패널+캡션을 한 덩어리**로 보고 카드 안에서
       가운데 정렬한다(steps 카드와 같은 원칙). 대가: 비교 카드가 한 덱에 둘 이상이면 문구
       길이에 따라 제목 높이가 카드마다 조금씩(대개 6~10%p) 달라진다 — 그런데 이 카드
       타입은 원래 덱에 한두 장뿐이라(주석 §427) 실제로 부딪힐 일은 드물고, 절반 빈 카드보다
       훨씬 작은 대가다. */
    /* 2026-08-21 — 콘텐츠가 카드의 37%만 차지하고 위아래가 텅 비던 문제("여백을 못 잡는다"
       반려). 중앙 정렬은 이미 맞았고, 덩어리 자체가 작은 게 원인이었다. steps의 stepsFit과
       같은 원리로 **남는 공간만큼 제목·문구·간격을 통째로 키운다.** 배율마다 다시 재서
       안 넘치는 최대값을 고른다 — 키우면 줄바꿈이 늘어나 계산이 어긋나기 때문이다.
       패널 높이는 콘텐츠에 맞춘다(늘리면 세로 구분선만 길어져 선이 글자 밖으로 튀어나온다). */
    const fitsAt = (f: number) => {
      const th = titleLines.reduce((n, l) => n + lineCount(l, 64 * f, TITLE_TRACK, TEXT_W), 0) * 64 * f * TITLE_LH;
      const ph = Math.max(colContentH(left, f), colContentH(right, f));
      const cb = hasCaption ? captionGap * f + captionLineH * f : 0;
      return { total: th + blockGap * f + ph + cb, th, ph, cb };
    };
    /* 배율을 키우면 좁은 칸에서 줄바꿈이 터진다 — 실제로 1.3배에서 "강화판이/다"처럼
       마지막 한 글자가 혼자 떨어져 나갔다(2026-08-21 실측). 높이가 남아도 **좌우 문구가
       2줄을 넘기면 그 배율은 버린다.** 비교 카드의 생명은 좌우 대칭이라, 한쪽만 3줄이 되면
       라벨 높이까지 어긋나 카드가 무너진다. */
    /* lineCount는 한글을 1em으로 단순 계산해서 **실제 렌더보다 줄 수를 적게 센다**
       (Pretendard 자간 탓. 계산상 2줄인데 실제로 3줄이 나오는 걸 확인했다).
       그래서 폭을 0.88배로 보수적으로 잡고 판정한다 — 넘치는 쪽이 훨씬 나쁘다. */
    const SAFE = 0.88;
    const linesAt = (f: number) => Math.max(
      lineCount(left.text, phraseSize(left.text, f), TITLE_TRACK, (colW - 32) * SAFE),
      lineCount(right.text, phraseSize(right.text, f), TITLE_TRACK, (colW - 32) * SAFE),
    );
    let cmpFit = 1;
    for (const f of [1.5, 1.4, 1.3, 1.2, 1.1, 1.0]) {
      if (fitsAt(f).total <= outerBottom - outerTop && linesAt(f) <= 2) { cmpFit = f; break; }
    }
    const m = fitsAt(cmpFit);
    const titleSize = 64 * cmpFit;
    /* 박스 판형이라 너무 납작하면 어색하다 — 최소 높이를 준다 */
    const panelH = Math.min(maxPanelH, Math.max(m.ph + 56 * cmpFit, 260 * cmpFit));
    const blockH = m.th + blockGap * cmpFit + panelH + m.cb;
    /* [outerTop, outerBottom] 안에서 여백을 반씩 나눴더니 실제로는 안 맞았다 — 마스트헤드
       예약분(outerTop=200)이 하단 안전여백(BOTTOM_SAFE=96)보다 훨씬 커서, 그 존 안에서
       "균등"해도 카드 실제 위/아래 여백은 505:401로 어긋났다(2026-08-15, 그리드 실측으로
       확인 — "두 개 붙잡고 무게중심 못 맞추다" 반려). 카드 실제 양 끝(0, 1350) 기준으로
       위·아래 공백이 같아지는 지점을 먼저 구하고, 마스트헤드·하단 안전영역만 침범하지
       않게 자른다. */
    /* 2026-08-21 — 기하 중앙에 정확히 놓으면 아래가 더 비어 보인다. 상단엔 마스트헤드가
       있어서 시선이 위에 걸리는데 하단은 완전히 비기 때문이다. 시각 중앙은 기하 중앙보다
       약간 위다 — 남는 여백을 위 45 : 아래 55로 나눈다(옵티컬 센터링). */
    const idealCmpTop = (1350 - blockH) * 0.45;
    const cmpTop = Math.max(outerTop, Math.min(idealCmpTop, outerBottom - blockH));
    const panelTop = cmpTop + m.th + blockGap * cmpFit;
    const captionTop = panelTop + panelH + captionGap * cmpFit;

    /* 왼쪽 칸은 오른쪽(가운데 VS 배지) 쪽으로 붙여 정렬한다 — 왼쪽 정렬 그대로 두면 짧은
       문구가 칸의 바깥쪽(카드 왼쪽 끝)에 붙고, 오른쪽 칸은 원래도 칸이 배지 바로 옆이라
       짧은 문구가 자연히 배지에 붙는다. 그래서 좌우가 배지를 가운데 두고 마주 보지 못하고
       한쪽만 배지에 바짝 붙어 보였다(2026-08-15, "수직 중앙선" 반려 — 세로 중앙은 맞았어도
       가로 중앙선 기준 좌우 무게가 안 맞았다). align을 칸마다 반대로 줘서 둘 다 배지를
       마주보게 한다. */
    /* 채운 박스의 바탕과 글자 — 액센트가 있으면 액센트로, 없으면(흑백 무드) 잉크로 채운다.
       글자색은 그 바탕에서 읽히는 쪽을 고른다(대비 계산). */
    const factBg = t.accent === t.ink ? t.ink : t.accent;
    const factInk = pickOn(factBg, INK, '#ffffff');
    const factSub = factInk === '#ffffff' ? 'rgba(255,255,255,0.72)' : 'rgba(16,16,16,0.62)';

    const Column: React.FC<{ side: { label: string; text: string }; x: number; align: 'left' | 'right'; isFact?: boolean }> = ({ side, x, align, isFact }) => (
      <div
        style={{
          /* 2026-08-21 — 두 가지를 같이 해결한다.
             ① justifyContent:'center'로 라벨+문구를 통째로 가운데 두니 좌우 줄 수가 다를 때
                라벨이 계단처럼 어긋났다 → 라벨을 위에 고정한다.
             ② 빈 바탕에 글자만 얹으니 여백이 그대로 드러났다(반복 반려). 실제 비교표
                템플릿은 좌우를 **패널 박스**로 감싸서 공간을 채우고 대비를 준다 —
                같은 구조를 쓴다. 왼쪽(통념)은 중립 회색, 오른쪽(사실)은 액센트 톤. */
          position: 'absolute', left: x, top: panelTop, width: colW, height: panelH,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          alignItems: 'center', textAlign: 'center',
          padding: `${28 * cmpFit}px ${24 * cmpFit}px`,
          borderRadius: 28,
          /* 2026-08-21 — 액센트 농도로만 좌우를 나눴더니 **기본 흑백 무드에서 둘 다 회색**이
             되어 구분이 죽었다. 이 도구는 색을 안 주는 사람이 기본값이다.
             그래서 색이 아니라 **채움 대비**로 나눈다: 사실 쪽은 채운 박스(진한 바탕 +
             밝은 글자), 통념 쪽은 빈 박스. 액센트가 있으면 그 색으로 채우고, 없으면
             잉크로 채운다 — 색이 없어도 구분이 남는다. */
          background: isFact ? factBg : `color-mix(in srgb, ${t.ink} 4%, ${t.page})`,
          border: isFact
            ? `2px solid ${factBg}`
            : `2px solid color-mix(in srgb, ${t.ink} 16%, ${t.page})`,
        }}
      >
        <div style={{ fontFamily: 'Pretendard', fontSize: 22 * cmpFit, fontWeight: 700, color: isFact ? factSub : t.body, marginBottom: 14 * cmpFit }}>
          {side.label}
        </div>
        <div
          style={{
            fontFamily: 'Pretendard', fontSize: phraseSize(side.text, cmpFit), fontWeight: 800,
            color: isFact ? factInk : t.ink,
            lineHeight: 1.25, wordBreak: 'keep-all', overflowWrap: 'anywhere',
          }}
        >
          {side.text}
        </div>
      </div>
    );

    return (
      <AbsoluteFill style={{ backgroundColor: t.page }}>
        <Grain level={brand.texture} />
        <Badge text={card.badge} bg={t.chipBg} fg={t.chipText} />
        <Masthead text={brand.wordmark ?? brand.handle ?? 'AI 안하루'} color={t.ink} />

        <div style={{ position: 'absolute', left: M, right: M, top: cmpTop }}>
          <div
            style={{
              fontFamily: 'Pretendard', fontSize: titleSize, fontWeight: 800, color: t.ink,
              letterSpacing: `${TITLE_TRACK}em`, lineHeight: TITLE_LH,
              wordBreak: 'keep-all', overflowWrap: 'anywhere',
            }}
          >
            {titleLines.map((l, i) => (
              <div key={i}>{emphasize(l, titleEmph)}</div>
            ))}
          </div>
        </div>

        <Column side={left} x={M} align="right" />
        <Column side={right} x={M + colW + colGap} align="left" isFact />
        {/* 구분선 — 컬럼 사이 중앙 */}
        <div
          style={{
            position: 'absolute', left: 1080 / 2, top: panelTop, width: 1, height: panelH,
            background: 'rgba(16,16,16,0.12)',
          }}
        />
        {/* VS 배지 — 구분선 중앙에 얹는다 */}
        <div
          style={{
            position: 'absolute', left: 1080 / 2, top: panelTop + panelH / 2,
            transform: 'translate(-50%, -50%)', width: 68, height: 68, borderRadius: 999,
            background: t.chipBg, color: t.chipText,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Pretendard', fontSize: 22 * cmpFit, fontWeight: 800,
          }}
        >
          VS
        </div>

        {hasCaption ? (
          <div
            style={{
              position: 'absolute', left: M, right: M, top: captionTop,
              fontFamily: 'Pretendard', fontSize: 28 * cmpFit, fontWeight: 500, color: t.body,
              textAlign: 'center', wordBreak: 'keep-all',
            }}
          >
            {emphasize(card.body[0], bodyEmph)}
          </div>
        ) : null}
      </AbsoluteFill>
    );
  }

  /* 단계(steps) 카드 — 미디어 없는 번호 목록 판형. 비교 카드와 같은 이유로 자기 혼자 기준으로
     줄인다. 번호는 굵은 숫자(액센트가 잉크와 같으면 흑백무드처럼 잉크로, 아니면 액센트로) —
     제목 강조와 같은 "색이 있으면 액센트, 없으면 잉크" 판단을 그대로 따른다. */
  if (card.steps && card.steps.length > 0) {
    const zoneTop = 200;
    const zoneBottom = 1350 - BOTTOM_SAFE;

    /* 2026-08-22 — 흰 바탕에 번호와 글자만 얹은 판형이었다. 비교 카드가 겪은 것과 **같은 병**이다:
       채울 게 없어서 오른쪽이 통째로 비고, 배율 상한(1.4)에 걸려도 카드의 40%밖에 못 채웠다
       (3·5단계 실측). 여백 수치가 아니라 구조 문제라, 비교 카드와 같은 처방을 쓴다 —
       **각 항목을 가로로 꽉 찬 패널 박스로 감싼다.** 번호는 채운 배지로 박아 색이 없어도
       (기본 흑백 무드) 대비가 남는다. 세로로 남는 공간은 폰트가 아니라 **패널 안쪽 여백**으로
       흡수한다: 글자만 키우면 좁은 칸에서 줄바꿈이 터진다는 걸 비교 카드에서 이미 겪었다. */
    const badge = 56;      // 번호 배지 한 변
    const badgeGap = 26;   // 배지 ↔ 문구
    const padX = 32;       // 패널 좌우 안쪽 여백
    const basePadY = 26;   // 패널 위아래 안쪽 여백(최소)
    const rowGap = 20;
    const titleGap = 44;

    /* lineCount는 한글을 1em으로 세서 실제 렌더보다 줄 수를 적게 잡는다(§비교 카드 SAFE 주석).
       패널은 폭이 좁아져 그 오차가 더 아프다 — 폭을 0.88배로 보수적으로 재고 판정한다. */
    const SAFE = 0.88;
    const textW = (1080 - M * 2 - padX * 2 - badge - badgeGap) * SAFE;

    const rowTextH = (s: string, f: number) =>
      Math.max(1, lineCount(s, 40 * f, BODY_TRACK, textW)) * 40 * f * 1.35;
    const rowH = (s: string, f: number, padY: number) =>
      padY * 2 + Math.max(badge * f, rowTextH(s, f));
    const titleH = (f: number) =>
      card.title
        ? titleLines.reduce((n, l) => n + lineCount(l, 60 * f, TITLE_TRACK, TEXT_W), 0) * 60 * f * TITLE_LH + titleGap * f
        : 0;
    const measure = (f: number, padY: number) =>
      card.steps!.reduce((a, s) => a + rowH(s, f, padY), 0) + rowGap * f * (card.steps!.length - 1);

    const room = zoneBottom - zoneTop;
    /* 배율 상한 — 비교 카드는 좁은 두 칸이라 1.4에서 줄바꿈이 터졌지만, 여기는 패널이
       카드 폭을 통째로 쓴다. 상한을 1.4로 두면 짧은 목록에서 배율이 남는데도 못 커져서
       남는 공간이 전부 패널 안쪽 여백으로 가고, 박스만 크고 글자는 작은 카드가 됐다
       (2026-08-22 실측). 배율마다 다시 재니 넘칠 걱정은 measure가 막는다. */
    let stepsFit = 1;
    for (const f of [1.8, 1.7, 1.6, 1.5, 1.4, 1.3, 1.2, 1.1, 1.0]) {
      if (titleH(f) + measure(f, basePadY * f) <= room) { stepsFit = f; break; }
    }
    /* 그래도 넘치면(항목이 많거나 길면) 줄인다 */
    if (stepsFit === 1 && titleH(1) + measure(1, basePadY) > room) {
      stepsFit = Math.min(1, (room - titleH(1)) / Math.max(1, measure(1, basePadY)));
    }
    /* 남는 세로 공간을 패널 안쪽 여백으로 나눠 먹인다 — 상한을 둬서 항목 하나짜리 덱이
       카드 절반짜리 통짜 박스가 되는 건 막는다. */
    const slack = room - titleH(stepsFit) - measure(stepsFit, basePadY * stepsFit);
    const padY = Math.max(
      basePadY * stepsFit,
      Math.min(basePadY * stepsFit + slack / (2 * card.steps.length), 44 * stepsFit),
    );

    const blockH = titleH(stepsFit) + measure(stepsFit, padY);
    const numBg = t.accent === t.ink ? t.ink : t.accent;
    const numInk = pickOn(numBg, INK, '#ffffff');

    /* 옵티컬 센터링 — 위 45 : 아래 55(비교 카드와 동일. 상단엔 마스트헤드가 있어
       기하 중앙에 두면 아래가 더 비어 보인다). */
    const idealStepTop = (1350 - blockH) * 0.45;
    const stepTop = Math.max(zoneTop, Math.min(idealStepTop, zoneBottom - blockH));

    return (
      <AbsoluteFill style={{ backgroundColor: t.page }}>
        <Grain level={brand.texture} />
        <Badge text={card.badge} bg={t.chipBg} fg={t.chipText} />
        <Masthead text={brand.wordmark ?? brand.handle ?? 'AI 안하루'} color={t.ink} />

        <div style={{ position: 'absolute', left: M, right: M, top: stepTop }}>
          {card.title ? (
            <div
              style={{
                fontFamily: 'Pretendard', fontSize: 60 * stepsFit, fontWeight: 800, color: t.ink,
                letterSpacing: `${TITLE_TRACK}em`, lineHeight: TITLE_LH, marginBottom: titleGap * stepsFit,
                wordBreak: 'keep-all', overflowWrap: 'anywhere',
              }}
            >
              {titleLines.map((l, i) => (
                <div key={i}>{emphasize(l, titleEmph)}</div>
              ))}
            </div>
          ) : null}

          {card.steps.map((s, i) => (
            <div
              key={i}
              style={{
                /* 배지는 가운데가 아니라 **첫 줄에** 맞춘다 — 여러 줄로 접히는 항목에서
                   가운데 정렬하면 번호가 문단 한복판에 떠서 목록으로 안 읽힌다(2026-08-22 실측). */
                display: 'flex', alignItems: 'flex-start', gap: badgeGap * stepsFit,
                marginTop: i === 0 ? 0 : rowGap * stepsFit,
                padding: `${padY}px ${padX * stepsFit}px`,
                borderRadius: 28,
                background: `color-mix(in srgb, ${t.ink} 4%, ${t.page})`,
                border: `2px solid color-mix(in srgb, ${t.ink} 14%, ${t.page})`,
              }}
            >
              <div
                style={{
                  width: badge * stepsFit, height: badge * stepsFit, flexShrink: 0, borderRadius: 16,
                  background: numBg, color: numInk,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Pretendard', fontSize: 28 * stepsFit, fontWeight: 800, letterSpacing: '-0.02em',
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </div>
              <div
                style={{
                  fontFamily: 'Pretendard', fontSize: 40 * stepsFit, fontWeight: 500, color: t.ink,
                  lineHeight: 1.35, wordBreak: 'keep-all', overflowWrap: 'anywhere',
                }}
              >
                {emphasize(s, bodyEmph)}
              </div>
            </div>
          ))}
        </div>
      </AbsoluteFill>
    );
  }

  /* 미디어 존은 **고정 크기**다(968×545). 창은 그 안에 비율 그대로 들어가 가운데 정렬된다.
     → 자료를 깎지 않으면서도 **캡션·제목 위치가 카드마다 절대 안 움직인다.**
     예전엔 창 높이가 자료 비율을 따라 변해서 3.17:1 클립에서 제목이 239px 튀어올랐다 —
     스와이프할 때 제목이 오르락내리락하면 아마추어로 보인다(2026-07-31 반려). */
  const ar = card.clipW && card.clipH ? card.clipW / card.clipH : 16 / 9;
  let winW = MEDIA_ZONE_W;
  let winH = Math.round(winW / ar);
  if (winH > MEDIA_ZONE_H) { winH = MEDIA_ZONE_H; winW = Math.round(winH * ar); }
  const winLeft = Math.round((1080 - winW) / 2);
  const winTop = Math.round(MEDIA_TOP + (MEDIA_ZONE_H - winH) / 2);
  const labelTop = MEDIA_TOP + MEDIA_ZONE_H + LABEL_GAP;    // 존 바닥 기준 — 고정
  const textTop = labelTop + (card.label ? LABEL_H : 0) + TEXT_GAP;
  const inkZoneH = labelTop + LABEL_H + 20;                 // ink 색면은 캡션 아래에서 끊는다

  /* 글자 배율은 **덱 전체가 같은 값**을 쓴다. 카드마다 따로 맞추면 넘길 때 제목 크기가
     오르락내리락해서 아마추어로 보인다 — 2026-07-31에 창 높이로 같은 문제를 겪고
     고정 판형으로 바꿨던 것과 같은 이유다.
     그래서 덱에서 가장 빡빡한 카드가 기준이 되고, 카드가 다 짧으면 다 같이 조금 커져서
     하단 여백을 메운다. 줄이는 쪽은 제한이 없고(넘치는 게 더 나쁘다), 키우는 쪽만
     1.15배로 막는다 — 짧은 덱에서 글자가 우스꽝스럽게 커지지 않게. */
  const ratios = (deck ?? []).filter((c) => !c.cta && !c.compare && !c.steps && c.title).map(fitRatio);
  const fit = Math.min(1.15, ...(ratios.length ? ratios : [fitRatio(card)]));

  /* 전면 판형 — 자료가 카드를 꽉 채우고 하단 스크림 위에 흰 글자를 얹는다.
     기본 창 판형(상단 블랙 존 + 하단 흰 글 존)은 화면 녹화용이다: 자료를 안 깎는 대신 자료가
     카드의 절반만 쓴다. 사진·생성이미지는 반대로 자료가 주인공이라 꽉 채우는 게 맞다.
     **여기서만 크롭을 허용한다** — 전면 판형의 대가이고, 그래서 화면 녹화엔 쓰지 않는다. */
  if (card.full && clipSrc) {
    const scrimTop = card.body.length ? '46%' : '56%';
    return (
      <AbsoluteFill style={{ backgroundColor: BLACK }}>
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${settle * kb})` }}>
          {isImageClip ? (
            <Img src={staticFile(clipSrc)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <OffthreadVideo src={staticFile(clipSrc)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>

        {/* 스크림 — 글자가 앉을 자리를 어둡게 깐다. 위쪽은 자료가 그대로 보이게 투명하게 둔다.
            중간을 한 번 꺾는 이유: 곧장 검정으로 가면 경계가 띠처럼 보인다.
            밝은 자료(흰 UI·하늘·눈)에서도 흰 글자가 읽혀야 하므로 아래쪽은 충분히 진하게 간다 —
            자료를 살리겠다고 옅게 깔면 글이 안 읽혀서 카드가 통째로 못 쓰게 된다. */}
        <div
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, top: scrimTop,
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.42) 30%, rgba(0,0,0,0.78) 58%, rgba(0,0,0,0.96) 100%)',
          }}
        />
        {/* 마스트헤드도 밝은 자료 위에선 사라진다 — 아주 얕게만 덮는다 */}
        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: 0, height: 150,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 100%)',
          }}
        />

        <Masthead text={brand.wordmark ?? brand.handle ?? 'AI 안하루'} color="#ffffff" />
        {/* 전면 판형은 항상 사진 위 스크림이라 chipBg/chipText(surface 토글용)를 안 쓰고
            흰 배지로 고정한다 — 어떤 사진이 와도 대비가 보장되는 유일한 조합이다. */}
        <Badge text={card.badge} bg="#ffffff" fg={BLACK} />

        {/* 글은 아래에 붙인다 — 자료 높이가 어떻든 글의 밑선이 카드마다 안 움직인다 */}
        <div style={{ position: 'absolute', left: M, right: M, bottom: BOTTOM_SAFE }}>
          {card.label ? (
            <div
              style={{
                fontFamily: 'Pretendard', fontSize: 25 * fit, fontWeight: 700,
                letterSpacing: '-0.005em', color: 'rgba(255,255,255,0.66)', marginBottom: 18 * fit,
              }}
            >
              {card.label}
            </div>
          ) : null}
          <div
            style={{
              fontFamily: 'Pretendard', fontSize: TITLE_SIZE * fit, fontWeight: 800, color: '#ffffff',
              letterSpacing: `${TITLE_TRACK}em`, lineHeight: TITLE_LH,
              wordBreak: 'keep-all', overflowWrap: 'anywhere',
              textShadow: '0 2px 24px rgba(0,0,0,0.45)',
            }}
          >
            {titleLines.map((l, i) => (
              <div key={i}>{emphasize(l, { color: t.accentDark })}</div>
            ))}
          </div>
          {card.body.length ? (
            <div style={{ marginTop: BODY_GAP * fit }}>
              {card.body.map((line, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily: 'Pretendard', fontSize: BODY_SIZE * fit, fontWeight: 400, color: BODY_D,
                    lineHeight: BODY_LH, wordBreak: 'keep-all', overflowWrap: 'anywhere',
                    letterSpacing: `${BODY_TRACK}em`, textShadow: '0 1px 16px rgba(0,0,0,0.45)',
                  }}
                >
                  {emphasize(line, { fontWeight: 700, color: '#ffffff' })}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: t.page }}>
      {/* 상단 존 — ink 테마일 때만 색면. white 테마는 바탕 그대로(예전의 탁한 그라데이션 제거). */}
      {t.topZone ? (
        <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: inkZoneH, background: t.topZone }} />
      ) : null}

      {/* 종이질감은 자료 창 '아래'에 깐다 — 창이 덮으므로 화면 녹화는 깨끗하게 남는다 */}
      <Grain level={brand.texture} />

      {/* 실화면 창 */}
      <div
        style={{
          position: 'absolute', left: winLeft, top: winTop, width: winW, height: winH,
          borderRadius: 24, background: '#0d1117',
          transform: `scale(${settle * kb})`,
          boxShadow: t.shadow,
        }}
      >
        <div style={{ position: 'absolute', inset: 0, borderRadius: 24, overflow: 'hidden' }}>
          {isImageClip ? (
            <Img
              src={staticFile(clipSrc)}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <OffthreadVideo
              src={staticFile(clipSrc)}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
        </div>
        {/* 헤어라인 링 — 밝은 화면이 배경에 녹지 않게 경계를 세운다 */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: 24, boxShadow: `inset 0 0 0 1px ${t.ring}` }} />
      </div>

      {/* 창 캡션 — 대문자·와이드 자간 없이, 창에 붙은 출처 표기로 */}
      {card.label ? (
        <div
          style={{
            position: 'absolute', left: M, top: labelTop, right: M,
            fontFamily: 'Pretendard', fontSize: 25, fontWeight: 700, letterSpacing: '-0.005em',
            /* 출처 캡션은 정보지 강조가 아니다 — 액센트 색을 쓰지 않고 조용한 흰색으로.
               강조는 본문 굵기로 준다(2026-07-31 반려). 캡션은 늘 블랙 존 위에 놓인다. */
            color: 'rgba(255,255,255,0.56)',
          }}
        >
          {card.label}
        </div>
      ) : null}

      {/* 텍스트 존 */}
      <div style={{ position: 'absolute', left: M, right: M, top: textTop }}>
        <div
          style={{
            fontFamily: 'Pretendard', fontSize: TITLE_SIZE * fit, fontWeight: 800, color: t.ink,
            letterSpacing: '-0.035em', lineHeight: TITLE_LH, wordBreak: 'keep-all',
          }}
        >
          {titleLines.map((l, i) => (
            <div key={i}>{emphasize(l, titleEmph)}</div>
          ))}
        </div>
        {blocks.length ? (
        <div style={{ marginTop: BODY_GAP * fit }}>
          {blocks.map((b, i) =>
            b.kind === 'code' ? (
              <div
                key={i}
                style={{
                  display: 'inline-block', marginTop: i === 0 ? 0 : 14, marginBottom: 14,
                  padding: '14px 22px', borderRadius: 14,
                  background: t.chipBg, color: t.chipText,
                  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.09)',
                  fontFamily: MONO, fontSize: BODY_SIZE * fit * 0.82, fontWeight: 500,
                  letterSpacing: '-0.01em', lineHeight: 1.35, wordBreak: 'break-all',
                }}
              >
                {b.text}
              </div>
            ) : (
              <div
                key={i}
                style={{
                  fontFamily: 'Pretendard', fontSize: BODY_SIZE * fit, fontWeight: 400, color: t.body,
                  lineHeight: BODY_LH, wordBreak: 'keep-all', overflowWrap: 'anywhere',
                  letterSpacing: `${BODY_TRACK}em`,
                }}
              >
                {emphasize(b.text, bodyEmph)}
              </div>
            ),
          )}
        </div>
        ) : null}
      </div>

      {/* 라이트 무드는 상단이 블랙 존이라 마스트헤드도 그 위에서 읽히는 색으로 */}
      <Masthead text={brand.wordmark ?? brand.handle ?? 'AI 안하루'} color={t.topZone ? '#ffffff' : t.ink} />
      <Badge text={card.badge} bg={t.chipBg} fg={t.chipText} />
    </AbsoluteFill>
  );
};
