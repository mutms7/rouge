import { describe, expect, it } from 'vitest';
import { fightSetup } from '../../content/library';
import { createCombat } from '../../engine/combat';
import { faceOf } from './face';
import { isLegalCombatAction, legalCardActions } from './store';

function uidOf(state: ReturnType<typeof createCombat>, cardId: string): string {
  const card = state.deck.hand.find((instance) => instance.cardId === cardId);
  if (!card) throw new Error(`no ${cardId} in hand`);
  return card.uid;
}

describe('combat card action choices', () => {
  it('uses engine legalActions to enable an Absolved Compound for play', () => {
    const state = createCombat(
      fightSetup({ seed: 21, encounterId: 'chalk_debtor', deck: ['chalk_dust'], marks: ['absolved'] }),
    );
    const uid = uidOf(state, 'chalk_dust');
    const actions = legalCardActions(state, uid);
    const face = faceOf(state, 'chalk_dust', actions.play.length > 0);

    expect(actions.play).toContainEqual({ k: 'play_card', uid });
    expect(actions.discard).toBeNull();
    expect(face?.playable).toBe(true);
    expect(face?.text).toContain('Guard 3');
  });

  it('exposes Familiar discard for every Compound, including playable Chalk Dust', () => {
    const state = createCombat(
      fightSetup({ seed: 22, encounterId: 'chalk_debtor', deck: ['chalk_dust'], marks: ['familiar'] }),
    );
    const uid = uidOf(state, 'chalk_dust');
    const actions = legalCardActions(state, uid);
    const discard = actions.discard;

    expect(actions.play).toContainEqual({ k: 'play_card', uid });
    expect(discard).toEqual({ k: 'discard_compound', uid });
    if (!discard) throw new Error('expected Familiar discard action');
    expect(isLegalCombatAction(state, discard)).toBe(true);
    expect(isLegalCombatAction(state, { k: 'discard_compound', uid: 'stale' })).toBe(false);
  });

  it('keeps both legal choices visible when a Compound is both playable and discardable', () => {
    const state = createCombat(
      fightSetup({
        seed: 23,
        encounterId: 'chalk_debtor',
        deck: ['chalk_dust'],
        marks: ['absolved', 'familiar'],
      }),
    );
    const uid = uidOf(state, 'chalk_dust');
    const actions = legalCardActions(state, uid);

    expect(actions.play).toContainEqual({ k: 'play_card', uid });
    expect(actions.discard).toEqual({ k: 'discard_compound', uid });
  });
});
