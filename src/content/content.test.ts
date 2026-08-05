/**
 * The content, checked as a set.
 *
 * `validateContent()` does the heavy relational work and runs here so CI catches a dangling
 * reference whether or not anybody remembers `npm run content:check` exists. The rest of
 * this file is the things worth asserting separately because they encode a decision:
 * the counts the design doc commits to, the rules-text contract, and the promise that
 * every atom the content reaches for is one the vocabulary actually knows about.
 */
import { describe, expect, it } from 'vitest';
import { EFFECT_VOCAB, MOD_VOCAB } from '../engine/vocabulary';
import { expectedArtIds } from './art';
import { CARDS, CARD_LIST, COMPOUND_IDS, DRAFTABLE_IDS } from './cards';
import { ENCOUNTERS, ENEMY_LIST, enemyOf } from './enemies';
import { HOLLOW_LIST } from './hollows';
import { CARD_LIBRARY, deckLoad, enemySetups, fightSetup, passivesFor } from './library';
import { MARKS } from './marks';
import { cardText, describeEffects, wordCount } from './rules-text';
import { EXPECTED_COUNTS, validateContent } from './schema';
import { compoundsPerLap, ICON_IDS, WICK } from './run';
import { TOKEN_LIST } from './tokens';
import { effectsDeep, loadOf, modEffects } from './types';
import { createCombat, legalActions, reduce } from '../engine/combat';

describe('validation', () => {
  it('has nothing dangling, duplicated, or miscounted', () => {
    expect(validateContent()).toEqual([]);
  });
});

describe('the counts the design doc commits to', () => {
  it('is 45 cards: 12 common, 12 uncommon, 6 rare, 8 neutral, 7 Compound', () => {
    expect(CARD_LIST).toHaveLength(EXPECTED_COUNTS.cards);
    const byRarity = (rarity: string) => CARD_LIST.filter((c) => c.rarity === rarity).length;
    expect(byRarity('common')).toBe(12);
    expect(byRarity('uncommon')).toBe(12);
    expect(byRarity('rare')).toBe(6);
    expect(byRarity('neutral')).toBe(8);
    expect(byRarity('compound')).toBe(7);
    expect(COMPOUND_IDS).toHaveLength(7);
    expect(DRAFTABLE_IDS).toHaveLength(38);
  });

  it('is 20 Tokens, 8 Hollows, 11 fights and 129 art files', () => {
    expect(TOKEN_LIST).toHaveLength(EXPECTED_COUNTS.tokens);
    expect(HOLLOW_LIST).toHaveLength(EXPECTED_COUNTS.hollows);
    expect(ENCOUNTERS).toHaveLength(EXPECTED_COUNTS.encounters);
    expect(ICON_IDS).toHaveLength(EXPECTED_COUNTS.icons);

    const art = expectedArtIds();
    const total = Object.values(art).reduce((n, ids) => n + ids.length, 0);
    expect(total).toBe(EXPECTED_COUNTS.art);
    // The split the art brief commits to, kind by kind.
    expect(art.cards).toHaveLength(45);
    expect(art.enemies).toHaveLength(12);
    expect(art.bosses).toEqual(['the_notary_p1', 'the_notary_p2']);
    expect(art.portraits).toEqual(['wick_neutral', 'wick_hurt', 'wick_dying', 'wick_win']);
    expect(art.tokens).toHaveLength(20);
    expect(art.icons).toHaveLength(24);
    expect(art.nodes).toHaveLength(8);
    expect(art.store).toHaveLength(9);
    expect(art.brand).toEqual(['wordmark']);
  });

  it('gives every settleable card a distinct Mark and nothing else one', () => {
    const printed = CARD_LIST.flatMap((c) => (c.mark ? [c.mark.id] : []));
    expect(new Set(printed).size).toBe(printed.length);
    expect(printed.sort()).toEqual(Object.keys(MARKS).sort());
    for (const id of COMPOUND_IDS) expect(CARDS[id]?.mark).toBeNull();
  });
});

describe('the vocabulary', () => {
  it('never reaches for an atom or a mod that does not exist', () => {
    for (const card of CARD_LIST) {
      for (const effect of effectsDeep(card.effects)) expect(EFFECT_VOCAB).toHaveProperty(effect.k);
      for (const mod of card.mods ?? []) expect(MOD_VOCAB).toHaveProperty(mod.k);
    }
    for (const source of [...Object.values(MARKS), ...TOKEN_LIST]) {
      for (const mod of source.mods) expect(MOD_VOCAB).toHaveProperty(mod.k);
      for (const effect of modEffects(source.mods)) expect(EFFECT_VOCAB).toHaveProperty(effect.k);
    }
    for (const enemy of ENEMY_LIST) {
      for (const intents of [enemy.intents, ...(enemy.phases ?? [])]) {
        for (const intent of intents) {
          for (const effect of effectsDeep(intent.effects)) expect(EFFECT_VOCAB).toHaveProperty(effect.k);
        }
      }
    }
  });

  it('keeps the dormant set small and deliberate', () => {
    // Not a golden number to chase: this is here so that quietly parking a mechanic as
    // "encoded, not live" shows up in a diff. Every one of these has an owner in
    // `vocabulary.ts` naming the phase that collects it.
    const dormantMods = Object.entries(MOD_VOCAB).filter(([, v]) => !v.live);
    for (const [, entry] of dormantMods) expect(entry.owner).toBeTruthy();
    // Phase 4 built the run, so every effect atom now has somewhere to land: the Tally
    // resolves its own and `engine/run.ts` resolves `reveal_nodes`.
    const dormantEffects = Object.entries(EFFECT_VOCAB).filter(([, v]) => !v.live);
    expect(dormantEffects.map(([k]) => k)).toEqual([]);
  });
});

describe('rules text', () => {
  it('renders something short for every card', () => {
    for (const card of CARD_LIST) {
      const text = cardText(card);
      expect(text.trim().length).toBeGreaterThan(0);
      // §13 asks for under 12 words where you can manage it. The scaling and conditional
      // cards need a clause; nothing needs a paragraph.
      expect(wordCount(text)).toBeLessThanOrEqual(18);
    }
  });

  it('only overrides where the generated line would read badly', () => {
    // An override that matches what the generator would have said is dead weight, and it
    // is the thing that silently goes stale when a number changes.
    for (const card of CARD_LIST) {
      if (card.textOverride === undefined) continue;
      expect(card.textOverride).not.toBe(describeEffects(card.effects));
    }
  });

  it('generates the doc wording for the plain cards', () => {
    // Numbers are phase 6's to move; the *sentences* are what this pins down. Each of these is a
    // different shape of generated line: one atom, two atoms, a nested Perjury, a modifier on the
    // atom, and a flag on a damage atom.
    expect(cardText(CARDS.paper_cut!)).toBe('Deal 5.');
    expect(cardText(CARDS.flinch!)).toBe('Guard 8.');
    expect(cardText(CARDS.small_print!)).toBe('Deal 4. Slip 2.');
    expect(cardText(CARDS.alibi!)).toBe('Guard 5. Perjury 4: Guard 6.');
    expect(cardText(CARDS.chalk_line!)).toBe('Guard 7, which does not decay for 3 beats.');
    expect(cardText(CARDS.pry_bar!)).toBe('Deal 8, ignores Guard.');
  });
});

describe('Load and Interest', () => {
  it('defaults Load to Weight and gives every Compound 2', () => {
    expect(loadOf(CARDS.paper_cut!)).toBe(1);
    expect(loadOf(CARDS.everything_i_told_you!)).toBe(5);
    for (const id of COMPOUND_IDS) expect(loadOf(CARDS[id]!)).toBe(2);
  });

  it('reads the Interest table off deck Load', () => {
    expect(compoundsPerLap(0)).toBe(0);
    expect(compoundsPerLap(14)).toBe(0);
    expect(compoundsPerLap(15)).toBe(1);
    expect(compoundsPerLap(29)).toBe(1);
    expect(compoundsPerLap(30)).toBe(2);
    expect(compoundsPerLap(45)).toBe(3);
    expect(compoundsPerLap(200)).toBe(3);
  });

  it('leaves the ten-card starter under the first threshold and bills the deck you grew', () => {
    // The point of the table, and the reason its bands moved in phase 6: the deck you are handed
    // is free to keep, and everything you add on top of it is what Interest is for.
    expect(compoundsPerLap(deckLoad(WICK.deck))).toBe(0);
    expect(compoundsPerLap(deckLoad([...WICK.deck, 'bad_faith', 'ninth_tongue']))).toBe(1);
  });

  it('starts Wick well under the first Interest bracket', () => {
    // A starter deck that already generated Compounds would teach the wrong lesson in
    // fight one. §4.2's first bracket is 25.
    expect(deckLoad(WICK.deck)).toBeLessThan(25);
  });
});

describe('Wick', () => {
  it('is 10 cards, all of which exist', () => {
    expect(WICK.deck).toHaveLength(10);
    for (const id of WICK.deck) expect(CARDS).toHaveProperty(id);
    expect(WICK.hp).toBe(68);
    expect(WICK.markSlots).toBe(3);
  });

  it('opens with something that teaches Perjury, because it is his whole signature', () => {
    const teaches = WICK.deck.some((id) => effectsDeep(CARDS[id]?.effects ?? []).some((e) => e.k === 'perjury'));
    expect(teaches).toBe(true);
  });
});

describe('the bestiary', () => {
  it('stages every body in a fight, and every fight with bodies that exist', () => {
    const staged = new Set(ENCOUNTERS.flatMap((e) => e.members.map((m) => m.defId)));
    expect([...staged].sort()).toEqual(ENEMY_LIST.map((e) => e.id).sort());
  });

  it('keeps both of the Notary phases exactly one lap long', () => {
    // The whole design of the fight: the re-ink window lands on the same two beats of every
    // lap, so the rhythm is learnable instead of lucky. §6.
    const notary = enemyOf('the_notary');
    for (const intents of [notary.intents, ...(notary.phases ?? [])]) {
      expect(intents.reduce((n, i) => n + i.weight, 0)).toBe(24);
      expect(intents.some((i) => i.effects.some((e) => e.k === 'vulnerable'))).toBe(true);
    }
  });

  it('floods the track with Marginalia on consecutive beats', () => {
    const marginalia = ENCOUNTERS.find((e) => e.id === 'marginalia');
    expect(marginalia?.members.map((m) => m.startBeat)).toEqual([0, 1, 2]);
  });

  it('offsets the two Owed so one is always buffing while the other hits', () => {
    const owed = ENCOUNTERS.find((e) => e.id === 'the_owed');
    expect(owed?.members.map((m) => m.intentOffset ?? 0)).toEqual([0, 1]);
  });
});

describe('the bridge into the engine', () => {
  it('builds a playable combat out of an encounter id', () => {
    const state = createCombat(fightSetup({ seed: 7, encounterId: 'chalk_debtor' }));
    expect(state.combatants.map((c) => c.id)).toEqual(['wick', 'chalk_debtor']);
    expect(state.deck.hand.length).toBeGreaterThan(0);
    expect(legalActions(state).length).toBeGreaterThan(1);
  });

  it('hands the engine the whole library, not just the deck', () => {
    // Interest generates Compounds mid-combat and Witness invents a card. Neither can look
    // up something that is not in the library.
    const state = createCombat(fightSetup({ seed: 7, encounterId: 'chalk_debtor' }));
    for (const id of COMPOUND_IDS) expect(state.library).toHaveProperty(id);
    expect(Object.keys(CARD_LIBRARY)).toHaveLength(EXPECTED_COUNTS.cards);
  });

  it('flattens Marks and Tokens into one list, because the Tally cannot tell them apart', () => {
    const mods = passivesFor({ marks: ['whetted'], tokens: ['a_jar_of_teeth'] });
    expect(mods).toEqual([
      { k: 'attack_damage', n: 1 },
      { k: 'bleed_bonus', n: 1 },
    ]);
  });

  it('gives every body in a fight a unique id, so two of The Owed can both exist', () => {
    const setups = enemySetups(ENCOUNTERS.find((e) => e.id === 'the_owed')!);
    expect(setups.map((s) => s.id)).toEqual(['the_owed_a', 'the_owed_b']);
    expect(new Set(setups.map((s) => s.id)).size).toBe(2);
  });

  it('plays every fight to a conclusion from the same seed, twice, identically', () => {
    for (const encounter of ENCOUNTERS) {
      const run = () => {
        let state = createCombat(fightSetup({ seed: 4, encounterId: encounter.id }));
        for (let step = 0; step < 400 && state.outcome === 'ongoing'; step += 1) {
          /*
           * Attacks first, then whatever is at the front of the hand.
           *
           * Taking `legalActions[0]` blindly used to work and now stalls against the Receipt
           * Wraith forever, for a reason that is the encounter working rather than failing: it
           * mirrors your last card as its next intent, so a driver that alternates Paper Cut and
           * Flinch hands it Guard 8 every other beat and it out-blocks the damage. 479 beats,
           * player on 127 Guard, Wraith on 22 HP, neither able to finish.
           *
           * Worth knowing about and not worth breaking this test over: what is under test here is
           * that the content bridges into the engine deterministically, not that a player who
           * says "Flinch" to a thing that repeats what you say deserves the fight they get.
           */
          const options = legalActions(state);
          const action =
            options.find((option) => {
              if (option.k !== 'play_card') return false;
              const held = state.deck.hand.find((card) => card.uid === option.uid);
              return held ? state.library[held.cardId]?.type === 'attack' : false;
            }) ?? options[0];
          if (!action) break;
          state = reduce(state, action);
        }
        return state;
      };
      const first = run();
      const second = run();
      expect(first.outcome).not.toBe('ongoing');
      expect(first.beat).toBe(second.beat);
      expect(first.log.length).toBe(second.log.length);
      expect(first.combatants.map((c) => c.hp)).toEqual(second.combatants.map((c) => c.hp));
    }
  });
});
