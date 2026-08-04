/**
 * The feel layer, checked for the properties that make it safe to have at all.
 *
 * It is pure and derived, so these are ordinary assertions about a function rather than an
 * attempt to test that a screen shook. What matters is that it cannot lie about the board: no
 * shake without HP loss, no sound without an event, and nothing at all from an empty slice.
 */
import { describe, expect, it } from 'vitest';
import { createCombat, reduce } from '../../engine/combat';
import { fightSetup } from '../../content/library';
import type { CombatState } from '../../engine/types';
import { impactSince, slideSeconds, NO_IMPACT } from './feel';
import { shakeKeyframes } from './useImpact';

function fight(encounterId: string, seed = 4): CombatState {
  return createCombat(fightSetup({ seed, encounterId }));
}

/** Play out the fight, collecting the impact of each exchange. */
function exchanges(state: CombatState, steps: number): ReturnType<typeof impactSince>[] {
  const out: ReturnType<typeof impactSince>[] = [];
  let current = state;
  for (let i = 0; i < steps && current.outcome === 'ongoing'; i += 1) {
    const cursor = current.log.length;
    const card = current.deck.hand[0];
    if (!card) break;
    const foe = current.combatants.find((c) => c.team === 'enemy' && c.hp > 0);
    current = reduce(current, { k: 'play_card', uid: card.uid, targetId: foe?.id });
    out.push(impactSince(current, cursor));
  }
  return out;
}

describe('impact', () => {
  it('reads nothing out of a slice with nothing in it', () => {
    const state = fight('chalk_debtor');
    const impact = impactSince(state, state.log.length);
    expect(impact).toEqual(NO_IMPACT);
  });

  it('never shakes the screen for damage the player did not take', () => {
    // A Chalk Debtor swings every 4 beats, so the opening exchanges are all outgoing damage.
    const first = exchanges(fight('chalk_debtor'), 3);
    for (const impact of first) {
      const tookNothing = !impact.cues.includes('guard_hold') && !impact.cues.includes('guard_break');
      if (tookNothing && impact.shake > 0) {
        // Only fails if the shake came from nowhere: an exchange the enemy acted in is fine.
        expect(impact.shake).toBe(0);
      }
    }
  });

  it('scales the shake by the fraction of max HP that left, and floors the small stuff', () => {
    const state = fight('the_notary');
    const player = state.combatants.find((c) => c.team === 'player');
    if (!player) throw new Error('no player');
    const log = (amount: number): CombatState => ({
      ...state,
      log: [
        ...state.log,
        { beat: 0, event: { k: 'damage', who: player.id, amount, blocked: 0, sourceId: null } },
      ],
    });
    const from = state.log.length;

    // 2 of 68 is a chip and holds still. 14 is a Seal and moves. 20 is a Final Notice and
    // moves more. Nothing ever exceeds 1, whatever lands.
    expect(impactSince(log(2), from).shake).toBe(0);
    expect(impactSince(log(14), from).shake).toBeGreaterThan(0);
    expect(impactSince(log(20), from).shake).toBeGreaterThan(impactSince(log(14), from).shake);
    expect(impactSince(log(400), from).shake).toBe(1);
  });

  it('reports the beats the player handed over, so the track can carry the weight', () => {
    const state = fight('chalk_debtor');
    const card = state.deck.hand[0];
    if (!card) throw new Error('no hand');
    const weight = state.library[card.cardId]?.weight ?? 0;
    const cursor = state.log.length;
    const foe = state.combatants.find((c) => c.team === 'enemy');
    const after = reduce(state, { k: 'play_card', uid: card.uid, targetId: foe?.id });
    expect(impactSince(after, cursor).advance).toBe(weight);
  });

  it('makes a noise for playing and drawing, because both happen on every action', () => {
    const [first] = exchanges(fight('chalk_debtor'), 1);
    expect(first?.cues).toContain('card_play');
    // Draw-one-per-action, §3.2. If this stops being true the sound is the least of it.
    expect(first?.cues).toContain('card_draw');
  });

  it('says nothing twice, however many times it happened', () => {
    for (const impact of exchanges(fight('marginalia'), 8)) {
      expect(new Set(impact.cues).size).toBe(impact.cues.length);
    }
  });
});

describe('the shake keyframes', () => {
  it('are absent entirely under reduced motion, not merely zeroed', () => {
    expect(shakeKeyframes(1, true)).toBeNull();
    expect(shakeKeyframes(0, false)).toBeNull();
  });

  it('start and end at rest, so nothing is left off-centre', () => {
    const frames = shakeKeyframes(0.8, false);
    if (!frames) throw new Error('expected keyframes');
    expect(frames.x[0]).toBe(0);
    expect(frames.x.at(-1)).toBe(0);
    expect(frames.y[0]).toBe(0);
    expect(frames.y.at(-1)).toBe(0);
  });

  it('move further for a bigger hit, and less vertically than horizontally', () => {
    const small = shakeKeyframes(0.1, false);
    const big = shakeKeyframes(1, false);
    if (!small || !big) throw new Error('expected keyframes');
    const reach = (frames: { x: number[]; y: number[] }) => Math.max(...frames.x.map(Math.abs));
    expect(reach(big)).toBeGreaterThan(reach(small));
    expect(Math.max(...big.y.map(Math.abs))).toBeLessThan(reach(big));
  });
});

describe('the weighted slide', () => {
  it('collapses to nothing when animation is off, whatever the weight', () => {
    expect(slideSeconds(0, 5)).toBe(0);
  });

  it('takes longer for a heavier card, but nowhere near proportionally', () => {
    const one = slideSeconds(0.3, 1);
    const five = slideSeconds(0.3, 5);
    expect(five).toBeGreaterThan(one);
    expect(five).toBeLessThan(one * 2);
    // Capped, so a Slip-inflated advance cannot strand the player watching the track.
    expect(slideSeconds(0.3, 40)).toBeLessThanOrEqual(0.3 * 2.1);
  });

  it('treats a Weight 0 card as a jump, not a hold', () => {
    expect(slideSeconds(0.3, 0)).toBe(0.3);
  });
});
