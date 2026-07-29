/**
 * The end of a run.
 *
 * The terminal summary is derived from the run value: the deck you ended with, the Marks you
 * bought, and the cards you Settled to buy them. Settlement history is already in `runLog`,
 * so this screen can explain the final sheet without reconstructing any actions.
 */
import { deckLoadOf } from '../../engine/run';
import type { RunState } from '../../engine/runtypes';
import { strings } from '../strings';
import { acquiredMarksSummary, endedDeckSummary } from './summary';

export type RunOverProps = {
  readonly run: RunState;
  readonly onAgain: () => void;
};

export function RunOver({ run, onAgain }: RunOverProps) {
  const won = run.outcome === 'won';
  const deck = endedDeckSummary(run);
  const marks = acquiredMarksSummary(run);
  const titleId = 'run-over-title';

  return (
    <div
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="sheet__panel sheet__panel--runover" data-outcome={won ? 'won' : 'lost'}>
        <h2 className="sheet__title" id={titleId}>{won ? strings.run.over.won : strings.run.over.lost}</h2>
        <p className="sheet__blurb">{won ? strings.run.overBlurb.won : strings.run.overBlurb.lost}</p>
        <p className="sheet__stats">
          {strings.run.walkedNodes(run.visited.length)} · {strings.run.deck} {String(run.deck.length)} ·{' '}
          {strings.run.load} {String(deckLoadOf(run))} · {strings.run.salt} {String(run.salt)}
        </p>

        <section className="runover__section" aria-labelledby="run-over-deck">
          <h3 className="runover__heading" id="run-over-deck">{strings.run.overDeckHeading}</h3>
          {deck.length === 0 ? (
            <p className="runover__empty">{strings.run.empty}</p>
          ) : (
            <ul className="runover__list" aria-label={strings.run.overDeckHeading}>
              {deck.map((card) => (
                <li className="runover__item" key={card.id}>
                  {strings.run.overCardCount(card.name, card.count)}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="runover__section" aria-labelledby="run-over-marks">
          <h3 className="runover__heading" id="run-over-marks">{strings.run.overMarksHeading}</h3>
          {marks.length === 0 ? (
            <p className="runover__empty">{strings.run.overNoMarks}</p>
          ) : (
            <ul className="runover__marks" aria-label={strings.run.overMarksHeading}>
              {marks.map((mark) => (
                <li className="runover__mark" key={mark.id}>
                  <span className="runover__markName">{mark.name}</span>
                  {mark.settled.length === 0 ? (
                    <span className="runover__settled runover__settled--empty">{strings.run.overNoSettled}</span>
                  ) : (
                    <ul className="runover__settled" aria-label={strings.run.overSettled(mark.name)}>
                      {mark.settled.map((card) => (
                        <li key={card.id}>{strings.run.overSettled(strings.run.overCardCount(card.name, card.count))}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="sheet__actions">
          <button type="button" className="button" onClick={onAgain} autoFocus>
            {strings.run.again}
          </button>
        </div>
      </div>
    </div>
  );
}
