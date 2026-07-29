/**
 * The combat log, in English, and the transient flashes that go over the board.
 *
 * The engine resolves everything between two player decisions in one synchronous call, so
 * by the time the view renders, the enemy has already swung. Something has to carry "what
 * just happened" or the fight reads as numbers changing by themselves. That is this file:
 * the append-only `state.log` turned into lines, plus the subset of it worth throwing over
 * a body as a floating number.
 *
 * It is pure and takes the entries it is given, which is what lets the presentation layer
 * stay a function of engine state rather than a queue that can fall behind it. Nothing in
 * here can desync, because nothing in here holds state.
 */
import type { CardDef, CombatState, LogEntry } from '../../engine/types';
import { displayNames } from './names';

export type LogTone = 'plain' | 'debt' | 'quiet' | 'loud';

export type LogLine = {
  readonly key: string;
  readonly beat: number;
  readonly text: string;
  readonly tone: LogTone;
};

export type Flash = {
  readonly key: string;
  /** Combatant id the number floats over. */
  readonly who: string;
  readonly kind: 'damage' | 'blocked' | 'heal' | 'guard' | 'bleed';
  readonly amount: number;
};

function titleCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export type Naming = {
  /** The player's combatant id. An `act` by them names a card, not an intent. */
  readonly playerId: string;
  readonly nameOf: (id: string) => string;
  readonly cardName: (cardId: string) => string;
  /** Intent ids carry their body's id as a prefix. Drop it: the actor is already named. */
  readonly intentName: (actorId: string, intentId: string) => string;
};

export function namingFor(state: CombatState): Naming {
  const bodies = displayNames(state);
  const cardName = (cardId: string): string => {
    const def: CardDef | undefined = state.library[cardId];
    return def ? def.name : titleCase(cardId);
  };
  return {
    playerId: state.combatants.find((c) => c.team === 'player')?.id ?? 'player',
    nameOf: (id) => bodies[id] ?? titleCase(id),
    cardName,
    intentName: (actorId, intentId) => {
      if (intentId.startsWith('mirror_')) return cardName(intentId.slice('mirror_'.length));
      const prefix = `${actorId}_`;
      return titleCase(intentId.startsWith(prefix) ? intentId.slice(prefix.length) : intentId);
    },
  };
}

/**
 * One line per event worth reading.
 *
 * Returns null for the bookkeeping the log carries for the sim and for save files but that
 * nobody wants narrated: every draw, every discard, every scheduled tick.
 */
function lineFor(entry: LogEntry, naming: Naming): { text: string; tone: LogTone } | null {
  const event = entry.event;
  switch (event.k) {
    case 'combat_start':
      return { text: 'The ledger opens.', tone: 'quiet' };
    case 'combat_end':
      return event.outcome === 'won'
        ? { text: 'Discharged.', tone: 'loud' }
        : { text: 'You are in the red.', tone: 'debt' };
    case 'lap_end':
      return { text: `Lap ${String(event.lap)} closes.`, tone: 'quiet' };
    case 'act': {
      const who = naming.nameOf(event.who);
      if (event.what === 'wait') return { text: `${who} waits. (${String(event.weight)})`, tone: 'quiet' };
      const what =
        event.who === naming.playerId ? naming.cardName(event.what) : naming.intentName(event.who, event.what);
      return { text: `${who}: ${what}. (${String(event.weight)})`, tone: 'plain' };
    }
    case 'damage': {
      // `amount` is what was thrown, `blocked` is what Guard ate. What the player wants to
      // read is the difference, with the part Guard held named separately.
      const lost = Math.max(0, event.amount - event.blocked);
      const held = event.blocked > 0 ? `, ${String(event.blocked)} held` : '';
      return { text: `${naming.nameOf(event.who)} takes ${String(lost)}${held}.`, tone: lost > 0 ? 'debt' : 'plain' };
    }
    case 'heal':
      return { text: `${naming.nameOf(event.who)} heals ${String(event.amount)}.`, tone: 'plain' };
    case 'guard':
      return {
        text: `${naming.nameOf(event.who)} Guard +${String(event.amount)}, now ${String(event.total)}.`,
        tone: 'plain',
      };
    case 'slip':
      return { text: `${naming.nameOf(event.who)} Slipped ${String(event.n)}.`, tone: 'plain' };
    case 'haste':
      return { text: `${naming.nameOf(event.who)} Hastes ${String(event.n)}.`, tone: 'plain' };
    case 'bleed':
      return { text: `${naming.nameOf(event.who)} Bleeds ${String(event.n)}.`, tone: 'plain' };
    case 'bleed_tick':
      return { text: `${naming.nameOf(event.who)} bleeds for ${String(event.amount)}.`, tone: 'debt' };
    case 'strain_break':
      return { text: `Strain gives. You take ${String(event.damage)}.`, tone: 'debt' };
    case 'reshuffle':
      return { text: `You shuffle ${String(event.count)} back.`, tone: 'quiet' };
    case 'echo':
      return { text: `${naming.cardName(event.cardId)} echoes.`, tone: 'plain' };
    case 'exhaust':
      return { text: `${naming.cardName(event.cardId)} is spent.`, tone: 'quiet' };
    case 'perjury_sworn':
      return { text: `${naming.cardName(event.cardId)}, sworn for beat ${String(event.at)}.`, tone: 'plain' };
    case 'perjury_resolved':
      return { text: `${naming.cardName(event.cardId)} becomes true.`, tone: 'loud' };
    case 'perjury_fizzled':
      return { text: `${naming.cardName(event.cardId)} was a lie.`, tone: 'debt' };
    case 'salt':
      return { text: `Salt +${String(event.amount)}, now ${String(event.total)}.`, tone: 'plain' };
    case 'salt_stolen':
      return { text: `${naming.nameOf(event.who)} takes ${String(event.amount)} Salt off you.`, tone: 'debt' };
    case 'compound':
      return { text: `${naming.cardName(event.cardId)} is written into your ${event.to}.`, tone: 'debt' };
    case 'compound_removed':
      return { text: `${naming.cardName(event.cardId)} struck out.`, tone: 'plain' };
    case 'returned':
      return { text: `${naming.cardName(event.cardId)} comes back to hand.`, tone: 'plain' };
    case 'vulnerable':
      return { text: `${naming.nameOf(event.who)} is re-inking.`, tone: 'loud' };
    case 'phase':
      return { text: `${naming.nameOf(event.who)} turns the page.`, tone: 'loud' };
    case 'ward_spent':
      return { text: `${naming.nameOf(event.who)} should have died. Healed ${String(event.healed)}.`, tone: 'loud' };
    case 'death':
      return { text: `${naming.nameOf(event.who)} settles.`, tone: 'loud' };
    // Bookkeeping. Real, logged, and not worth a line.
    case 'draw':
    case 'discard':
    case 'strain':
    case 'scheduled':
    case 'boon':
      return null;
  }
}

/** The whole log as lines, newest last. The panel crops it. */
export function logLines(state: CombatState, naming: Naming): LogLine[] {
  const out: LogLine[] = [];
  state.log.forEach((entry, index) => {
    const line = lineFor(entry, naming);
    if (!line) return;
    out.push({ key: `l${String(index)}`, beat: entry.beat, text: line.text, tone: line.tone });
  });
  return out;
}

/**
 * Numbers to throw over a body.
 *
 * Only what a player would look at during a hit: damage, the part Guard ate, healing, and
 * Guard going up. `from` is an index into `state.log`, so the caller asks for "everything
 * since the last action" without this file remembering anything.
 */
export function flashesSince(state: CombatState, from: number): Flash[] {
  const out: Flash[] = [];
  for (let index = Math.max(0, from); index < state.log.length; index += 1) {
    const entry = state.log[index];
    if (!entry) continue;
    const key = `f${String(index)}`;
    switch (entry.event.k) {
      case 'damage': {
        // Guard eating the whole thing is its own kind of event, and the number that
        // floats has to be the HP that actually left, never the number that was thrown.
        const lost = entry.event.amount - entry.event.blocked;
        if (lost > 0) out.push({ key, who: entry.event.who, kind: 'damage', amount: lost });
        else if (entry.event.blocked > 0) {
          out.push({ key, who: entry.event.who, kind: 'blocked', amount: entry.event.blocked });
        }
        break;
      }
      case 'heal':
        out.push({ key, who: entry.event.who, kind: 'heal', amount: entry.event.amount });
        break;
      case 'guard':
        out.push({ key, who: entry.event.who, kind: 'guard', amount: entry.event.amount });
        break;
      case 'bleed_tick':
        out.push({ key, who: entry.event.who, kind: 'bleed', amount: entry.event.amount });
        break;
      default:
        break;
    }
  }
  return out;
}
