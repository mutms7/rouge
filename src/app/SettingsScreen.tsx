/**
 * The settings screen.
 *
 * Reachable from the main menu and, mid-run, from the status bar: nothing here should ever
 * be locked behind leaving a fight, because turning the volume down is exactly the kind of
 * thing a player wants to do *during* the loud part.
 *
 * Every control is a real form element (`input[type=range]`, checkboxes, radio-shaped
 * buttons with `aria-pressed`) rather than a custom widget, so keyboard and screen-reader
 * support come from the browser instead of from code this game has to maintain.
 */
import { useRef } from 'react';
import { FONT_SCALES, useSettings, type FontScale } from './settings';
import { strings } from './strings';
import { useFocusTrap } from './useFocusTrap';

export function Settings({ onClose }: { readonly onClose: () => void }) {
  const volume = useSettings((s) => s.volume);
  const audioMuted = useSettings((s) => s.audioMuted);
  const reducedMotionOverride = useSettings((s) => s.reducedMotionOverride);
  const fontScale = useSettings((s) => s.fontScale);
  const colourblindSafe = useSettings((s) => s.colourblindSafe);
  const fastForwardLocked = useSettings((s) => s.fastForwardLocked);
  const setVolume = useSettings((s) => s.setVolume);
  const setAudioMuted = useSettings((s) => s.setAudioMuted);
  const setReducedMotionOverride = useSettings((s) => s.setReducedMotionOverride);
  const setFontScale = useSettings((s) => s.setFontScale);
  const setColourblindSafe = useSettings((s) => s.setColourblindSafe);
  const toggleFastForwardLock = useSettings((s) => s.toggleFastForwardLock);

  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, true);

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={strings.settings.heading}>
      <div className="sheet__panel settings__panel" ref={panel}>
        <h2 className="sheet__title">{strings.settings.heading}</h2>

        <section className="settings__section">
          <h3 className="settings__heading">{strings.settings.audioHeading}</h3>
          <label className="settings__row" htmlFor="settings-volume">
            <span>{strings.settings.volume}</span>
            <input
              id="settings-volume"
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(volume * 100)}
              disabled={audioMuted}
              onChange={(event) => {
                setVolume(Number(event.target.value) / 100);
              }}
              aria-valuetext={`${String(Math.round(volume * 100))}%`}
            />
            <span className="settings__value">{String(Math.round(volume * 100))}%</span>
          </label>
          <label className="settings__row">
            <span>{strings.settings.mute}</span>
            <input
              type="checkbox"
              checked={audioMuted}
              onChange={(event) => {
                setAudioMuted(event.target.checked);
              }}
            />
          </label>
        </section>

        <section className="settings__section">
          <h3 className="settings__heading">{strings.settings.displayHeading}</h3>
          <label className="settings__row">
            <span>
              {strings.settings.reducedMotion}
              <small className="settings__hint">{strings.settings.reducedMotionHint}</small>
            </span>
            <input
              type="checkbox"
              checked={reducedMotionOverride}
              onChange={(event) => {
                setReducedMotionOverride(event.target.checked);
              }}
            />
          </label>

          <div className="settings__row" role="group" aria-label={strings.settings.fontScale}>
            <span>{strings.settings.fontScale}</span>
            <span className="settings__scaleGroup">
              {FONT_SCALES.map((scale) => (
                <button
                  key={scale}
                  type="button"
                  className="button button--quiet settings__scaleOption"
                  data-selected={scale === fontScale || undefined}
                  aria-pressed={scale === fontScale}
                  onClick={() => {
                    setFontScale(scale as FontScale);
                  }}
                >
                  {strings.settings.fontScaleOption(Math.round(scale * 100))}
                </button>
              ))}
            </span>
          </div>

          <label className="settings__row">
            <span>
              {strings.settings.colourblindSafe}
              <small className="settings__hint">{strings.settings.colourblindSafeHint}</small>
            </span>
            <input
              type="checkbox"
              checked={colourblindSafe}
              onChange={(event) => {
                setColourblindSafe(event.target.checked);
              }}
            />
          </label>
        </section>

        <section className="settings__section">
          <h3 className="settings__heading">{strings.settings.playHeading}</h3>
          <label className="settings__row">
            <span>
              {strings.settings.fastForwardDefault}
              <small className="settings__hint">{strings.settings.fastForwardDefaultHint}</small>
            </span>
            <input
              type="checkbox"
              checked={fastForwardLocked}
              onChange={() => {
                toggleFastForwardLock();
              }}
            />
          </label>
        </section>

        <div className="sheet__actions">
          <button type="button" className="button" onClick={onClose} autoFocus>
            {strings.settings.close}
          </button>
        </div>
      </div>
    </div>
  );
}
