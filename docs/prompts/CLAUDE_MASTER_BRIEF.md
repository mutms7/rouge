# Master brief for Claude

Paste this at the top of every session, or point Claude at the file path. It's the standing context. The phase prompts in `CLAUDE_PHASES.md` assume you've read this.

---

## What you're building

**ROUGE**, a roguelike deckbuilding dungeon crawler. Web-first TypeScript, wrapped in Tauri for a Steam release.

Read `docs/DESIGN.md` for the game and `docs/ART_CONTRACT.md` for how art lands. Don't restate them back to me, just build against them.

**You are building the playable demo only: Wick, Act 1, the Notary, 45 cards, 20 Tokens, 11 enemies, 8 events.** Everything past that is sketched in §14 of the design doc and is out of scope. If you finish a phase early, improve what exists. Don't start Act 2.

**You never make art.** Not PNGs, not SVGs pretending to be art, not emoji standing in for illustrations. Placeholders are procedural and specified in the art contract. A separate image pipeline fills in the real files.

---

## Stack, locked

| Thing | Choice |
|---|---|
| Build | Vite, TypeScript in `strict` mode |
| View | React 19 |
| State binding | Zustand |
| Animation | `motion` (CSS transforms, no canvas for cards) |
| Audio | Howler |
| Tests | Vitest |
| Content validation | Zod, build time only |
| Desktop shell | Tauri v2 (phase 8) |
| Steamworks | the Rust `steamworks` crate behind Tauri commands (phase 8) |
| Web host | Vercel |

Don't add dependencies without telling me why in one sentence. Particularly: no game engine, no ECS library, no state machine library, no CSS framework. The whole thing is small enough that the abstractions would cost more than they save.

---

## Architecture, the one rule that matters

```
src/
  engine/     pure TypeScript. deterministic. zero DOM, zero React, zero browser APIs.
  content/    the data. cards, enemies, tokens, events, act layout.
  app/        React. renders engine state, dispatches actions, owns all animation.
  platform/   web and tauri adapters behind one interface (save, achievements, telemetry).
  sim/        headless balance harness. imports engine + content, never app.
```

**`engine/` must run in bare Node with no DOM.** There's a test that imports it in a node environment and fails if anything reaches for `window`, `document`, `Date`, or `Math.random`. Keep that test passing. It's not bureaucracy, it's the thing that makes everything else below possible.

The engine is a reducer. `(state, action) => state`, no mutation, no side effects, no async. The view dispatches actions and renders what comes back. Animation lives entirely in the view and never blocks or delays engine state, so a combat can resolve in a microsecond when nobody's watching.

### Determinism

Every random decision goes through an injected `Rng` seeded off the run seed. `Math.random` and `Date.now` are banned in `engine/` and `content/` by lint rule. Separate RNG streams per concern (map generation, card rewards, shuffles, enemy AI) so that changing one thing doesn't reshuffle everything else downstream.

This buys four things at once and it's why I'm insisting on it up front:

1. A save file is a seed plus an action log, which makes saves tiny and makes mid-run resume trivial.
2. Bug reports become "here's my seed" and you reproduce it exactly.
3. The sim harness can play ten thousand runs, which is the only honest way to balance a deckbuilder.
4. The Act 4 run-log and the Compound boss come almost for free later.

### The run log

Even though nothing reads it in the demo, the engine records every card removed, Settled, exhausted, and every event option refused, into `state.runLog`. Append-only, part of the save. It costs a few lines now. Retrofitting it once there are three acts is genuinely miserable.

---

## Content data

Content is TypeScript, not JSON. Typed literals with `satisfies CardDef`, so you get autocomplete and compile-time errors on typos, plus a Zod pass at build time for the things types can't catch (duplicate IDs, dangling references, Marks pointing at nothing).

Card effects are **data, not functions**. A card is a list of typed effect atoms:

```ts
{ id: 'small_print', suit: 'lie', weight: 2, type: 'attack',
  effects: [{ k: 'damage', n: 4 }, { k: 'slip', n: 2 }],
  mark: { id: 'fine_print', ... } }
```

Effects as data means the sim can reason about cards, the UI can auto-generate rules text and tooltips, and localization has something to hang off. The moment a card needs a bespoke function, that's a signal the effect vocabulary is missing an atom. Add the atom.

Rules text is generated from effects by default, with a hand-written override field for the handful of cards where generated text reads badly.

---

## Testing

- Unit tests on engine reducers. Every keyword gets one.
- Seeded golden tests: a fixed seed plays a fixed action list, and the final state snapshot is committed. Catches accidental behaviour changes instantly.
- `npm run sim` plays N full runs with a heuristic AI and reports win rate per node, deaths per enemy, card pick and win rates, average run length, HP curve by node depth, and Interest pressure over time. Balance decisions come from this, not vibes.
- The Node-purity test on `engine/`.

I'd rather have thirty sharp engine tests than two hundred shallow ones that assert React rendered a div.

---

## Steam readiness, from day one not phase eight

These are cheap if you do them as you go and expensive to bolt on:

- **Everything through `platform/`.** Saves, achievements, telemetry. Web implementations are localStorage and no-ops. Tauri implementations come in phase 8 and change nothing above them.
- **Full keyboard play.** Every action reachable without a mouse. Card selection, targeting, map navigation, menus. Gamepad in phase 8 maps onto the same input layer.
- **All strings in one place** from the start. Not a full i18n library, just a single `strings.ts` and no bare user-facing text in components.
- **Reduced motion and font scale** settings honoured by every animation and every text node.
- **Colourblind check.** Brine and Oxblood are the risky pair. Never encode information in colour alone. Shape and text always carry it too.
- **16:9 base at 1920x1080**, scaled with CSS. No layout that breaks at 1280x720 or on ultrawide.

---

## How I want you to work

Small commits with real messages. Tests alongside the code, not after. When you hit a design question the docs don't answer, pick the option that's easiest to reverse, do it, and flag it in one line at the end of your reply. Don't stop and ask unless getting it wrong would mean rewriting a system.

At the end of every phase, run the phase's exit criteria yourself and tell me the actual result. If tests fail, say they failed and paste the output. Don't tell me a phase is done when it's half done. I'd much rather hear "phase 3 is done except save/resume, which is broken because of X" than find out myself.

Don't write summary documents about what you did unless I ask. The code and the commit log are the record.
