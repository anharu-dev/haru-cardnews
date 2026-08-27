# haru-cardnews

인스타 캐러셀용 4:5 카드를 **슬라이드 한 장 = 파일 한 개**로 렌더한다.
입력은 덱 JSON 하나, 출력은 `out/<덱>/01.mp4`, `02.png` … 순번대로.

카드 한 장은 클립(화면 녹화·사진) 하나 + 텍스트 몇 줄이다. 클립을 빼면 텍스트 카드가 된다.
렌더는 Remotion + 헤드리스 Chrome으로 전부 로컬에서 돈다.

[English](README.en.md)

---

## 설치

Claude Code 플러그인으로 쓰는 경로다. 터미널에서 `claude`를 켜고:

```
/plugin marketplace add anharu-dev/haru-cardnews
/plugin install haru-cardnews@haru-cardnews
```

스코프는 **user**를 고른다. project/local로 깔면 그 프로젝트 안에서만 잡힌다.

`git clone`도 `npm install`도 필요 없다. 첫 렌더에서 npm 패키지와 헤드리스 Chrome
(약 200MB)을 한 번 받고, 그 뒤로는 안 기다린다. ffmpeg도 안 깔아도 된다.
영상 길이 측정은 `@remotion/renderer`가 한다.

설치 후:

```
카드뉴스 만들어줘
```

렌더러 코드를 직접 고칠 거면 [직접 쓰기](#직접-쓰기)로 간다. 그쪽은 `git clone` 경로다.

### 업데이트

플러그인은 자동 갱신되지 않는다. 세 줄을 차례로 친다:

```
/plugin marketplace update haru-cardnews
/plugin uninstall haru-cardnews@haru-cardnews
/plugin install haru-cardnews@haru-cardnews
```

그다음 Claude Code를 껐다 켠다. 열려 있던 세션은 옛 버전을 잡고 있다.

---

## 대화로 쓰기

```
카드뉴스 만들어줘
```

또는 `/cardnews`. 둘 다 같은 스킬을 부른다.

흐름은 5단계다. 주제 인터뷰 → 소재 확정 → 기획안 표 승인 → 렌더 → 결과·캡션.
팝업은 2번, 빈칸이 있으면 3번. 렌더 후 "2번 카드 제목 바꿔줘" 하면 `--only 2`로 그 카드만 다시 돈다.

소재는 **파일 선택창**으로 받는다. 경로를 복사해 붙여넣을 필요 없다. 여러 장 한 번에 된다.

### 사진이 없을 때

표지는 무드 색면 위 타이포, 정보 카드는 텍스트 카드로 간다.

무료 사진은 [Openverse](https://openverse.org)에서 찾되 **1080px 이상 3장이 잡힐 때만** 보여준다.
2장 이하면 묻지 않고 사진 없이 간다. 검색어는 주제 번역이 아니라 찍힐 장면으로 잡아야 결과가 나온다.
`cafe menu board`는 2건, `coffee cafe interior`는 26건이다.

무료 CC 사진은 같은 검색어 안에서도 편차가 크다. 스톡 같은 사진과 폰으로 찍은 스냅이 섞여 온다.
그래서 3장을 띄우고 고르게 한다. 본인 사진이 있으면 그게 낫다.

Unsplash를 쓰려면 `~/.claude/haru-cardnews.env`에 한 줄:

```
UNSPLASH_ACCESS_KEY=키
```

키를 채팅에 붙여넣지 마라. 대화 기록에 평문으로 남는다. 이 도구는 키를 출력하지 않는다.

---

## 직접 쓰기

### 설치 확인

```bash
npm run render
```

`sample` 덱 하나만 렌더하는 고정 명령이다. `package.json`에 박혀 있어서 주제를 묻지 않는다.
정상 설치 확인용 스모크 테스트일 뿐, 이걸로 카드뉴스가 만들어지지 않는다.
결과는 `out/sample/01.mp4`, `02.png`. 샘플 클립은 자체 생성한 테스트 영상이다.

### 덱 만들기

1. 클립을 `public/clips/<주제>/`에 넣는다. mp4는 16:9 권장, png·jpg도 된다.
2. `public/mediadecks/<덱>.json`을 쓴다:

```json
{
  "brand": { "mood": "press" },
  "cards": [
    { "cover": true, "kicker": "처음 하는 사람을 위한", "clip": "clips/주제/표지.jpg",
      "title": "제목 첫 줄\n*강조* 둘째 줄", "body": ["한 줄 부제."] },
    { "clip": "clips/주제/영상.mp4", "label": "출처 · 한 줄",
      "title": "제목 첫 줄\n제목 둘째 줄",
      "body": ["본문 한 문장 = 한 줄.", "두세 줄이 적당하다."] },
    { "cta": true, "title": "마무리\n한 마디", "body": ["행동 유도 한 줄."], "action": "팔로우" }
  ]
}
```

3. 렌더:

```bash
node scripts/mediacards.mjs 덱이름
node scripts/mediacards.mjs 덱이름 --only 3,5   # 일부만 다시
```

### 제목 줄바꿈

`title`의 줄바꿈은 `\n`으로 **원고가 정한다.** 렌더러는 그 줄이 한 줄에 앉는 배율을 찾을 뿐
알아서 접지 않는다. 한 줄은 8자 안팎으로 쓴다. 10자를 넘기면 배율이 내려가고,
그래도 안 되면 접히면서 마지막 어절이 혼자 떨어진다.

---

## 덱 스키마

### brand

| 필드 | 설명 |
|---|---|
| `mood` | 색·글꼴·레이아웃·표지 사진처리가 한 벌. `press`(흰+빨강, 기본) · `neon`(검정+초록) · `note`(노트+형광펜) · `editorial`(크림+명조) · `soft`(분홍 파스텔) · `warm`(따뜻한 주황) · `earth`(베이지+올리브) · `mono`(흑백) · `beauty`(블랙+골드) · `fashion`(차콜+실버) · `festival`(네이비+앰버). 정의는 `public/moods.json` |
| `accent` | 강조색 hex. 무드의 강조색만 덮는다. 자기 브랜드 색 자리 |
| `bg` | 바탕색 hex. 무드 바탕만 덮고 글자색은 대비를 재서 뒤집힌다. 옛 `theme`·`surface`는 제거됐다 |
| `texture` | 종이질감 `light` · `heavy`. 생략하면 없음. 자료 창 위에는 안 깔린다. 켜면 파일이 커진다 |
| `showHandle` | 계정 표기 여부. **기본 꺼짐** |
| `handle` / `wordmark` | 표기 문자열. `showHandle`이 꺼져 있으면 어디에도 안 나온다 |

### card

| 필드 | 설명 |
|---|---|
| `cover` | 표지. 골격(색면·사진 박스·전면 틴트·하단 스크림)은 무드가 정한다. `clip`은 선택 |
| `kicker` | 표지 상단 킥 라벨 한 줄. 표지 전용 |
| `clip` | mp4 또는 png·jpg. **생략하면 텍스트 카드.** 영상은 10~20초로 자른다(10초 미만은 렌더 중단). 이미지는 정지 PNG가 기본 |
| `motion` | 이미지에 켄번즈를 걸어 mp4로 뽑는다. 기본 꺼짐 |
| `full` | 자료가 카드를 꽉 채우고 하단 그라데이션 위에 흰 글자. 사진·생성이미지용. 화면 녹화(16:9)에 쓰면 좌우가 크게 잘린다 |
| `label` | 클립 아래 캡션 한 줄. 출처 표기용 |
| `title` | `\n`으로 줄바꿈 지정. `*단어*`는 액센트 강조 |
| `twoTone` | **표지·전면 전용.** 제목이 2줄 이상일 때 마지막 줄을 뺀 나머지 줄을 얇고 무드 강조색으로 바꾼다. 기본 꺼짐. `impact` 룩(Pretendard)만 실제로 얇아지고, `magazine`·`minimal` 룩은 두께 파일이 하나뿐이라 색만 바뀐다(가짜 두께를 만들지 않는다) |
| `body` | 배열 = 한 문장 한 줄, 0~3줄. `*구절*`은 굵기 강조 |
| `badge` | 왼쪽 위 라벨 칩. 한두 단어. cta에는 안 붙는다 |
| `duration` | 카드 길이(초). 생략 시 자동, 지정해도 10~20초로 맞춰진다 |
| `cta` | 마지막 카드. 클립 없이 텍스트만, 정지 PNG |
| `keyword` | cta 알약을 "댓글에 '키워드'"로 만든다 |
| `action` | cta 알약 문구. `keyword`가 없을 때 쓴다. 기본 "팔로우" |
| `compare` | `{ left: {label, text}, right: {label, text} }`. 두 항목을 나란히 대비. `body[0]`은 패널 아래 캡션 |
| `steps` | 문자열 배열. 번호 매긴 목록. 3~5개, 항목당 15자 안쪽 |

`compare`와 `steps`는 **선택이다.** 원고가 실제로 대비이거나 절차일 때만 쓴다.
두 짝을 지어내야 한다면 대비 주제가 아니다.

### 강조 문법

```json
{ "title": "AI 영상 한 편 뽑는 값\n*4,800원*부터." }
```

`title`에서는 무드 액센트 색으로 찍힌다. `note` 무드는 색 대신 형광펜이 깔린다.
`mono`처럼 액센트가 잉크와 같은 무드는 반투명 색면으로 표시한다.
`body`에서는 색이 아니라 굵기로만 강조한다. 한 카드에 색이 두 군데면 시선이 갈라진다.

---

## 코드가 강제하지 않는 것

- **영상 카드는 10초 이상이어야 한다.** 미만이면 렌더가 멈춘다. 패딩으로 늘리지 말고 소재를 바꾼다.
  늘리면 마지막 프레임이 얼어붙는다.
- **인용 자료의 저작권은 사용자에게 없다.** 남의 영상·스크린샷을 쓰면 출처를 `label`에 밝히고,
  발행 플랫폼의 인용 범위를 넘지 않는지 직접 확인한다. 이 도구는 렌더만 하고 저작권을 판단하지 않는다.
- 오디오는 렌더하지 않는다(`--muted`). 카드에 소리가 있으면 인스타가 "오리지널 오디오"로 잡아
  음악을 못 붙인다. 소리는 인스타 앱에서 얹는다.

---

## 이 도구가 읽는 것

- 소재를 찾을 때 다운로드·바탕화면·비디오·사진 폴더의 **최근 1주일 mp4·png·jpg 파일 이름**을 본다.
  묻기 전에 보지 않는다. 거절하면 쓸 파일을 직접 지정하면 된다.
- Unsplash 키는 `~/.claude/haru-cardnews.env`에서만 읽는다. 화면이나 로그에 출력하지 않는다.
- 렌더는 전부 로컬에서 돈다. 카드 내용은 외부로 나가지 않는다.
  Openverse·Unsplash를 쓸 때만 검색어가 나간다.

---

## 폰트

네 종을 woff2로 동봉한다. 사용자 컴퓨터에 설치돼 있지 않아도 렌더된다.
전부 SIL OFL 1.1이고 라이선스 전문은 `public/fonts/`에 있다.

| 글꼴 | 쓰는 곳 | 라이선스 |
|---|---|---|
| [Pretendard](https://github.com/orioncactus/pretendard) | 기본 본문·제목 | `OFL.txt` |
| [Gothic A1](https://fonts.google.com/specimen/Gothic+A1) | 미니멀 룩 제목 | `OFL-GothicA1.txt` |
| [Gowun Batang](https://github.com/yangheeryu/Gowun-Batang) | 매거진 룩 제목 | `OFL-GowunBatang.txt` |
| [Gowun Dodum](https://github.com/yangheeryu/Gowun-Dodum) | 매거진 룩 본문 | `OFL-GowunDodum.txt` |

Gothic A1과 Gowun 계열은 한글 완성형 범위로 서브셋했다. 28MB에서 1MB로 줄었다.
CDN은 쓰지 않는다. 폰트 로딩이 렌더를 죽인 이력이 있다.

## 라이선스

MIT (`LICENSE`). 동봉 폰트 4종만 SIL OFL 1.1을 따른다.

## 범위

렌더 도구만 담았다. 주제 선정, 카피의 과장·편향 점검, 저작권 분쟁 대응은 여기 없다.
도구가 아니라 사람이 매번 하는 일이다.
