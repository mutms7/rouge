/**
 * The main menu. A seed, a button, a run to resume if there is one, and the doors to
 * settings and credits.
 *
 * The seed is on screen and editable for the reason it is on screen everywhere else: a bug
 * report in this game is a seed.
 */
import { strings } from './strings';

export type TitleProps = {
  readonly seed: number;
  readonly hasSave: boolean;
  readonly onSeed: (seed: number) => void;
  readonly onBegin: () => void;
  readonly onResume: () => void;
  readonly onAbandon: () => void;
  readonly onSettings: () => void;
  readonly onCredits: () => void;
};

export function Title({ seed, hasSave, onSeed, onBegin, onResume, onAbandon, onSettings, onCredits }: TitleProps) {
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
          <button type="button" className="button button--quiet" onClick={onSettings}>
            {strings.select.settings}
          </button>
          <button type="button" className="button button--quiet" onClick={onCredits}>
            {strings.select.credits}
          </button>
        </div>
      </section>
    </main>
  );
}
