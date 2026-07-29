/**
 * The end of a run.
 *
 * Thin on purpose: phase 5 owns the real summary, which is the deck you ended with, the Marks
 * you bought, and the cards you Settled to buy them. That list is already in `runLog`, being
 * written and read by nobody, exactly as the brief asked. This says the four numbers that
 * matter today and offers another seed.
 */
import { markOf } from '../../content/marks';
import { deckLoadOf } from '../../engine/run';
import type { RunState } from '../../engine/runtypes';
import { strings } from '../strings';

export type RunOverProps = {
  readonly run: RunState;
  readonly onAgain: () => void;
};

export function RunOver({ run, onAgain }: RunOverProps) {
  const won = run.outcome === 'won';

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={won ? strings.run.over.won : strings.run.over.lost}>
      <div className="sheet__panel" data-outcome={won ? 'won' : 'lost'}>
        <h2 className="sheet__title">{won ? strings.run.over.won : strings.run.over.lost}</h2>
        <p className="sheet__blurb">{won ? strings.run.overBlurb.won : strings.run.overBlurb.lost}</p>
        <p className="sheet__stats">
          {strings.run.walkedNodes(run.visited.length)} · {strings.run.deck} {String(run.deck.length)} ·{' '}
          {strings.run.load} {String(deckLoadOf(run))} · {strings.run.salt} {String(run.salt)}
        </p>
        {run.marks.length === 0 ? null : (
          <p className="sheet__stats">
            {strings.run.marks}: {run.marks.map((id) => markOf(id).name).join(', ')}
          </p>
        )}
        <div className="sheet__actions">
          <button type="button" className="button" onClick={onAgain} autoFocus>
            {strings.run.again}
          </button>
        </div>
      </div>
    </div>
  );
}
