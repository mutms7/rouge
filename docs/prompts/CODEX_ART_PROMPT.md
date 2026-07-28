# Art brief for Codex

Everything in here produces PNG files. No code, no game logic, no design decisions. Read `docs/ART_CONTRACT.md` for where files go and what sizes they are, then work through the asset list at the bottom.

The hard part of this job isn't any single image. It's making 129 images look like one person drew them in one week. Section 2 is how that happens, and skipping it means regenerating everything later.

---

## 1. The style, in one block

**Paste this verbatim at the top of every single generation. Do not paraphrase it, do not shorten it, do not "improve" it between batches.** Consistency comes from the prompt being byte-identical, not from it being well written.

```
STYLE: Minimal flat cartoon illustration in the manner of Charley Harper crossed with
1950s gouache children's book art. Extreme geometric simplification: subjects reduced to
the fewest possible shapes. Flat colour blocking with NO shading, NO gradients, NO
rendering, NO highlights. One optional flat cast shadow as a solid shape. Thin, slightly
uneven hand-drawn ink outline, or no outline at all. Subtle dry gouache paper grain over
everything. Naive, confident, a little grubby. Reads clearly at 200 pixels wide.

PALETTE: strictly these seven colours and nothing else.
  paper   #E8DFCE
  chalk   #B9B3A6
  slate   #3B3A38
  void    #14110F
  oxblood #8C2B2B
  brine   #2F6E6A
  brass   #B98B3C
Use three or four of them per image maximum. Oxblood red means debt, damage, or interest,
and appears nowhere else. Most images should have no red at all.

NEGATIVE: no text, no letters, no numbers, no signature, no watermark, no border, no
frame, no card frame, no UI, no gradients, no glow, no rim light, no lens flare, no drop
shadow blur, no photorealism, no 3D render, no anime, no manga, no crosshatching, no
detailed rendering, no visible brush strokes, no fine detail, no extra colours.
```

### Why this style

Three reasons, all practical. Flat geometric shapes are the most consistent thing an image model can produce across hundreds of generations, because there's no rendering to drift. A seven-colour locked palette makes every image belong to the same game even when the shapes vary. And minimal art quantizes to tiny file sizes, which matters because the web demo is the marketing.

The tone should be picture-book calm about horrible subject matter. A clerk with too many arms, drawn the way you'd draw a friendly owl. That gap is the whole visual joke and it's what'll make screenshots stand out on a Steam page full of dark fantasy mush.

---

## 2. Consistency protocol

Do this in order. It's the difference between one art style and 129 art styles.

**Step 1. Anchor set.** Generate exactly three images first: `paper_cut` (card), `chalk_debtor` (enemy), `wick_neutral` (portrait). Iterate on these until they're right. They define the style for everything else.

**Step 2. Lock the reference.** Once approved, attach the anchor images as style reference on every subsequent generation. If the tool supports a fixed seed, fix it. If it supports style references by ID, use one.

**Step 3. Batch by category, never by convenience.** All 45 cards in one sitting. All enemies in another. Style drifts across sessions, so a category split across two days will look split.

**Step 4. Contact sheet check.** After each batch, tile the whole batch into one image and look at it. Drift is invisible one image at a time and obvious on a contact sheet. Anything that doesn't belong gets regenerated, not adjusted.

**Step 5. Palette enforcement.** Run every output through a quantizer that snaps to the seven palette colours before saving. The model will produce near-misses. Snapping them is not optional, it's what makes the set cohere.

---

## 3. Prompt template

```
[STYLE BLOCK, verbatim from §1]

SUBJECT: {subject line from the asset list}
COMPOSITION: {per category, from §4}
COLOURS: {three or four palette names}
OUTPUT: {dimensions}, PNG, {transparent background | paper #E8DFCE background}
```

Nothing else. Don't add mood words, don't add "highly detailed", don't add artist names beyond what's in the style block. Every extra adjective is a chance to drift.

---

## 4. Composition rules by category

**Cards** (768x576, paper background). Single subject, centred, generous margin. Object or gesture, not a scene. No characters unless the card is about a person. The bottom third stays visually quiet because rules text sits near it in the layout, even though the text is never in the image.

**Enemies** (640x640, transparent). Full body, feet near the bottom edge, facing slightly left of camera. Neutral standing pose, no action. Silhouette has to be identifiable in solid black, because a player will learn these by shape. Faces are blank, obscured, or absent. Debt-things don't have expressions.

**Bosses** (1024x1024, transparent). Same rules, but the silhouette should be roughly twice the visual mass. Phase 2 is the same character visibly damaged or escalated, recognisably the same shapes.

**Portraits** (512x640, transparent). Head and shoulders, three-quarter view. Wick is the only character in the demo with an actual face, and it should be a plain, tired, unremarkable face. Not handsome, not monstrous. Four expressions, and the difference between them should be tiny: a mouth line, an eye shape. Over-acting kills it.

**Backdrops** (1920x1080, opaque). Wide, empty, architectural. No characters, no focal object dead centre, because enemies stand there. Horizon low. These should feel like the room is waiting.

**Tokens** (256x256, transparent). One small object, centred, no context. Like a museum catalogue photograph of something sad.

**Icons** (128x128, transparent). Single shape, solid slate, no outline, no colour. These are tinted in CSS at runtime, so a coloured icon is a broken icon. Readable at 24 pixels.

**Node icons** (96x96, transparent). Same rules as icons but slightly more character allowed.

---

## 5. The asset list

129 files. Filenames are exact, no extension in the table, all `.png`.

### Cards (45, 768x576, paper background)

| File | Subject |
|---|---|
| `cards/paper_cut` | A single sheet of paper, one thin red line across a thumb |
| `cards/flinch` | A raised forearm, geometric, shielding a face that isn't shown |
| `cards/small_print` | A lens over a dense grey block of nothing |
| `cards/second_story` | A ladder leaning up into a small high window |
| `cards/alibi` | Two identical hats on two pegs, one casting the wrong shadow |
| `cards/sleight` | A hand, a coin half vanished between two fingers |
| `cards/slip_the_knot` | A rope loop coming undone, one end loose |
| `cards/cold_read` | Two eyes reading a completely blank card |
| `cards/bad_faith` | A handshake, the other hand hidden behind a back |
| `cards/nick` | A small knife and a cut purse string |
| `cards/winded_excuse` | An open mouth with a long ribbon of breath unspooling |
| `cards/tally_mark` | Four chalk strokes and a diagonal fifth |
| `cards/ninth_tongue` | Nine small tongues arranged like flower petals |
| `cards/perjure` | A hand flat on a book, fingers crossed behind the back |
| `cards/long_con` | A very long fuse burning slowly toward a small box |
| `cards/two_truths` | Two identical birds, one with a shadow that doesn't match |
| `cards/debt_of_honour` | A wax seal, cracked down the middle |
| `cards/sixpence_trick` | A coin balanced upright on the rim of a cup |
| `cards/recant` | Written words peeling off a page and going back into a mouth |
| `cards/hush_money` | A coin pressed flat against closed lips |
| `cards/grifters_cough` | A folded handkerchief with one red spot |
| `cards/doubling_back` | Footprints looping back over themselves |
| `cards/the_long_silence` | A bell with its clapper removed, hanging still |
| `cards/false_ledger` | A ledger page with one column rubbed clean |
| `cards/the_ninth_lie` | Nine cards fanned out, the ninth completely blank |
| `cards/everything_i_told_you` | An enormous drift of small paper slips |
| `cards/unwritten` | A blank page, one drop of ink about to land on it |
| `cards/collectors_interest` | A coin with smaller coins growing off it like fungus |
| `cards/the_face_you_made` | A cracked ceramic mask, geometric, no expression |
| `cards/nothing_owed` | An empty balance scale, perfectly level |
| `cards/salt_ration` | A twist of paper with salt spilling out |
| `cards/pry_bar` | A crowbar wedged into a seam in stone |
| `cards/lamp_oil` | A small tin lamp with a flat triangular flame |
| `cards/chalk_line` | A taut dusted string, caught mid snap |
| `cards/dead_mans_switch` | A hand gripping a lever, knuckles pale |
| `cards/common_debt` | A short stack of identical grey coins |
| `cards/hand_over_fist` | Many hands grabbing upward, overlapping |
| `cards/witness` | One wide unblinking eye painted on a wall |
| `cards/arrears` | A grey envelope, unopened, sealed |
| `cards/accrual` | A stack of envelopes, red showing along the edges |
| `cards/foreclosure` | A door with boards nailed across it |
| `cards/chalk_dust` | A cloud of white dust with nothing inside it |
| `cards/interest_owed` | A coin with a second smaller coin budding off it |
| `cards/the_notarys_countersign` | A single red stamp mark on paper |
| `cards/grief_unpaid` | An empty chair with a folded coat on it |

### Enemies (12, 640x640, transparent)

| File | Subject |
|---|---|
| `enemies/chalk_debtor` | A stooped figure built from chalk blocks, blank oval face |
| `enemies/tallymans_apprentice` | A thin young clerk carrying far too many chalk sticks |
| `enemies/dust_clerk` | A figure made of stacked paper wearing a green visor |
| `enemies/the_owed` | A small hunched figure with its hands out, waiting |
| `enemies/marginalia` | Three tiny spidery scribble creatures in a cluster |
| `enemies/receipt_wraith` | A long ribbon of receipt paper folded into a human shape |
| `enemies/chalk_hound` | A lean four-legged animal made of chalk sticks |
| `enemies/fined` | A person almost buried under a collapsing pile of paperwork |
| `enemies/fined_paperwork` | The paperwork pile alone, teetering, no person |
| `enemies/bailiff_kesk` | A broad heavy bailiff in a flat coat, no visible face |
| `enemies/bailiff_ledger` | A large ledger book floating open at chest height |
| `enemies/the_tithe_wolf` | A wolf assembled entirely from brass coins |

### Bosses (2, 1024x1024, transparent)

| File | Subject |
|---|---|
| `bosses/the_notary_p1` | A seated clerk with six thin arms, one holding a stamp, blank face, immaculate |
| `bosses/the_notary_p2` | The same clerk standing, arms splayed wide, ink running down its front |

### Portraits (4, 512x640, transparent)

`portraits/wick_neutral`, `wick_hurt`, `wick_dying`, `wick_win`. A plain tired person in their forties, dark coat, high collar, nothing remarkable about them. Expression changes are one line each.

### Backdrops (4, 1920x1080, opaque)

| File | Subject |
|---|---|
| `backdrops/chalk_wards_a` | A long filing corridor, shelves to the ceiling, low horizon |
| `backdrops/chalk_wards_b` | A chalk-dusted counting room, one high window |
| `backdrops/chalk_wards_c` | A stairwell going down, papers drifting in the shaft |
| `backdrops/chalk_wards_boss` | An enormous empty office, one desk, very far away |

### Tokens (20, 256x256, transparent)

One object each, named in §10 of the design doc, drawn literally. `tokens/a_childs_tooth`, `nine_feet_of_rope`, `someone_elses_wedding_band`, `a_jar_of_teeth`, `unsent_letter`, `salt_rimed_spectacles`, `the_notarys_nib`, `a_widows_thimble`, `half_a_locket`, `counterfeit_sixpence`, `ledger_bone`, `grave_dirt_in_a_handkerchief`, `a_debt_collectors_whistle`, `milk_tooth_necklace`, `the_rope_you_kept`, `a_bad_photograph`, `chalk_stub`, `interest_table`, `borrowed_coat`, `your_own_handwriting`.

### Icons (24, 128x128, transparent, solid slate only)

`icons/` + `guard`, `damage`, `bleed`, `slip`, `haste`, `perjury`, `echo`, `exhaust`, `strain`, `weight`, `salt`, `load`, `interest`, `compound`, `mark_slot`, `hp`, `draw`, `discard`, `deck`, `lap`, `type_attack`, `type_skill`, `lock`, `settle`.

Keep these dumb and obvious. `weight` is a simple weight. `lap` is a circular arrow. `perjury` is crossed fingers. Don't get clever, these need to read at 24 pixels.

### Node icons (8, 96x96, transparent)

`nodes/` + `debtor`, `collector`, `assay`, `reckoning`, `wake`, `hollow`, `vault`, `boss`.

### Store (9) and brand (1)

Sizes in §6 of the art contract. These are the only files allowed to contain text, and only the wordmark. `brand/wordmark` is the word ARREARS in a condensed slab serif, slightly letterpressed, slate on transparent, with the second R very slightly lower than the rest as if it settled.

---

## 6. Before you hand anything over

- Every file at exactly the specified dimensions, no rounding.
- Transparency where the table says transparent, and actually transparent, not white.
- Palette snapped. Run the quantizer.
- No text anywhere except `brand/wordmark` and the store capsules.
- Contact sheet per category, reviewed.
- Filenames exact. A typo means the game silently shows a placeholder forever and nobody notices for a month.

Drop the files into `public/art/<category>/` and run `npm run art:check`. It'll tell you what's missing, what's the wrong size, and what has a name that matches nothing in the game.
