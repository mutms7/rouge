import { Art } from './art/Art';
import { artFileCount, artKindCount, isArtManifestLoaded } from './art/manifest';
import './app.css';
import { strings } from './strings';

/**
 * Phase 0 has no game in it. This page exists to prove one thing end to end: art is
 * addressed by content ID, a missing file is a readable placeholder, and a file that
 * lands shows up with no code change.
 *
 * Spread across kinds on purpose, so whatever the art track has and has not delivered
 * yet, this page shows both halves of the contract at once.
 */
const SAMPLES = [
  { kind: 'cards', id: 'paper_cut', suit: 'lie', glyph: 'attack' },
  { kind: 'cards', id: 'arrears', suit: 'compound' },
  { kind: 'enemies', id: 'chalk_debtor' },
  { kind: 'bosses', id: 'the_notary_p1' },
  { kind: 'tokens', id: 'ledger_bone' },
  { kind: 'nodes', id: 'reckoning' },
] as const;

export function App() {
  const files = artFileCount();

  return (
    <main className="shell">
      <header className="shell__head">
        <h1 className="shell__title">{strings.brand.title}</h1>
        <p className="shell__tagline">{strings.brand.tagline}</p>
      </header>

      <section>
        <h2 className="shell__heading">{strings.pipeline.heading}</h2>
        <p className="shell__blurb">{strings.pipeline.blurb}</p>
        <p className="shell__status">
          {!isArtManifestLoaded()
            ? strings.pipeline.manifestMissing
            : files === 0
              ? strings.pipeline.manifestEmpty
              : strings.pipeline.manifestCount(files, artKindCount())}
        </p>
      </section>

      <ul className="samples">
        {SAMPLES.map((sample) => (
          <li className="samples__item" key={`${sample.kind}/${sample.id}`}>
            <Art
              kind={sample.kind}
              id={sample.id}
              {...('suit' in sample ? { suit: sample.suit } : {})}
              {...('glyph' in sample ? { glyph: sample.glyph } : {})}
            />
            <code className="samples__path">{`public/art/${sample.kind}/${sample.id}.png`}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}
