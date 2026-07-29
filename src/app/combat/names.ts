/**
 * Telling two of the same thing apart.
 *
 * A body is not a fight: The Owed stands twice and Marginalia three times, and the engine
 * keeps them apart by id while the bestiary gives them one name and one PNG. On screen
 * that leaves two identical lanes on the track and a log where "The Owed takes 5" does not
 * say which one, which matters, because the whole lesson of that fight is target priority.
 *
 * So: a letter, but only when there is something to disambiguate. A lone Chalk Debtor is
 * never "Chalk Debtor A".
 */
import type { CombatState } from '../../engine/types';

const LETTERS = 'ABCDEFGH';

export function displayNames(state: CombatState): Readonly<Record<string, string>> {
  const totals = new Map<string, number>();
  for (const body of state.combatants) totals.set(body.name, (totals.get(body.name) ?? 0) + 1);

  const seen = new Map<string, number>();
  const out: Record<string, string> = {};
  for (const body of state.combatants) {
    if ((totals.get(body.name) ?? 0) < 2) {
      out[body.id] = body.name;
      continue;
    }
    const index = seen.get(body.name) ?? 0;
    seen.set(body.name, index + 1);
    out[body.id] = `${body.name} ${LETTERS[index] ?? String(index + 1)}`;
  }
  return out;
}
