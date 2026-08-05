import { describe, expect, it } from 'vitest';
import { CARDS } from '../content/cards';
import type { CardDef } from './types';
import {
  baseIdOf,
  deriveVariant,
  heavierId,
  isVariantId,
  parseVariantId,
  upgradedId,
  variantId,
  withVariants,
} from './variants';

const paperCut = CARDS['paper_cut'] as CardDef;
const flinch = CARDS['flinch'] as CardDef;

describe('variant ids', () => {
  it('round-trips a spec', () => {
    for (const spec of [
      { baseId: 'paper_cut', upgraded: false, load: 0 },
      { baseId: 'paper_cut', upgraded: true, load: 0 },
      { baseId: 'paper_cut', upgraded: false, load: 2 },
      { baseId: 'small_print', upgraded: true, load: 1 },
    ]) {
      expect(parseVariantId(variantId(spec))).toEqual(spec);
    }
  });

  it('always gets back to the card the art is filed under', () => {
    expect(baseIdOf('paper_cut')).toBe('paper_cut');
    expect(baseIdOf('paper_cut+')).toBe('paper_cut');
    expect(baseIdOf('paper_cut+^^')).toBe('paper_cut');
    expect(isVariantId('paper_cut')).toBe(false);
    expect(isVariantId('paper_cut+')).toBe(true);
  });

  it('upgrades once and no further', () => {
    expect(upgradedId('paper_cut')).toBe('paper_cut+');
    expect(upgradedId('paper_cut+')).toBeNull();
    expect(heavierId('paper_cut+')).toBe('paper_cut+^');
  });
});

describe('deriving a variant', () => {
  // Written as deltas off whatever the card currently prints, so a balance pass moving Paper Cut
  // or Flinch does not land here as a failure. The curve is the thing under test, not the number.
  const printed = (def: CardDef, kind: string): number =>
    def.effects.reduce((found, effect) => (effect.k === kind && 'n' in effect ? effect.n : found), 0);

  it('bumps the numbers and says so in the name', () => {
    const up = deriveVariant(paperCut, { baseId: 'paper_cut', upgraded: true, load: 0 });
    expect(up.name).toBe('Paper Cut +');
    expect(up.effects).toEqual([{ k: 'damage', n: printed(paperCut, 'damage') + 2 }]);
    expect(up.baseId).toBe('paper_cut');
  });

  it('keeps Guard and damage on their own curves', () => {
    const up = deriveVariant(flinch, { baseId: 'flinch', upgraded: true, load: 0 });
    // Guard upgrades by 3 where damage upgrades by 2: a point of Guard is worth less than a point
    // of damage, so it takes more of them to feel like an upgrade.
    expect(up.effects).toEqual([{ k: 'guard', n: printed(flinch, 'guard') + 3 }]);
  });

  /**
   * The one that would have been a stealth buff.
   *
   * `CardDef.load` defaults to `weight`, so a variant that gets cheaper to play would also
   * quietly get cheaper to *carry*, and upgrading would become a way to dodge Interest.
   */
  it('never lets an upgrade reduce deck Load', () => {
    for (const card of Object.values(CARDS)) {
      const up = deriveVariant(card, { baseId: card.id, upgraded: true, load: 0 });
      expect(up.load ?? up.weight).toBe(card.load ?? card.weight);
    }
  });

  it('adds Load without touching anything else', () => {
    const heavy = deriveVariant(paperCut, { baseId: 'paper_cut', upgraded: false, load: 1 });
    expect(heavy.load).toBe((paperCut.load ?? paperCut.weight) + 1);
    expect(heavy.effects).toEqual(paperCut.effects);
    expect(heavy.name).toBe(paperCut.name);
  });

  it('pays a card with nothing to bump in beats instead', () => {
    // A card whose whole payload is timing or bookkeeping cannot get a bigger number, so the
    // upgrade comes off its Weight. Every card has to be worth inking or a Wake is a trap.
    const nothingToBump: CardDef = {
      id: 'test_ledger',
      name: 'Ledger',
      weight: 2,
      type: 'skill',
      targeting: 'none',
      effects: [{ k: 'reveal_intents', n: 1 }],
    };
    const up = deriveVariant(nothingToBump, { baseId: 'test_ledger', upgraded: true, load: 0 });
    expect(up.weight).toBe(1);
    expect(up.load).toBe(2);
  });

  it('upgrades what a perjury swears, and swears it sooner', () => {
    const sworn: CardDef = {
      id: 'test_lie',
      name: 'Lie',
      weight: 0,
      type: 'attack',
      targeting: 'opponent',
      effects: [{ k: 'perjury', in: 3, effects: [{ k: 'damage', n: 9 }] }],
    };
    const up = deriveVariant(sworn, { baseId: 'test_lie', upgraded: true, load: 0 });
    expect(up.effects).toEqual([{ k: 'perjury', in: 2, effects: [{ k: 'damage', n: 11 }] }]);
  });
});

describe('the run library', () => {
  it('answers for every variant a deck is holding', () => {
    const library = withVariants(CARDS, ['paper_cut', 'paper_cut+', 'flinch+^']);
    expect(library['paper_cut+']?.name).toBe('Paper Cut +');
    expect(library['flinch+^']?.load).toBe((flinch.load ?? flinch.weight) + 1);
    // And leaves the printed cards exactly as they were.
    expect(library['paper_cut']).toBe(CARDS['paper_cut']);
  });

  it('ignores an id it has never heard of rather than inventing a card', () => {
    const library = withVariants(CARDS, ['not_a_card+']);
    expect(library['not_a_card+']).toBeUndefined();
  });
});
