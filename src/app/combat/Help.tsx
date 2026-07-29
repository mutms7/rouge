/**
 * The key legend.
 *
 * Every action in the fight is reachable without a mouse, which is a Steam requirement
 * from day one and the layer the gamepad maps onto in phase 8. A control scheme nobody can
 * find is the same as not having one, so this is one keypress away at all times.
 */
import { strings } from '../strings';

export function Help({ onClose }: { readonly onClose: () => void }) {
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={strings.keys.heading}>
      <div className="sheet__panel">
        <h2 className="sheet__title">{strings.keys.heading}</h2>
        <dl className="sheet__keys">
          {strings.keys.lines.map(([key, what]) => (
            <div className="sheet__key" key={`${key}${what}`}>
              <dt>{key}</dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="button" onClick={onClose} autoFocus>
          {strings.keys.close}
        </button>
      </div>
    </div>
  );
}
