/**
 * Everything the view needs to draw one card.
 *
 * The engine's library is `CardDef`, which is only what the Tally reads. The card *face*
 * (suit, rarity, the Mark it Settles into, the flavour line) lives in `content/`. Most of
 * the time the two are the same object, because `Card extends CardDef`.
 *
 * Most of the time, but not always: Witness invents a card mid-combat out of an enemy
 * intent, and it lands in the combat's library without a suit or a Mark, because it never
 * had one. So this resolves the face defensively and says so with `known`, rather than
 * throwing in a render because the player copied an intent.
 */
import { CARDS } from '../../content/cards';
import type { Suit } from '../../content/palette';
import { cardText } from '../../content/rules-text';
import type { Card } from '../../content/types';
import type { CardDef, CombatState } from '../../engine/types';

export type CardFaceData = {
  readonly def: CardDef;
  readonly suit: Suit;
  readonly text: string;
  readonly flavour: string | null;
  readonly markName: string | null;
  readonly markText: string | null;
  /** False for cards the content library has never heard of. Witness copies. */
  readonly known: boolean;
  readonly playable: boolean;
};

export function faceOf(state: CombatState, cardId: string): CardFaceData | null {
  const def = state.library[cardId];
  if (!def) return null;
  const known: Card | undefined = CARDS[cardId];

  if (!known) {
    return {
      def,
      suit: 'neutral',
      text: cardText({ ...def, suit: 'neutral', rarity: 'neutral', mark: null } as Card),
      flavour: null,
      markName: null,
      markText: null,
      known: false,
      playable: def.playable !== false,
    };
  }

  return {
    def,
    suit: known.suit,
    text: cardText(known),
    flavour: known.flavour ?? null,
    markName: known.mark?.name ?? null,
    markText: known.mark?.text ?? null,
    known: true,
    playable: def.playable !== false,
  };
}
