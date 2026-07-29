/**
 * The character sheet: Marks, collateral, and the whole deck.
 *
 * §4.3's arc runs backwards from the genre norm. You finish with a *smaller* deck and an
 * enormous sheet, so the sheet is the thing the player is actually building and it has to be
 * one keypress away at all times, from anywhere, including mid-fight. The empty slots are
 * drawn rather than implied, because "three of eight" is the whole tension of Settling: it is
 * a bidding war over a small board, and you cannot bid against a board you cannot see.
 */
import { markOf } from '../../content/marks';
import { tokenOf } from '../../content/tokens';
import { deckLoadOf, deckView, markSlotsOf } from '../../engine/run';
import type { RunState } from '../../engine/runtypes';
import { compoundsPerLap } from '../../content/run';
import { CARDS } from '../../content/cards';
import { baseIdOf } from '../../engine/variants';
import { Art } from '../art/Art';
import { strings } from '../strings';
import { cardName, cardTextOf } from './choices';

export function Sheet({ run, onClose }: { readonly run: RunState; readonly onClose: () => void }) {
  const slots = markSlotsOf(run);
  const load = deckLoadOf(run);
  const cards = deckView(run);

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={strings.run.sheet}>
      <div className="sheet__panel sheet__panel--wide">
        <h2 className="sheet__title">{strings.run.sheet}</h2>

        <section className="roster">
          <h3 className="roster__heading">
            {strings.run.marks} <span className="roster__count">{strings.run.slots(run.marks.length, slots)}</span>
          </h3>
          <ul className="roster__list">
            {run.marks.map((id) => (
              <li className="roster__item" key={id}>
                <span className="roster__name">{markOf(id).name}</span>
                <span className="roster__text">{markOf(id).text}</span>
              </li>
            ))}
            {Array.from({ length: Math.max(0, slots - run.marks.length) }, (_, i) => (
              <li className="roster__item roster__item--empty" key={`empty${String(i)}`}>
                <span className="roster__name">&mdash;</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="roster">
          <h3 className="roster__heading">{strings.run.tokens}</h3>
          {run.tokens.length === 0 ? (
            <p className="roster__empty">{strings.run.empty}</p>
          ) : (
            <ul className="roster__list">
              {run.tokens.map((id) => (
                <li className="roster__item" key={id}>
                  <span className="roster__art">
                    <Art kind="tokens" id={id} alt={tokenOf(id).name} />
                  </span>
                  <span className="roster__name">{tokenOf(id).name}</span>
                  <span className="roster__text">{tokenOf(id).text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="roster">
          <h3 className="roster__heading">
            {strings.run.deck} <span className="roster__count">{String(cards.length)}</span>
            <span className="roster__count">
              {strings.run.load} {String(load)} · {strings.run.loadHint(compoundsPerLap(load))}
            </span>
          </h3>
          <ul className="roster__deck">
            {cards.map((card) => {
              const base = CARDS[baseIdOf(card.cardId)];
              return (
                <li className="roster__card" key={card.uid}>
                  <span className="roster__cardArt">
                    <Art
                      kind="cards"
                      id={baseIdOf(card.cardId)}
                      {...(base ? { suit: base.suit, glyph: base.type } : {})}
                      alt={cardName(card.cardId)}
                    />
                  </span>
                  <span className="roster__cardName">{cardName(card.cardId)}</span>
                  <span className="roster__cardMeta">
                    {strings.combat.weight} {String(card.def.weight)} · {strings.run.load}{' '}
                    {String(card.def.load ?? card.def.weight)}
                  </span>
                  <span className="roster__text">{cardTextOf(run, card.cardId)}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <button type="button" className="button" onClick={onClose} autoFocus>
          {strings.keys.close}
        </button>
      </div>
    </div>
  );
}
