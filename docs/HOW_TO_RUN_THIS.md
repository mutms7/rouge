# How to actually run this

The operating manual. Read this one first.

There are two tracks and they don't block each other. Claude writes code against placeholders. Codex makes PNGs into fixed filenames. Neither one has to wait, which is the entire reason `ART_CONTRACT.md` exists.

Start both on day one.

---

## Day one, in order

**1. The repo.** Done. It lives at `C:\Users\William Chenyin\Documents\GitHub\rouge` and pushes to [mutms7/rouge](https://github.com/mutms7/rouge). Note the `gh` account: this one belongs to `mutms7`, not the work account, so if a push ever asks for a password, run `gh auth switch --user mutms7` first and switch back after.

**2. Kick off Codex.** Hand it `docs/prompts/CODEX_ART_PROMPT.md` and tell it to do step 1 of the consistency protocol only: three anchor images, nothing else. You review those three before it makes 126 more. This is the single highest-leverage review in the project, so don't rubber-stamp it.

**3. Kick off Claude.** New session, then paste this:

> Read `docs/prompts/CLAUDE_MASTER_BRIEF.md`, `docs/DESIGN.md`, and `docs/ART_CONTRACT.md`. Then do Phase 0 from `docs/prompts/CLAUDE_PHASES.md`.

That's the pattern for every phase. Point at the brief, name the phase. Don't paste the phase text itself, the file's already in the repo and Claude reads better from disk than from a wall of pasted markdown.

---

## The Claude loop, per phase

**One session per phase** where you can manage it. Phases 2, 4, and 5 might want two. Starting fresh keeps the context clean, and the master brief plus the repo state is enough for Claude to pick up cold.

At the end of each phase:

1. Make it run the exit criteria and paste the actual output. If it says "phase complete" without showing you a test run, ask for the test run. This is the most common way these projects rot, and it's easy to catch.
2. Actually play it yourself, from phase 3 onward. Five minutes.
3. Commit and push before starting the next phase, so you can always walk back one phase.

Then next session:

> Read `docs/prompts/CLAUDE_MASTER_BRIEF.md`. Phase 3 is done and pushed. Do Phase 4 from `docs/prompts/CLAUDE_PHASES.md`.

### When it goes sideways

**It starts building Act 2 or another character.** Stop it immediately. Say: "Out of scope, see the stop rule in the master brief. Go back to phase N." The scope creep on this project will always be toward content, because content is fun to write and systems are not.

**It makes art.** Same thing. Placeholders only. If you see an SVG that's trying to be an illustration, delete it.

**It adds a dependency you didn't expect.** Ask what it replaces. Usually the honest answer is "nothing", and it comes out.

**The engine reaches into the DOM.** The purity test catches this, which is why phase 1 builds the test before anything else. If that test ever gets skipped or deleted, the sim harness dies and phase 6 becomes guesswork.

**A phase is genuinely too big.** Split it and say so. "Do phase 4, but only the map generation and node types. Stop before the shop." Better than a half-finished phase you can't evaluate.

---

## The Codex loop

Slower cadence, bigger batches.

1. Anchor set. Three images. You approve.
2. Then one category per sitting, in this order: cards, enemies, bosses, tokens, icons, nodes, portraits, backdrops, store.
3. Contact sheet after every batch. Look at it as one image. Drift is invisible one-at-a-time.
4. Drop files into `public/art/<category>/`, run `npm run art:check`, fix whatever it flags.

Cards first because there are 45 of them and they're the biggest consistency risk. If the style is going to fall apart, you want to find out on card 12, not on the last backdrop.

Icons are the ones to rush if you're rushing something. They're 24 simple shapes in one colour and nobody has ever bought a game because of an icon.

---

## Where the two tracks meet

Only in one place: `npm run art:check`. That's deliberate.

Before phase 2, `art:check` has nothing to compare against and reports nothing useful. From phase 2 onward it knows all 129 expected filenames, so it becomes the shared to-do list. Run it whenever you want to know where the project actually is.

By phase 9 it has to report zero missing and be enforced in CI. That's the definition of art-complete.

---

## Realistic pacing

I'm not going to pretend to know how fast you work, but for shape:

Phases 0 through 2 are the unglamorous half and they're maybe a third of the total effort. There's nothing to look at until phase 3, which is demoralising, and then phase 3 makes it feel like a real game in about a day. Phases 4 and 5 are the biggest by volume. Phase 6 is short if 1 and 2 were done properly and brutal if they weren't. Phases 7 through 9 are a long tail of small things that always take longer than you'd think.

The one I'd protect is phase 6. Everything else can be sloppy and recovered later. Numbers can't.

---

## What to do when the demo is out

Nothing in this repo tells you what Milestone B looks like, and that's on purpose. Put the Vercel link in front of twenty people, watch five of them play without helping, and then decide.

The three questions worth answering with real players:

- Does the Tally read? Do they understand within two fights that Guard decays and heavy cards give the enemy time, or do they think the game is random?
- Does Settling land? Do they get that deleting a good card is how you get stronger, or do they hoard?
- Does Interest ever bite? If nobody's deck ever gets punished, the mechanic is decoration and needs numbers, not redesign.

If the answer to the first one is no, that's a UI problem and it's fixable. If the answer to the second one is no, that's a tutorial problem. If the answer to the third is no, that's phase 6 again.

Only then write Milestone B.
