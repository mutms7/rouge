# Phase prompts

Paste one at a time, one per session where you can. Each one assumes `docs/prompts/CLAUDE_MASTER_BRIEF.md` has been read.

Don't skip ahead. Phases 1 and 2 have no UI at all, which feels slow and is the reason this project won't collapse in phase 6. A deckbuilder that can't play itself headlessly can't be balanced, and an unbalanced deckbuilder isn't a game.

---

## Phase 0 · Skeleton and the art pipeline

> Read `docs/prompts/CLAUDE_MASTER_BRIEF.md`, `docs/DESIGN.md`, and `docs/ART_CONTRACT.md`.
>
> Set up the project skeleton. Vite plus React 19 plus TypeScript strict, Vitest, ESLint with the bans described in the brief (no `Math.random`, `Date.now`, `window`, or `document` inside `src/engine/` or `src/content/`). Create the folder structure from the brief with an index file in each, no implementation yet.
>
> Then build the art pipeline end to end, because everything downstream depends on it existing:
> - `scripts/art-manifest.ts` scans `public/art/**` and writes `public/art/manifest.json`.
> - `scripts/art-check.ts` validates content IDs against the manifest and reports missing, orphan, wrong-dimension, and wrong-transparency files. Warn-only for now, since there's no art and no content.
> - An `<Art>` React component that takes a kind and an ID, renders the real image when the manifest has it, and renders the procedural placeholder described in the art contract when it doesn't. Placeholders print the ID and tint by suit.
> - `sharp` build step producing webp alongside png.
>
> Add a GitHub Actions workflow running typecheck, lint, test, build. Add `vercel.json`. Get a blank page with three `<Art>` placeholders on it deployed to Vercel so I can confirm the pipeline works before there's a game.
>
> **Exit criteria:** CI green. Vercel URL loads and shows three distinct labelled placeholders. `npm run art:check` runs and reports zero content IDs (correctly, since there's no content yet).

---

## Phase 1 · The Tally

> Build the combat engine. Headless, pure, no React, no UI whatsoever. This phase produces tests, nothing visible.
>
> Implement, per §3 of the design doc: the 24-beat looping track, markers, furthest-behind-acts-next resolution with ties going to the player, Weight as the only cost, persistent hand with a cap, draw-one-per-action, Guard decaying 1 per beat, Strain with its threshold, and the keywords Slip, Haste, Bleed, Perjury, Echo, Exhaust.
>
> Seeded `Rng` with separate streams. The reducer signature and the Node-purity test from the brief. A minimal `Combatant` shape good enough for a dummy player and a dummy enemy with a scripted intent list.
>
> Write the tests as you go, one per keyword, plus at least six tests specifically on beat ordering, since that's where the subtle bugs will live. Include a test proving a Weight 5 card gives a 3-beat-cadence enemy exactly the number of actions you'd expect.
>
> **Exit criteria:** a test that plays a full scripted combat between two dummies to a conclusion, deterministically, twice from the same seed with identical results. Node-purity test passing. Every keyword covered.

---

## Phase 2 · Content vocabulary, and all of it

> Design the effect atom vocabulary (per the brief: effects are data, not functions), then encode all demo content as typed data.
>
> All 45 cards from §9 of the design doc. All 20 Tokens from §10. All 11 Act 1 enemies from §11 with their intent patterns, including the Notary's two phases and its re-ink window. All 8 Hollows from §12. Every card's Mark.
>
> Generate rules text from effects, with an override field for the cards where it reads badly. Zod validation at build time for duplicate IDs, dangling Mark references, and Tokens referencing effects that don't exist.
>
> Then build the sim harness. `npm run sim -- --runs N --seed 0` plays full combats with a heuristic AI (a reasonable greedy policy is fine, it doesn't need to be good, it needs to be consistent) and reports win rate per enemy, average combat length in beats, damage taken per enemy, and card play frequency.
>
> Expect some of my numbers to be wrong. Tell me which ones the sim says are wrong, don't silently fix them.
>
> **Exit criteria:** `npm run sim -- --runs 2000` completes and prints a readable table. Every content ID validates. `npm run art:check` now reports 129 missing art files with correct paths, which is the number the Codex side needs to produce.

---

## Phase 3 · Combat, visible

> Build the combat UI. This is the first phase with pixels.
>
> The Tally track is the centrepiece and it has to be readable at a glance: markers, the beat grid, enemy intents pinned to the beats where they fire, and a clear preview of where your marker lands if you play the card you're hovering. That hover preview is the single most important piece of UI in the game. If a player can't see the cost of a heavy card before committing, the whole system reads as random.
>
> Hand, targeting, Guard with its decay visible as it happens, Strain, HP, enemy states, card zoom on hover, play by click and by keyboard.
>
> Animation with `motion`, all CSS transforms, driven off engine state changes. The engine never waits for an animation. Add a fast-forward that skips animation entirely, and make sure holding it never desyncs anything.
>
> **Exit criteria:** I can play a full fight against a Chalk Debtor and a Chalk Hound in the browser, with keyboard only, and win or lose. Placeholders everywhere, which is fine.

---

## Phase 4 · The run

> Build the layer above combat. Map generation for Act 1's 12 nodes with branching paths and the node types from §5.1, seeded and deterministic. Salt. The Assay shop, Reckoning with Mark slots, Wake, Vault, and all 8 Hollows.
>
> Marks: the character sheet, the 3-slot start, slot expansion, and Settling a card into its Mark with a confirm step, since it's irreversible.
>
> Save and resume. Seed plus action log per the brief, through `platform/`. Resuming mid-combat has to work, not just between nodes.
>
> Run log recording, per the brief. Nothing reads it yet. Write it anyway.
>
> **Exit criteria:** I can start a run, walk a full path through Act 1 up to but not including the boss, shop, Settle a card, take an event, close the tab, reopen, and resume exactly where I was including mid-fight.

---

## Phase 5 · Interest, and the Notary

> The deck economy from §4. Load values, the Interest table, Compound generation per lap, and all 7 Compound cards behaving correctly including the nasty ones (Interest Owed replicating at end of combat, Grief Unpaid blocking Guard while held).
>
> Then the Notary. Both phases, the countersign, the Mark-stamping, and the re-ink window with tripled damage. Get the re-ink window feeling readable, because a rhythm mechanic the player can't see is just unfair damage.
>
> Win and lose screens. Run summary showing the deck you ended with, the Marks you bought, and the cards you Settled to buy them.
>
> **Exit criteria:** a full Act 1 run is completable start to finish, including the boss, with win and lose both handled. `npm run sim` extended to play whole runs, not just combats.

---

## Phase 6 · Balance and feel

> Two things, in this order.
>
> First, balance. Run the sim at 10,000 runs. Target a 35 to 45 percent win rate for the heuristic AI, which usually lands somewhere near a 60 to 70 percent human win rate on a first difficulty tier. Report the outliers before changing them: cards never picked, cards always picked, enemies that kill nobody, enemies that kill everybody, and whether Interest ever actually bites. Propose changes, show me the table, then apply what I approve.
>
> Then feel. Screenshake on heavy hits, card impact, the Tally advancing with weight to it, Guard cracking as it decays, Salt counting up. Audio via Howler: card play, card draw, hit, Guard break, Interest firing, the Notary's stamp. The stamp should be the most memorable sound in the demo.
>
> Every effect respects the reduced-motion setting.
>
> **Exit criteria:** sim table showing the target win rate. A 30-second capture of a fight that looks like a real game.

---

## Phase 7 · Everything that makes it shippable

> Main menu, settings (audio sliders, reduced motion, font scale, colourblind-safe toggle, fast-forward default), a run-seed display and a seed input, credits, and a proper first-run tutorial for the Tally specifically. Not a wall of text. Teach it by making fight one a Chalk Debtor with a single telegraphed attack, and let the beat grid explain itself.
>
> Full keyboard navigation audit. Every screen, every dialog, no traps. Screen-reader labels on the track and the hand.
>
> Resolution scaling from 1280x720 up to ultrawide, verified.
>
> All user-facing strings moved into `strings.ts` if any escaped.
>
> **Exit criteria:** demo is complete on web. I can send the Vercel link to a stranger and they can play it without me explaining anything.

---

## Phase 8 · Tauri and Steam

> Wrap in Tauri v2. Implement the Tauri side of `platform/`: file-based saves in the app data directory (which is where Steam Cloud will point), and Steamworks via the Rust `steamworks` crate exposed through Tauri commands.
>
> Achievements for the demo: first Settle, first Interest trigger, beat the Notary, beat the Notary without ever letting Interest fire, finish a run with a deck of 8 cards or fewer, and one secret one for finding the `Nothing Here` event.
>
> Gamepad support mapped onto the existing keyboard input layer. Steam Deck verification checklist: default resolution, text size at 1280x800, controller glyphs, no mandatory text input.
>
> Windows and Linux builds out of CI.
>
> **Exit criteria:** a Windows build that launches from Steam in dev mode, unlocks an achievement, and saves to Steam Cloud. Deck-sized window playable with a controller.

---

## Phase 9 · Store page and stop

> Capture screenshots and trailer footage. Write the store description in the tone from §13 of the design doc, not marketing voice. Wire up the demo build for upload.
>
> `npm run art:check` must be zero-missing and CI-enforced by now.
>
> **Then stop.** Do not begin Act 2, Mother Sixpence, Orsel Hark, Small Mercy, the Inversion, or the Compound. The demo goes in front of real people first, and what they do with it decides what Milestone B actually looks like. Anything built before that is a guess with extra steps.

---

## A note on phase 6

If you only half-do one phase, don't let it be this one. Every roguelike deckbuilder that flopped had good ideas and bad numbers. The sim harness exists so that phase 6 is an afternoon of reading tables instead of six weeks of guessing, and it only works if phases 1 and 2 were done properly.
