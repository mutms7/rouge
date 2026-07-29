/**
 * Read-only Notary signals for the combat view.
 *
 * The engine owns the timing. This helper only turns the existing CombatState fields and
 * log entries into labels the view can place beside the intent track. It deliberately
 * treats countersign cancellation as optional: older combat values have no such event, and
 * the current event is shown only while the engine's current-lap field still agrees with it.
 */
import type { CombatState, Combatant, Effect } from '../../engine/types';

export type ReinkConfig = {
  readonly beats: number;
  readonly multiplier: number;
};

export type NotaryStatus = {
  readonly id: string;
  readonly phase: number;
  readonly active: boolean;
  readonly remaining: number;
  readonly until: number;
  readonly window: ReinkConfig;
  readonly countersignCanceled: { readonly beat: number; readonly lap: number | null } | null;
};

function isNotary(body: Combatant): boolean {
  return body.id === 'the_notary' || body.name.toLowerCase().includes('notary');
}

function nestedReink(effects: readonly Effect[]): ReinkConfig | null {
  for (const effect of effects) {
    if (effect.k === 'vulnerable') return { beats: effect.beats, multiplier: effect.multiplier };
    if ('effects' in effect) {
      const nested = nestedReink(effect.effects);
      if (nested) return nested;
    }
  }
  return null;
}

function reinkConfig(body: Combatant): ReinkConfig {
  for (const intent of body.intents) {
    const found = nestedReink(intent.effects);
    if (found) return found;
  }
  return { beats: 2, multiplier: Math.max(1, body.vulnerableMultiplier) };
}

function canceledEvent(state: CombatState): { readonly beat: number; readonly lap: number | null } | null {
  const currentLap = state.countersignCancelledLap;
  if (currentLap === null) return null;
  for (let index = state.log.length - 1; index >= 0; index -= 1) {
    const entry = state.log[index];
    if (!entry) continue;
    const kind = (entry.event as unknown as { readonly k?: unknown }).k;
    if (kind !== 'countersign_cancelled') continue;
    const lap = (entry.event as unknown as { readonly lap?: unknown }).lap;
    if (lap !== currentLap) continue;
    return { beat: entry.beat, lap: typeof lap === 'number' ? lap : null };
  }
  return null;
}

export function isNotaryBody(body: Combatant): boolean {
  return isNotary(body);
}

/** Return the live Notary window, or null for every other encounter. */
export function notaryStatus(state: CombatState): NotaryStatus | null {
  const body = state.combatants.find(isNotary);
  if (!body) return null;
  const window = reinkConfig(body);
  const active = body.vulnerableUntil > state.beat;
  return {
    id: body.id,
    phase: body.phase,
    active,
    remaining: active ? body.vulnerableUntil - state.beat : 0,
    until: body.vulnerableUntil,
    window,
    countersignCanceled: canceledEvent(state),
  };
}

/** Whether a projected intent is the Notary's re-ink trigger. */
export function isReinkIntent(effects: readonly Effect[]): boolean {
  return nestedReink(effects) !== null;
}
