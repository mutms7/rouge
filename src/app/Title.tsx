/**
 * The way in. A seed, a button, and a run to resume if there is one.
 *
 * The seed is on screen and editable for the reason it is on screen everywhere else: a bug
 * report in this game is a seed. Phase 7 puts a proper main menu and a settings screen around
 * this; what has to be here now is the resume path, because save and resume is phase 4's exit
 * criterion and a resume nobody can reach is not resume.
 */
import { strings } from './strings';

export type TitleProps = {
  readonly seed: number;
  readonly hasSave: boolean;
  readonly onSeed: (seed: number) => void;
  readonly onBegin: () => void;
  readonly onResume: () => void;
  readonly onAbandon: () => void;
};

export function Title({ seed, hasSave, onSeed, onBegin, onResume, onAbandon }: TitleProps) {
  return (
    <main className="select">
      <header className="select__head">
        <h1 className="select__title">{strings.brand.title}</h1>
        <p className="select__tagline">{strings.brand.tagline}</p>
      </header>

      <section className="select__body">
        <h2 className="select__heading">{strings.select.heading}</h2>
        <p className="select__blurb">{strings.select.blurb}</p>

        {hasSave ? (
          <div className="select__resume">
            <p className="select__blurb">{strings.select.resumeBlurb}</p>
            <div className="sheet__actions">
              <button type="button" className="button" onClick={onResume} autoFocus>
                {strings.select.resume}
              </button>
              <button type="button" className="button button--quiet" onClick={onAbandon}>
                {strings.select.abandon}
              </button>
            </div>
          </div>
        ) : null}

        <label className="select__seed">
          <span>{strings.select.seed}</span>
          <input
            type="number"
            value={seed}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              onSeed(Number.isFinite(parsed) ? parsed : 0);
            }}
          />
          <button
            type="button"
            className="button button--quiet"
            onClick={() => {
              onSeed((seed + 1) % 100000);
            }}
          >
            {strings.select.reroll}
          </button>
        </label>

        <div className="sheet__actions">
          <button type="button" className="button" onClick={onBegin} {...(hasSave ? {} : { autoFocus: true })}>
            {strings.select.begin}
          </button>
        </div>
      </section>
    </main>
  );
}
