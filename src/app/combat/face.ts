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
import { cardText, describeEffects } from '../../content/rules-text';
import type { Card } from '../../content/types';
import { collectMods } from '../../engine/mods';
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

function textFor(state: CombatState, def: CardDef, known: Card | undefined, playable: boolean): string {
  const ordinary = known
    ? cardText(known)
    : cardText({ ...def, suit: 'neutral', rarity: 'neutral', mark: null } as Card);
  if (!playable || !state.compoundIds.includes(def.id)) return ordinary;

  const player = state.combatants.find((body) => body.team === 'player');
  const effects = collectMods(player?.mods ?? []).compoundPlayableAs;
  return effects.length > 0 ? describeEffects(effects) : ordinary;
}

export function faceOf(state: CombatState, cardId: string, playableOverride?: boolean): CardFaceData | null {
  const def = state.library[cardId];
  if (!def) return null;
  const known: Card | undefined = CARDS[cardId];
  const playable = playableOverride ?? def.playable !== false;

  if (!known) {
    return {
      def,
      suit: 'neutral',
      text: textFor(state, def, known, playable),
      flavour: null,
      markName: null,
      markText: null,
      known: false,
      playable,
    };
  }

  return {
    def,
    suit: known.suit,
    text: textFor(state, def, known, playable),
    flavour: known.flavour ?? null,
    markName: known.mark?.name ?? null,
    markText: known.mark?.text ?? null,
    known: true,
    playable,
  };
}
