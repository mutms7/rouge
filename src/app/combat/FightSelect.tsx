/**
 * A way into a fight, until there is a map.
 *
 * Phase 4 builds the run and this goes away. It exists because phase 3's exit criteria is
 * "play a full fight in the browser" and something has to hand the combat a seed and an
 * encounter. Keeping it a flat list of every Act 1 encounter costs nothing and makes the
 * other nine fights testable now rather than in two phases' time.
 *
 * The seed is on screen and editable for the same reason it is on screen everywhere else:
 * a bug report in this game is a seed.
 */
import { ENCOUNTERS } from '../../content/enemies';
import { enemyOf } from '../../content/enemies';
import { Art } from '../art/Art';
import { strings } from '../strings';

export type FightSelectProps = {
  readonly seed: number;
  readonly onSeed: (seed: number) => void;
  readonly onPick: (encounterId: string) => void;
};

export function FightSelect({ seed, onSeed, onPick }: FightSelectProps) {
  return (
    <main className="select">
      <header className="select__head">
        <h1 className="select__title">{strings.brand.title}</h1>
        <p className="select__tagline">{strings.brand.tagline}</p>
      </header>

      <section className="select__body">
        <h2 className="select__heading">{strings.select.heading}</h2>
        <p className="select__blurb">{strings.select.blurb}</p>

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

        <ul className="select__list">
          {ENCOUNTERS.map((encounter) => {
            const lead = enemyOf(encounter.members[0]?.defId ?? '');
            const art =
              lead.artKind === 'bosses'
                ? ({ kind: 'bosses', id: `${lead.id}_p1` } as const)
                : ({ kind: 'enemies', id: lead.id } as const);
            const hp = encounter.members.reduce((total, member) => total + enemyOf(member.defId).hp, 0);
            return (
              <li key={encounter.id}>
                <button type="button" className="select__card" onClick={() => { onPick(encounter.id); }}>
                  <span className="select__cardArt">
                    <Art kind={art.kind} id={art.id} />
                  </span>
                  <span className="select__cardName">{encounter.name}</span>
                  <span className="select__cardMeta">
                    {strings.select.tier[encounter.tier]} · {String(hp)} {strings.combat.hp} ·{' '}
                    {String(encounter.members.length)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
