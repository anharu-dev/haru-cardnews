# haru-cardnews

Renders 4:5 cards for Instagram carousels, **one file per slide**.
Input is a single deck JSON. Output is `out/<deck>/01.mp4`, `02.png`, numbered in order.

A card is one clip (screen recording or photo) plus a few lines of text. Drop the clip and you get a text card.
Rendering runs entirely on your machine via Remotion and headless Chrome.

The interface language is Korean: the conversational flow, the built-in fonts, and the line-breaking
rules all assume Korean copy. The renderer itself is language-agnostic, but you will want to swap
the fonts for anything else.

[한국어](README.md)

---

## Install

The plugin path, for use inside Claude Code. Start `claude` in a terminal, then:

```
/plugin marketplace add anharu-dev/haru-cardnews
/plugin install haru-cardnews@haru-cardnews
```

Pick **user** scope. project/local scope binds the plugin to whichever project is open.

No `git clone`, no `npm install`. The first render downloads npm packages and headless Chrome
(about 200MB) once, and later runs skip the wait. You do not need ffmpeg either:
`@remotion/renderer` measures video duration.

Then, in chat:

```
카드뉴스 만들어줘
```

To read or edit the renderer itself, go to [Direct use](#direct-use). That path uses `git clone`.

### Updating

Plugins do not auto-update. Run these three in order:

```
/plugin marketplace update haru-cardnews
/plugin uninstall haru-cardnews@haru-cardnews
/plugin install haru-cardnews@haru-cardnews
```

Then restart Claude Code. An open session still holds the old version.

---

## Conversational use

```
카드뉴스 만들어줘
```

`/cardnews` does the same thing.

Five steps: topic interview, material selection, plan table approval, render, results and caption.
Two popups, three if something is missing. After a render, "change the title on card 2" re-renders
that card alone via `--only 2`.

Materials come in through a **file picker**. No pasting paths, and multi-select works.

### When there are no photos

The cover becomes typography on a mood color field, and information cards become text cards.

Free photos come from [Openverse](https://openverse.org), but only when the search returns
**three images at 1080px or larger**. With two or fewer the tool goes photo-less without asking.
Query wording decides the outcome more than anything else: search for the scene that would be
photographed, not a translation of your topic. `cafe menu board` returns 2 results;
`coffee cafe interior` returns 26.

Free CC photos vary a lot within a single query. Stock-grade shots and phone snapshots arrive
side by side, so the tool shows three and lets you pick. Your own photo beats all of them.

To use Unsplash instead, put one line in `~/.claude/haru-cardnews.env`:

```
UNSPLASH_ACCESS_KEY=your-key
```

Do not paste the key into chat. It stays in the transcript in plain text. The tool never prints it.

---

## Direct use

### Verify the install

```bash
npm run render
```

A fixed command that renders the `sample` deck and nothing else. It is hardcoded in `package.json`,
so it never asks for a topic. This is a smoke test, not a way to make real cards.
Output lands in `out/sample/01.mp4` and `02.png`. The sample clip is a self-generated test video.

### Build a deck

1. Put clips in `public/clips/<topic>/`. 16:9 mp4 preferred; png and jpg also work.
2. Write `public/mediadecks/<deck>.json`:

```json
{
  "brand": { "mood": "press" },
  "cards": [
    { "cover": true, "kicker": "For your first time", "clip": "clips/topic/cover.jpg",
      "title": "First line\n*Accent* second line", "body": ["One-line subtitle."] },
    { "clip": "clips/topic/demo.mp4", "label": "Source · one line",
      "title": "First line\nSecond line",
      "body": ["One sentence per line.", "Two or three lines works."] },
    { "cta": true, "title": "Closing\nline", "body": ["One call to action."], "action": "팔로우" }
  ]
}
```

3. Render:

```bash
node scripts/mediacards.mjs deckname
node scripts/mediacards.mjs deckname --only 3,5   # re-render specific cards
```

### Title line breaks

**The copy decides line breaks**, using `\n`. The renderer only picks a scale at which each authored
line fits on one rendered line; it will not fold a line on its own. Keep lines to about 8 Korean
characters. Past 10 the scale drops, and when even that fails the line folds and strands its last word.

---

## Deck schema

### brand

| Field | Description |
|---|---|
| `mood` | Color, typeface, layout, and cover photo treatment as one set. `press` (white + red, default) · `neon` (black + green) · `note` (notebook + highlighter) · `editorial` (cream + serif) · `soft` (pink pastel) · `warm` (orange) · `earth` (beige + olive) · `mono` (black and white) · `beauty` (black + gold) · `fashion` (charcoal + silver) · `festival` (navy + amber). Definitions live in `public/moods.json` |
| `accent` | Accent hex. Overrides only the mood's accent color. This is where your brand color goes |
| `bg` | Background hex. Overrides only the mood's background; text color flips based on measured contrast. The old `theme` and `surface` fields were removed |
| `texture` | Paper grain: `light` or `heavy`. Omit for none. Never applied over media. Turning it on grows file size noticeably |
| `showHandle` | Whether to print the account name. **Off by default** |
| `handle` / `wordmark` | The string to print. Nothing appears anywhere while `showHandle` is off |

### card

| Field | Description |
|---|---|
| `cover` | Cover card. The mood picks the skeleton (color field, photo box, full tint, bottom scrim). `clip` is optional |
| `kicker` | One-line kicker label at the top. Cover only |
| `clip` | mp4, png, or jpg. **Omit it and you get a text card.** Video is trimmed to 10–20s; under 10s the render stops. Images render as a still PNG by default |
| `motion` | Applies a Ken Burns move to an image and outputs mp4. Off by default |
| `full` | Media fills the card, white text sits on a bottom gradient. For photos and generated images. Using it for 16:9 screen recordings crops the sides heavily |
| `label` | One-line caption under the clip, for attribution |
| `title` | `\n` sets line breaks. `*word*` marks accent emphasis |
| `body` | Array, one sentence per line, 0–3 lines. `*phrase*` emphasizes by weight |
| `badge` | Small label chip, top left. One or two words. Never applied to cta cards |
| `duration` | Card length in seconds. Automatic if omitted, and clamped to 10–20s either way |
| `cta` | Final card. Text only, no clip, rendered as a still PNG |
| `keyword` | Turns the cta pill into "comment 'keyword'" |
| `action` | cta pill text, used when `keyword` is absent. Defaults to "팔로우" (follow) |
| `compare` | `{ left: {label, text}, right: {label, text} }`. Two items side by side. `body[0]` becomes the caption under the panels |
| `steps` | String array. Numbered list. 3–5 items, under 15 Korean characters each |

`compare` and `steps` are **optional.** Use them when the copy genuinely contrasts two things or
describes a real sequence. If you have to invent the second half of the pair, it is not a contrast.

### Emphasis syntax

```json
{ "title": "One AI video costs\n*$3.50* and up." }
```

In `title` the marked span takes the mood accent color. The `note` mood draws a highlighter stroke
instead. Moods where the accent equals the ink color, such as `mono`, use a translucent fill.
In `body` emphasis is weight only, never color: two colored spots on one card split the reader's eye.

---

## Rules the code does not enforce

- **Video cards need at least 10 seconds.** Shorter clips stop the render. Swap the material rather
  than padding it, since padding freezes the last frame.
- **You do not own the copyright to material you quote.** When using someone else's video or
  screenshot, credit the source in `label` and check that your use stays inside what your publishing
  platform allows. This tool renders; it does not make copyright judgments for you.
- Audio is not rendered (`--muted`). Instagram treats a card with sound as "original audio" and
  blocks you from adding music. Add sound in the Instagram app.

---

## What this tool reads

- When looking for material it reads the **file names of mp4, png, and jpg files from the last seven
  days** in Downloads, Desktop, Videos, and Pictures. It asks first and never looks before you agree.
  Decline and you can point it at specific files instead.
- The Unsplash key is read only from `~/.claude/haru-cardnews.env`, and never printed to screen or logs.
- All rendering is local. Card content does not leave your machine.
  Only the search terms go out, and only when you use Openverse or Unsplash.

---

## Fonts

Four faces ship as woff2, so cards render without them installed on your system.
All four are SIL OFL 1.1, with full license text in `public/fonts/`.

| Font | Used for | License |
|---|---|---|
| [Pretendard](https://github.com/orioncactus/pretendard) | Default body and titles | `OFL.txt` |
| [Gothic A1](https://fonts.google.com/specimen/Gothic+A1) | Minimal look titles | `OFL-GothicA1.txt` |
| [Gowun Batang](https://github.com/yangheeryu/Gowun-Batang) | Magazine look titles | `OFL-GowunBatang.txt` |
| [Gowun Dodum](https://github.com/yangheeryu/Gowun-Dodum) | Magazine look body | `OFL-GowunDodum.txt` |

Gothic A1 and the Gowun faces are subset to the precomposed Hangul range, 28MB down to 1MB.
No CDN: font loading has killed renders here before.

## License

MIT (`LICENSE`). The four bundled fonts follow SIL OFL 1.1 separately.

## Scope

This repo holds the render tool. Choosing topics, checking copy for overstatement and bias, and
handling copyright disputes are not in here. Those are done by a person, every time.
