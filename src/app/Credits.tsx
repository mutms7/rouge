/**
 * Credits. One screen, one job: say who made it and get out of the way.
 */
import { useRef } from 'react';
import { strings } from './strings';
import { useFocusTrap } from './useFocusTrap';

export function Credits({ onClose }: { readonly onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, true);

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={strings.credits.heading}>
      <div className="sheet__panel" ref={panel}>
        <h2 className="sheet__title">{strings.credits.heading}</h2>
        {strings.credits.body.map((line) => (
          <p className="sheet__blurb" key={line}>
            {line}
          </p>
        ))}
        <div className="sheet__actions">
          <button type="button" className="button" onClick={onClose} autoFocus>
            {strings.credits.close}
          </button>
        </div>
      </div>
    </div>
  );
}
