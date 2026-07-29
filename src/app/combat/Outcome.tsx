/**
 * Won or lost, on the board, for one beat before the run carries on.
 *
 * It exists because the run reducer settles a finished fight instantly: the moment the last
 * body falls, `run.combat` is null and the reward screen is up. Which is correct, and which
 * would also mean the player never sees the board they just won on. So the store holds the
 * finished combat until this is dismissed, and the only thing it can do is dismiss.
 *
 * Deliberately thin. Phase 5 owns the real run summary: the deck you ended with, the Marks
 * you bought, and the cards you Settled to buy them.
 */
import { motion } from 'motion/react';
import { useDuration } from '../settings';
import { strings } from '../strings';
import type { CombatState } from '../../engine/types';

export type OutcomeProps = {
  readonly state: CombatState;
  readonly onward: () => void;
  readonly label: string;
};

export function Outcome({ state, onward, label }: OutcomeProps) {
  const duration = useDuration(0.3);
  const won = state.outcome === 'won';

  return (
    <motion.div
      className="sheet"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration }}
      role="dialog"
      aria-modal="true"
      aria-label={won ? strings.outcome.won : strings.outcome.lost}
    >
      <div className="sheet__panel" data-outcome={state.outcome}>
        <h2 className="sheet__title">{won ? strings.outcome.won : strings.outcome.lost}</h2>
        <p className="sheet__blurb">{won ? strings.outcome.wonBlurb : strings.outcome.lostBlurb}</p>
        <p className="sheet__stats">
          {strings.outcome.beats(state.beat)} · {strings.outcome.cards(state.cardsPlayed)}
        </p>
        <div className="sheet__actions">
          <button type="button" className="button" onClick={onward} autoFocus>
            {label}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
