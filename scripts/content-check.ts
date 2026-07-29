/**
 * Content validation, at the command line.
 *
 * `npm run content:check`. The same `validateContent()` runs as a test, so CI catches a
 * dangling reference whether or not anybody remembers this script exists. This exists for
 * the case where you have just edited fifteen cards and want the whole list at once.
 */
import { CARD_LIST, COMPOUND_IDS, DRAFTABLE_IDS } from '../src/content/cards';
import { ENCOUNTERS, ENEMY_LIST } from '../src/content/enemies';
import { HOLLOW_LIST } from '../src/content/hollows';
import { deckLoad } from '../src/content/library';
import { MARKS } from '../src/content/marks';
import { formatProblems, validateContent } from '../src/content/schema';
import { WICK, compoundsPerLap } from '../src/content/run';
import { TOKEN_LIST } from '../src/content/tokens';
import { dormantKinds } from '../src/engine/vocabulary';

const problems = validateContent();

console.log('content:check');
console.log('');
console.log(`  ${'cards'.padEnd(14)}${String(CARD_LIST.length).padStart(4)}  (${String(DRAFTABLE_IDS.length)} draftable, ${String(COMPOUND_IDS.length)} Compound)`);
console.log(`  ${'Marks'.padEnd(14)}${String(Object.keys(MARKS).length).padStart(4)}`);
console.log(`  ${'Tokens'.padEnd(14)}${String(TOKEN_LIST.length).padStart(4)}`);
console.log(`  ${'bodies'.padEnd(14)}${String(ENEMY_LIST.length).padStart(4)}  (${String(ENCOUNTERS.length)} fights)`);
console.log(`  ${'Hollows'.padEnd(14)}${String(HOLLOW_LIST.length).padStart(4)}`);
console.log('');

const load = deckLoad(WICK.deck);
console.log(`  Wick's starter deck: ${String(WICK.deck.length)} cards, Load ${String(load)}, ${String(compoundsPerLap(load))} Compound(s) per lap`);

// The phase boundary, printed rather than promised. `vocabulary.ts` is the source.
const dormant = dormantKinds();
console.log('');
console.log(`  encoded, not yet live: ${String(dormant.effects.length)} effect atom(s), ${String(dormant.mods.length)} mod(s)`);
for (const kind of dormant.effects) console.log(`    effect  ${kind}`);
for (const kind of dormant.mods) console.log(`    mod     ${kind}`);

console.log('');
if (problems.length === 0) {
  console.log('content:check  clean');
} else {
  console.log(formatProblems(problems));
  console.log('');
  console.log(`content:check  ${String(problems.length)} problem(s)`);
  process.exitCode = 1;
}
