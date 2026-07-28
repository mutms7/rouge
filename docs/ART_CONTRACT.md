# The art contract

Both Claude and Codex read this file. It's the handshake between them.

The whole point: **Claude never waits for art, Codex never waits for code.** Claude builds the entire demo against procedural placeholders. Codex generates PNGs into fixed paths. When a PNG lands, it just appears in the game. Nobody edits code to "hook up" art. If that ever becomes necessary, the contract is broken and it needs fixing, not working around.

---

## 1. The rule that makes it work

**Art is addressed by content ID, and content IDs come from the game data.**

A card whose ID is `paper_cut` looks for its art at `public/art/cards/paper_cut.png`. That's it. No registry, no import statements, no per-asset wiring. Add a file, it shows up. Delete a file, the placeholder comes back.

Never bake text into an image. No card names, no numbers, no rules text, no borders, no frames. All of that is DOM text rendered on top, which is what makes localization and balance changes free. An image is the illustration and nothing else.

---

## 2. Where things go

```
public/art/
  cards/       <card_id>.png            768 x 576   opaque, 4:3
  enemies/     <enemy_id>.png           640 x 640   transparent
  bosses/      <boss_id>_p<n>.png      1024 x 1024  transparent
  portraits/   <char_id>_<expr>.png     512 x 640   transparent
  backdrops/   <stratum_id>_<v>.png    1920 x 1080  opaque
  tokens/      <token_id>.png           256 x 256   transparent
  icons/       <icon_id>.png            128 x 128   transparent
  nodes/       <node_id>.png             96 x 96    transparent
  store/       <valve_name>.png         see §6      opaque
  brand/       wordmark.png            1600 x 400   transparent
```

IDs are `lower_snake_case`, always. They match the `id` field in the TypeScript content data exactly. If the data says `the_notarys_countersign`, the file is `the_notarys_countersign.png`. Apostrophes and punctuation get dropped, not replaced.

Boss phases are separate files: `the_notary_p1.png`, `the_notary_p2.png`.

Portrait expressions for the demo: `neutral`, `hurt`, `dying`, `win`. So `wick_neutral.png` and so on.

---

## 3. The manifest and the placeholder

`npm run art:manifest` scans `public/art/`, writes `public/art/manifest.json` (a flat list of every ID that actually has a file), and the game loads that manifest at boot.

```ts
// roughly
export function artUrl(kind: ArtKind, id: string): string | null {
  return manifest[kind]?.includes(id) ? `/art/${kind}/${id}.png` : null;
}
```

When `artUrl` returns null, the component renders a **procedural placeholder** instead. Placeholders aren't grey boxes. They're deterministic and readable:

- Background colour is the card's suit colour from the palette below, at 40% opacity over paper.
- The content ID is printed on it in small mono type.
- A one-glyph shape hint keyed to type (attack, skill, enemy, token).

That means every screenshot taken during development is legible, you can tell at a glance which art is missing, and you can playtest and record footage months before the art exists. It also means a missing file is never a crash and never a broken-image icon.

`npm run art:check` is the validator. It compares every content ID against the manifest and reports four things: missing files, orphan files (art with no matching content ID, usually a typo), wrong dimensions, and images that should have transparency but don't. It exits non-zero in CI once the demo is art-complete, and warns only before that.

---

## 4. The palette

Locked. Both the CSS variables and the generated art use these exact values. Codex gets them in its brief, and `art:check` samples each PNG and warns if more than 8% of its pixels fall outside a tolerance of the palette.

| Name | Hex | Used for |
|---|---|---|
| Paper | `#E8DFCE` | Backgrounds, the base of everything |
| Chalk | `#B9B3A6` | Mid tones, dust, stone |
| Slate | `#3B3A38` | Line work, shadow |
| Void | `#14110F` | Deepest black, silhouettes |
| Oxblood | `#8C2B2B` | Debt. Nothing else. Ever. |
| Brine | `#2F6E6A` | Water, oaths, Act 2 |
| Brass | `#B98B3C` | Salt, currency, Act 3 machinery |

**Oxblood is a semantic colour, not a decorative one.** If something is red, it's because it's a debt, or damage, or interest. A red that means "this looks nice here" undermines the entire visual language. This applies to UI and art equally.

Suit colours for placeholder tinting and card framing: Lie = Chalk, Grief = Brine, Oath = Slate, Theft = Brass, Hunger = Oxblood, Compound = Oxblood on Void.

---

## 5. Demo asset count

129 images for the playable demo. Full list lives in the Codex brief.

| Group | Count |
|---|---|
| Card art | 45 |
| Enemies | 12 |
| Boss phases | 2 |
| Wick portraits | 4 |
| Chalk Wards backdrops | 4 |
| Tokens | 20 |
| Keyword and UI icons | 24 |
| Map node icons | 8 |
| Steam store assets | 9 |
| Wordmark | 1 |

Nothing here needs animating. Minimal cartoon art at this scale reads fine as a still, and any motion the game needs (card tilt, hit shake, enemy bob) is CSS transforms on the still image. That's a deliberate scope decision and it should hold through 1.0.

---

## 6. Steam store assets

Exact sizes, because Valve rejects uploads that are off by a pixel. Verify these against Valve's current asset guide before the store page goes up, since they do change them.

| File | Size |
|---|---|
| `header_capsule.png` | 920 x 430 |
| `small_capsule.png` | 462 x 174 |
| `main_capsule.png` | 1232 x 706 |
| `vertical_capsule.png` | 748 x 896 |
| `library_capsule.png` | 600 x 900 |
| `library_header.png` | 460 x 215 |
| `library_hero.png` | 3840 x 1240 |
| `library_logo.png` | 1280 x 720, transparent |
| `client_icon.png` | 32 x 32 |

These are the only images in the whole project allowed to contain text, and the only text allowed is the wordmark.

---

## 7. Weight budget

The web demo has to load fast on a bad connection, because the Vercel link is the marketing.

Every PNG goes through `sharp` on build: quantized to the palette, stripped of metadata, and emitted as both `.png` and `.webp`, with the game preferring webp. Budget is **6 MB total** for all demo art after compression. At 129 assets that's roughly 46 KB each, which is generous for flat cartoon art with a seven-colour palette. Flat art quantizes absurdly well, so realistically it'll land near half that.

If a single card illustration is over 80 KB post-compression, it's too detailed for the style and should be regenerated rather than crunched harder.
