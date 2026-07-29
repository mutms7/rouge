/**
 * Won or lost.
 *
 * Deliberately thin. Phase 5 owns the real run summary (the deck you ended with, the Marks
 * you bought, the cards you deleted to buy them), and there is no run to summarise yet, so
 * this says the two things a combat knows about itself and gets out of the way.
 */
import { motion } from 'motion/react';
import { useDuration } from '../settings';
import { strings } from '../strings';
import type { CombatState } from '../../engine/types';

export type OutcomeProps = {
  readonly state: CombatState;
  readonly onAgain: () => void;
  readonly onLeave: () => void;
};

export function Outcome({ state, onAgain, onLeave }: OutcomeProps) {
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
          <button type="button" className="button" onClick={onAgain} autoFocus>
            {strings.outcome.again}
          </button>
          <button type="button" className="button button--quiet" onClick={onLeave}>
            {strings.outcome.back}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
