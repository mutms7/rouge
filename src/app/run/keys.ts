/**
 * Keyboard play outside a fight, as a pure function.
 *
 * Same shape as `combat/keys.ts` and for the same reason: full keyboard play is a
 * Steam-readiness requirement from day one, phase 8's gamepad maps onto this layer, and a
 * mapping that is a function from (key, state) to an intent is a mapping you can unit test.
 *
 * The scheme is deliberately the same four keys everywhere, because every screen above
 * combat is one list:
 *
 *   left / right   move along the choices. Wraps.
 *   up / down      the same, so the map reads vertically and a shelf reads horizontally
 *                  without the player having to know which one they are looking at.
 *   1..9           jump straight to a choice.
 *   enter / space  take it. On something irreversible, arm it; press again to commit.
 *   escape         back out: close the sheet, close the legend, disarm the confirm.
 *   s              the character sheet. Marks, collateral, and the whole deck.
 *   ?              the key legend.
 */

export type RunIntent =
  | { readonly k: 'choice'; readonly to: number }
  | { readonly k: 'choice_move'; readonly by: number }
  | { readonly k: 'commit' }
  | { readonly k: 'cancel' }
  | { readonly k: 'toggle_sheet' }
  | { readonly k: 'toggle_help' };

export type RunKeyContext = {
  readonly choices: number;
  /** True while the sheet or the legend is up: only closing keys answer. */
  readonly overlay: boolean;
};

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function runIntentForKey(key: string, context: RunKeyContext): RunIntent | null {
  const lower = key.toLowerCase();

  if (lower === '?' || lower === '/') return { k: 'toggle_help' };
  if (lower === 'escape') return { k: 'cancel' };
  if (lower === 's') return { k: 'toggle_sheet' };
  if (context.overlay) return null;

  if (lower === 'arrowleft' || lower === 'arrowup') return { k: 'choice_move', by: -1 };
  if (lower === 'arrowright' || lower === 'arrowdown') return { k: 'choice_move', by: 1 };
  if (lower === 'enter' || lower === ' ') return { k: 'commit' };

  const digit = DIGITS.indexOf(lower);
  if (digit >= 0 && digit < context.choices) return { k: 'choice', to: digit };

  return null;
}
