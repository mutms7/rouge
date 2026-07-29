/**
 * Keyboard play, as a pure function.
 *
 * Full keyboard play is a Steam-readiness requirement from day one, not a phase 7 polish
 * item, and in phase 8 the gamepad maps onto exactly this layer. So the mapping is a
 * function from (key, current UI state) to an intent, with no DOM in it and no handlers,
 * which means the whole control scheme is unit testable and the component that owns the
 * listener is four lines long.
 *
 * The scheme, and why:
 *
 *   left / right   move the hand cursor. Wraps, because a hand of ten with no wrap means
 *                  counting.
 *   1..9, 0        jump straight to a card. 0 is the tenth, which is the hand cap.
 *   enter / space  play the card under the cursor. If it needs a target and there is more
 *                  than one body standing, this opens targeting instead of committing.
 *   up             same as enter. Playing a card is "push it up onto the table".
 *   left / right   in targeting, choose the body.
 *   escape         back out of targeting, or clear the zoom.
 *   w              wait: spend a beat, draw a card. There is no end-turn button, so this
 *                  is the only way to pass, and Stillness makes it a real choice.
 *   d              discard the selected Compound at zero Weight when Familiar makes it legal.
 *   f              hold for fast-forward. Held rather than toggled, so it cannot be left
 *                  on by accident, and there is a toggle in the UI for people who want it
 *                  permanently.
 *   s              the character sheet: Marks, collateral, the whole deck. Reachable
 *                  mid-fight, because what is on the sheet is why the numbers are what they
 *                  are and the answer should never be behind a menu.
 *   ?              the key legend.
 *   enter / r      once the fight is decided, leave the board and get on with the run. It is
 *                  deliberately not a hotkey mid-fight: nothing should move on under your
 *                  hands while you are still holding cards.
 */

export type CombatIntent =
  | { readonly k: 'cursor'; readonly to: number }
  | { readonly k: 'cursor_move'; readonly by: number }
  | { readonly k: 'commit' }
  | { readonly k: 'discard' }
  | { readonly k: 'target_move'; readonly by: number }
  | { readonly k: 'cancel' }
  | { readonly k: 'wait' }
  | { readonly k: 'toggle_help' }
  | { readonly k: 'toggle_sheet' }
  | { readonly k: 'onward' };

export type KeyContext = {
  /** How many cards are in hand. Zero means the cursor keys have nothing to do. */
  readonly handSize: number;
  /** True while the player is choosing which body to point a card at. */
  readonly targeting: boolean;
  /** False once the fight is decided: only restart and help still answer. */
  readonly interactive: boolean;
};

/** The digit row, in hand order. `0` is the tenth card because the hand cap is ten. */
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

/**
 * Map a key to an intent, or null to let the browser have it.
 *
 * Takes the key name rather than an event so nothing in here has to know what a
 * `KeyboardEvent` is.
 */
export function intentForKey(key: string, context: KeyContext): CombatIntent | null {
  // `KeyboardEvent.key` is `ArrowLeft` and `Escape` but also `w` and `W`. Fold the lot,
  // once, so nothing below has to remember which shape it is looking at.
  const lower = key.toLowerCase();

  if (lower === '?' || lower === '/') return { k: 'toggle_help' };
  if (lower === 's') return { k: 'toggle_sheet' };
  if (lower === 'escape') return { k: 'cancel' };
  if (!context.interactive) {
    if (lower === 'r' || lower === 'enter' || lower === ' ') return { k: 'onward' };
    return null;
  }

  if (context.targeting) {
    if (lower === 'arrowleft') return { k: 'target_move', by: -1 };
    if (lower === 'arrowright') return { k: 'target_move', by: 1 };
    if (lower === 'enter' || lower === ' ' || lower === 'arrowup') return { k: 'commit' };
    return null;
  }

  if (lower === 'arrowleft') return { k: 'cursor_move', by: -1 };
  if (lower === 'arrowright') return { k: 'cursor_move', by: 1 };
  if (lower === 'enter' || lower === ' ' || lower === 'arrowup') return { k: 'commit' };
  if (lower === 'd') return { k: 'discard' };
  if (lower === 'w') return { k: 'wait' };

  const digit = DIGITS.indexOf(lower);
  if (digit >= 0 && digit < context.handSize) return { k: 'cursor', to: digit };

  return null;
}

/** Where the cursor ends up. Wraps, and stays at zero on an empty hand. */
export function moveCursor(cursor: number, by: number, size: number): number {
  if (size <= 0) return 0;
  return (((cursor + by) % size) + size) % size;
}

/** Held rather than toggled, so `keydown` and `keyup` both have to agree it is F. */
export function isFastForwardKey(key: string): boolean {
  return key.toLowerCase() === 'f';
}
