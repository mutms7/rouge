# ARREARS

*Codename: Rouge.*

A roguelike deckbuilding dungeon crawler about carrying other people's debts down a hole and finding out what yours was.

Nothing is built yet. This repo currently holds the design and the two build briefs.

---

## The short version

You're a licensed debt-eater in the salt city of Kell Harrow. Debts are physical, and you swallow them for a fee. Everything you swallow becomes a card. You go down into the Ledger looking for your own debt, which was taken off you when you were apprenticed and which nobody has ever explained.

Three things make it not a Slay the Spire clone:

**No energy, no turns.** Combat runs on a shared 24-beat initiative track. Cards cost Weight in beats, and whoever's furthest behind acts next. Guard decays per beat, so when you raise it matters more than how much.

**Cards graduate into passives.** Settling a card deletes it forever and grants the Mark printed on it. Your deck shrinks all run while your character sheet grows, which is backwards from the genre. Meanwhile deck bloat literally manufactures junk through the Interest mechanic.

**The map inverts.** Act 4 is the same map, climbed, carrying the thing you found at the bottom. The final boss's deck is built from everything you threw away.

---

## Docs

| File | What it's for |
|---|---|
| [HOW_TO_RUN_THIS.md](docs/HOW_TO_RUN_THIS.md) | Read this first. The operating manual. |
| [DESIGN.md](docs/DESIGN.md) | The game. Systems, story, all 45 demo cards, bosses, enemies, events. |
| [ART_CONTRACT.md](docs/ART_CONTRACT.md) | How art and code stay decoupled. Both AIs read this. |
| [prompts/CLAUDE_MASTER_BRIEF.md](docs/prompts/CLAUDE_MASTER_BRIEF.md) | Standing context for every Claude session. |
| [prompts/CLAUDE_PHASES.md](docs/prompts/CLAUDE_PHASES.md) | Phases 0 to 9, paste one at a time. |
| [prompts/CODEX_ART_PROMPT.md](docs/prompts/CODEX_ART_PROMPT.md) | Style bible and all 129 asset prompts. |

---

## Scope

The build target is a **playable demo**: Wick, Act 1, the Notary, 45 cards, 20 Tokens, 12 enemy sprites, 8 events. Steam-ready, meaning it ships as a real Tauri build with achievements and controller support, not just a web page.

Everything past that (Acts 2 and 3, the other three characters, the Inversion, the Compound) is sketched in §14 of the design doc and deliberately left thin. Real players decide what gets built next.

---

## Stack

TypeScript and Vite, React for the view, a pure deterministic engine core with no DOM so it can be simulated headlessly, Tauri v2 for the desktop build, Steamworks through the Rust crate. Vercel for the web demo.

The engine being pure and seeded isn't fussiness. It's what makes the balance sim possible, and a deckbuilder you can't simulate is a deckbuilder you can't balance.
