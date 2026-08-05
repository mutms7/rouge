/**
 * The Tally walkthrough.
 *
 * Fight one is always the Chalk Debtor, per `content/enemies.ts`: one attack, one cadence,
 * nothing hidden, so the beat grid can explain itself. This is the small nudge on top of
 * that, not a substitute for it: four short steps, no wall of text, shown once and never
 * again once dismissed.
 */
import { useRef, useState } from 'react';
import { strings } from '../strings';
import { useFocusTrap } from '../useFocusTrap';

export function Tutorial({ onClose }: { readonly onClose: () => void }) {
  const [step, setStep] = useState(0);
  const steps = strings.tutorial.steps;
  const last = step >= steps.length - 1;
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, true);

  const current = steps[step] ?? steps[0];

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={strings.tutorial.heading}>
      <div className="sheet__panel" ref={panel}>
        <h2 className="sheet__title">{strings.tutorial.heading}</h2>
        <p className="sheet__blurb" aria-live="polite">
          <strong>{current?.title}</strong>
          <br />
          {current?.body}
        </p>
        <div className="sheet__actions">
          {last ? (
            <button type="button" className="button" onClick={onClose} autoFocus>
              {strings.tutorial.done}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="button"
                onClick={() => {
                  setStep((s) => Math.min(steps.length - 1, s + 1));
                }}
                autoFocus
              >
                {strings.tutorial.next}
              </button>
              <button type="button" className="button button--quiet" onClick={onClose}>
                {strings.tutorial.skip}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
