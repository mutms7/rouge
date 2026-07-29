import { describe, expect, it } from 'vitest';
import { fightSetup } from '../../content/library';
import { createCombat, currentActor } from '../../engine/combat';
import type { LogEntry } from '../../engine/types';
import { isReinkIntent, notaryStatus } from './notary';
import { trackView } from './track';

describe('Notary UI signals', () => {
  it('reads the two-beat, triple-damage window from the intent data', () => {
    const state = createCombat(fightSetup({ seed: 1, encounterId: 'the_notary' }));
    const notary = state.combatants.find((body) => body.id === 'the_notary');
    const reink = notary?.intents.find((intent) => isReinkIntent(intent.effects));

    expect(reink).toBeDefined();
    expect(notaryStatus(state)?.window).toEqual({ beats: 2, multiplier: 3 });
    expect(notaryStatus(state)?.active).toBe(false);
    expect(trackView(state, currentActor(state)?.id ?? null).lanes.find((lane) => lane.id === 'the_notary')?.intents.some((intent) => intent.reink)).toBe(true);
  });

  it('reports active timing and a future cancellation event without requiring it', () => {
    const state = createCombat(fightSetup({ seed: 2, encounterId: 'the_notary' }));
    const active = {
      ...state,
      combatants: state.combatants.map((body) =>
        body.id === 'the_notary' ? { ...body, vulnerableUntil: 2, vulnerableMultiplier: 3 } : body,
      ),
      countersignCancelledLap: 1,
      log: [
        ...state.log,
        { beat: 4, event: { k: 'countersign_cancelled', who: 'the_notary', lap: 1 } } as LogEntry,
      ],
    };

    expect(notaryStatus(active)).toMatchObject({
      active: true,
      remaining: 2,
      until: 2,
      countersignCanceled: { beat: 4, lap: 1 },
    });
  });

  it('does not keep a prior-lap cancellation in the callout after the engine resets it', () => {
    const state = createCombat(fightSetup({ seed: 4, encounterId: 'the_notary' }));
    const stale = {
      ...state,
      countersignCancelledLap: 2,
      log: [...state.log, { beat: 24, event: { k: 'countersign_cancelled', who: 'the_notary', lap: 1 } } as LogEntry],
    };

    expect(notaryStatus(stale)?.countersignCanceled).toBeNull();
  });

  it('returns no status for encounters without a Notary', () => {
    const state = createCombat(fightSetup({ seed: 3, encounterId: 'chalk_hound' }));
    expect(notaryStatus(state)).toBeNull();
  });
});
