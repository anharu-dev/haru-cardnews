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
  clip?: string;           // clips/<...>.mp4 또는 .png/.jpg — 이미지면 창이 천천히 커진다. cta 카드는 생략
  clipW?: number;          // 자료 실측 픽셀 — 렌더 스크립트가 ffprobe로 채운다. 없으면 16:9 간주
  clipH?: number;
  label?: string;          // 창 아래 캡션 (예: 출처명 · CASE 01)
  title: string;
  body: string[];
  clipVolume?: number;
  cta?: boolean;           // 마지막 장 전용 — 창 없이 타이포 중앙 배치(실자료 규칙의 유일한 예외)
  keyword?: string;        // cta 카드의 댓글 키워드 — "댓글에 '키미'" 알약으로 박힌다
  action?: string;         // cta 알약 문구 — '팔로우' | '공유하기' | '저장하기' … 기본 '팔로우'
  /** @deprecated 출처는 본문 문장에 녹인다 — 별도 줄로 찍지 않는다(2026-07-31) */
  source?: string;
};

export type MediaCardProps = { brand: DeckBrand; card: MediaCardDef; durFrames: number };

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

const TITLE_SIZE = 92;
const TITLE_LH = 1.14;
const BODY_SIZE = 43;
const BODY_LH = 1.56;
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
  'mono-dark': MONO_MOOD,
  // 임팩트 속보 — 레드(흰 바탕용으로 채도를 낮춰 잡았다. #ff2e4d는 흰 바탕에서 3.7:1로 흐리다)
  neon: mood({
    label: '#ff5c74',
    accent: '#d40f2c',
    accentDark: '#ff2e4d',      // 검정에선 원래의 네온 레드가 산다
    ring: 'rgba(255,46,77,0.34)',
    shadow: '0 24px 48px -20px rgba(0,0,0,0.75), 0 0 30px rgba(255,46,77,0.18)',
  }),
  // Google·Gemini 주제 전용 — 구글 블루(흰 바탕용 진한 톤)
  gemini: mood({ label: '#7ab6f0', accent: '#1263cf', accentDark: '#5b9dfa' }),

  // 구버전 별칭
  white: MONO_MOOD,
  ink: MONO_MOOD,
  dark: MONO_MOOD,
};

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

export const MediaCard: React.FC<MediaCardProps> = ({ brand, card, durFrames }) => {
  const frame = useCurrentFrame();
  const preset = THEMES[brand.theme ?? 'mono-light'] ?? THEMES['mono-light'];
  /* brand.accent(hex)로 프리셋 액센트를 덮어쓴다 — 자기 브랜드 색을 쓰라고 열어둔 자리다.
     바탕(흰색/블랙)은 못 바꾼다: 판형이 흔들리면 카드가 아마추어로 보이고, 무드 정체성은
     배경이 아니라 액센트 한 색이 내는 게 이 포맷의 원칙이다. */
  const base = brand.accent
    ? { ...preset, accent: brand.accent, accentDark: brand.accent }
    : preset;
  const t = brand.surface === 'dark' ? toDark(base) : base;

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

  /* CTA 전용 마지막 장 — 큐레이터·매거진 판형(2026-07-31 확정).
     좌측정렬 문단 + 우하단 워터마크는 "글이 끊긴 자리"처럼 보여 반려됐다. 대신 축을 하나로 세운다:
     제목 → 본문 → 알약 버튼(계정+행동) → 출처 한 줄, 전부 가운데. 버튼이 시선의 종착점이다. */
  if (card.cta) {
    const inkC = t.ink;
    // 알약은 바탕과 반대색으로 — 카드에서 유일하게 색이 뒤집히는 곳이라 저절로 눈이 간다.
    // 흰 판형이면 블랙 알약, 통짜 블랙 판형이면 흰 알약(chipBg/chipText가 이미 뒤집혀 있다).
    const pillBg = t.chipBg;
    const pillFg = t.chipText;
    const mark = brand.wordmark ?? 'AI 안하루';
    const pillText = card.keyword
      ? `${mark} · 댓글에 '${card.keyword}'`
      : `${mark} · ${card.action ?? '팔로우'}`;

    return (
      <AbsoluteFill style={{ backgroundColor: t.page }}>
        <div
          style={{
            position: 'absolute', left: M, right: M, top: 0, bottom: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: 'Pretendard', fontSize: 92, fontWeight: 800, color: inkC,
              letterSpacing: '-0.035em', lineHeight: TITLE_LH, wordBreak: 'keep-all',
            }}
          >
            {titleLines.map((l, i) => (
              <div key={i}>{emphasize(l, titleEmph)}</div>
            ))}
          </div>

          {card.body.length ? (
            <div style={{ marginTop: 46, maxWidth: 800 }}>
              {card.body.map((line, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily: 'Pretendard', fontSize: 42, fontWeight: 400, color: t.body,
                    lineHeight: 1.6, wordBreak: 'keep-all', letterSpacing: '-0.012em',
                  }}
                >
                  {emphasize(line, bodyEmph)}
                </div>
              ))}
            </div>
          ) : null}

          <div
            style={{
              marginTop: 58, padding: '26px 46px', borderRadius: 999,
              background: pillBg, color: pillFg,
              display: 'flex', alignItems: 'center', gap: 16,
              fontFamily: 'Pretendard', fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em',
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

  // 본문이 길어도 하단 안전선을 넘지 않게 — 넘칠 때만 축소한다(평소엔 100%).
  const titleH = titleLines.length * TITLE_SIZE * TITLE_LH;
  const bodyH = blocks.reduce((h, b) => h + (b.kind === 'code' ? BODY_SIZE * 1.5 + 28 : BODY_SIZE * BODY_LH), 0);
  const needed = titleH + (blocks.length ? BODY_GAP + bodyH : 0);

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

  const room = 1350 - BOTTOM_SAFE - textTop;
  const fit = needed > room ? room / needed : 1;

  return (
    <AbsoluteFill style={{ backgroundColor: t.page }}>
      {/* 상단 존 — ink 테마일 때만 색면. white 테마는 바탕 그대로(예전의 탁한 그라데이션 제거). */}
      {t.topZone ? (
        <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: inkZoneH, background: t.topZone }} />
      ) : null}

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
              volume={card.clipVolume ?? 0.7}
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
                  lineHeight: BODY_LH, wordBreak: 'keep-all', letterSpacing: '-0.012em',
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
      <Masthead text={brand.wordmark ?? 'AI 안하루'} color={t.topZone ? '#ffffff' : t.ink} />
    </AbsoluteFill>
  );
};
