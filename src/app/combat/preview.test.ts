import { describe, expect, it } from 'vitest';
import { fightSetup } from '../../content/library';
import { createCombat, reduce } from '../../engine/combat';
import type { CombatState } from '../../engine/types';
import { previewAction } from './preview';

function fight(encounterId: string, seed = 1): CombatState {
  return createCombat(fightSetup({ seed, encounterId }));
}

function uidOf(state: CombatState, cardId: string): string {
  const found = state.deck.hand.find((c) => c.cardId === cardId);
  if (!found) throw new Error(`${cardId} is not in the opening hand of this seed`);
  return found.uid;
}

describe('the hover preview', () => {
  it('does not touch the state it was asked about', () => {
    const state = fight('chalk_hound');
    const before = JSON.stringify(state);
    previewAction(state, { k: 'play_card', uid: uidOf(state, 'paper_cut') });
    expect(JSON.stringify(state)).toBe(before);
  });

  /**
   * The guarantee the whole design rests on. If this ever fails, the preview is lying and
   * the player is being asked to plan against fiction.
   */
  it('shows exactly what committing does', () => {
    const state = fight('chalk_hound');
    const action = { k: 'play_card', uid: uidOf(state, 'small_print') } as const;
    const preview = previewAction(state, action);
    const committed = reduce(state, action);

    expect(preview).not.toBeNull();
    const player = committed.combatants.find((c) => c.team === 'player');
    expect(preview?.landsOn).toBe(player?.position);
    expect(preview?.hpAfter).toBe(player?.hp);
    expect(preview?.guardAfter).toBe(player?.guard);
    expect(preview?.strainAfter).toBe(committed.strain);
    for (const body of preview?.bodies ?? []) {
      expect(body.hpAfter).toBe(Math.max(0, committed.combatants.find((c) => c.id === body.id)?.hp ?? 0));
    }
  });

  it('is stable: previewing twice gives the same answer', () => {
    const state = fight('the_owed');
    const action = { k: 'play_card', uid: uidOf(state, 'paper_cut'), targetId: 'the_owed_b' } as const;
    expect(previewAction(state, action)).toEqual(previewAction(state, action));
  });

  it('prices the beats a card hands over', () => {
    const state = fight('chalk_hound');
    // Chalk Hound acts every 3 beats and both markers open on 0.
    const light = previewAction(state, { k: 'play_card', uid: uidOf(state, 'paper_cut') });
    expect(light?.weight).toBe(1);
    expect(light?.span).toBe(1);
    // Weight 1 lands on beat 1, the Hound is still on 0, so it swings once before you.
    expect(light?.interveningKeys).toEqual(['chalk_hound:0']);
    expect(light?.damageTaken).toBe(5);
  });

  it('counts actions that fire, not beats that pass', () => {
    const state = fight('chalk_hound');
    // Small Print is Weight 2 and Slips 2, which shoves the Hound to the beat the player
    // lands on. Ties go to the player, so nothing acts in between despite the span.
    const preview = previewAction(state, { k: 'play_card', uid: uidOf(state, 'small_print') });
    expect(preview?.span).toBe(2);
    expect(preview?.interveningKeys).toEqual([]);
    expect(preview?.damageTaken).toBe(0);
    const hound = preview?.bodies.find((b) => b.id === 'chalk_hound');
    expect(hound?.positionAfter).toBe(2);
    expect(hound?.hpAfter).toBe(16);
  });

  it('reads a heavy card as the gamble it is', () => {
    // A Weight 5 card against a 3-beat cadence hands over two actions. §3.2, and the same
    // arithmetic phase 1 has a test for, seen from the player's side.
    const heavy = createCombat({
      ...fightSetup({ seed: 1, encounterId: 'chalk_hound' }),
      deck: ['everything_i_told_you'],
      startingHand: 1,
    });
    const preview = previewAction(heavy, { k: 'play_card', uid: uidOf(heavy, 'everything_i_told_you') });
    expect(preview?.weight).toBe(5);
    expect(preview?.interveningKeys).toEqual(['chalk_hound:0', 'chalk_hound:1']);
  });

  it('lands the marker behind where the Weight put it when the card Hastes', () => {
    const state = createCombat({
      ...fightSetup({ seed: 1, encounterId: 'chalk_debtor' }),
      deck: ['doubling_back'],
      startingHand: 1,
    });
    // Doubling Back is Weight 2 and Haste 5, but Haste never pulls you behind the clock.
    const preview = previewAction(state, { k: 'play_card', uid: uidOf(state, 'doubling_back') });
    expect(preview?.weight).toBe(2);
    expect(preview?.landsOn).toBe(0);
    expect(preview?.span).toBe(0);
  });

  it('says so when the card ends it', () => {
    const state = createCombat({
      ...fightSetup({ seed: 1, encounterId: 'marginalia' }),
      deck: ['pry_bar'],
      startingHand: 1,
    });
    const preview = previewAction(state, {
      k: 'play_card',
      uid: uidOf(state, 'pry_bar'),
      targetId: 'marginalia_a',
    });
    // Pry Bar deals 8 through Guard, and Marginalia have 9 HP, so it is not lethal.
    expect(preview?.kills).toEqual([]);
    expect(preview?.wins).toBe(false);
    expect(preview?.bodies.find((b) => b.id === 'marginalia_a')?.hpAfter).toBe(1);
  });

  it('says so when the card kills you', () => {
    const state = createCombat({
      ...fightSetup({ seed: 1, encounterId: 'chalk_debtor', hp: 6 }),
      deck: ['everything_i_told_you'],
      startingHand: 1,
    });
    const preview = previewAction(state, { k: 'play_card', uid: uidOf(state, 'everything_i_told_you') });
    expect(preview?.fatal).toBe(true);
    expect(preview?.hpAfter).toBe(0);
  });

  it('flags the lap the card carries you over', () => {
    const state = fight('chalk_debtor');
    const late = { ...state, beat: 23, combatants: state.combatants.map((c) => ({ ...c, position: 23 })) };
    const preview = previewAction(late, { k: 'play_card', uid: uidOf(late, 'small_print') });
    expect(preview?.crossesLap).toBe(true);
  });

  it('declines anything the player may not do', () => {
    const state = fight('the_owed');
    expect(previewAction(state, { k: 'play_card', uid: 'not-a-card' })).toBeNull();
    // A card pointed at nothing, with two bodies standing, is not a legal action.
    expect(previewAction(state, { k: 'play_card', uid: uidOf(state, 'paper_cut') })).toBeNull();
  });

  it('prices waiting', () => {
    const state = fight('chalk_hound');
    const preview = previewAction(state, { k: 'wait' });
    expect(preview?.weight).toBe(1);
    expect(preview?.damageTaken).toBe(5);
  });
});
