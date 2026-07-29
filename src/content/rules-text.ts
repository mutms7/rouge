/**
 * Rules text, generated from effects.
 *
 * The default is generated, with a hand-written override for the handful of cards where
 * the generated line reads badly. That split is deliberate and it is not laziness in
 * either direction:
 *
 * - Generated text means a balance change to a number is one edit, not two, and it means
 *   the number on the card can never disagree with the number in the engine. That class of
 *   bug is the most embarrassing one a deckbuilder can ship.
 * - Overrides exist because some effects are conditional or scaling, and generated English
 *   for a conditional is always worse than a person writing one clause. §13 wants card
 *   text under 12 words. A generator cannot be trusted with that on its own.
 *
 * Voice rules from §13 apply here as much as anywhere: short, bureaucratic, no fantasy
 * nouns. "Deal 5." not "Deals 5 damage to the target."
 */
import type { CardBoon, Countable, Effect } from '../engine/types';
import type { Card } from './types';

const COUNTABLE_TEXT: Record<Countable, string> = {
  discard: 'card in your discard pile',
  draw_pile: 'card in your draw pile',
  hand: 'card in your hand',
  exhausted: 'card exhausted',
  compounds_in_discard: 'Compound in your discard',
  compounds_in_hand: 'Compound in your hand',
  missing_hp: 'HP missing',
  salt: 'Salt held',
};

function plural(n: number, one: string): string {
  return n === 1 ? one : `${one}s`;
}

function boonText(boon: CardBoon): string {
  const parts: string[] = [];
  if (boon.weight === 0) parts.push('costs 0 Weight');
  else if (boon.weight !== undefined) parts.push(`costs ${String(boon.weight)} Weight`);
  if (boon.weightMinus !== undefined) parts.push(`costs ${String(boon.weightMinus)} less Weight`);
  if (boon.perjuryIn !== undefined) parts.push(`gains Perjury ${String(boon.perjuryIn)}`);
  if (boon.echo === true) parts.push('gains Echo');
  return parts.join(' and ');
}

/** One atom, one sentence. Returns null for atoms that have nothing to say on a card. */
export function describeEffect(effect: Effect): string | null {
  switch (effect.k) {
    case 'damage':
      return effect.pierce === true ? `Deal ${String(effect.n)}, ignores Guard.` : `Deal ${String(effect.n)}.`;
    case 'damage_per': {
      const unit = COUNTABLE_TEXT[effect.per];
      const per = effect.divide === undefined ? `per ${unit}` : `per ${String(effect.divide)} ${plural(2, unit)}`;
      return `Deal ${String(effect.n)} ${per}.`;
    }
    case 'damage_random':
      return `Deal ${String(effect.n)} to a random enemy.`;
    case 'self_damage':
      return `Take ${String(effect.n)} damage.`;
    case 'guard':
      return effect.frozenFor === undefined
        ? `Guard ${String(effect.n)}.`
        : `Guard ${String(effect.n)}, which does not decay for ${String(effect.frozenFor)} beats.`;
    case 'heal':
      return `Heal ${String(effect.n)}.`;
    case 'draw':
      return `Draw ${String(effect.n)}.`;
    case 'discard':
      return `Discard ${String(effect.n)}.`;
    case 'slip':
      return `Slip ${String(effect.n)}.`;
    case 'haste':
      return `Haste ${String(effect.n)}.`;
    case 'enemy_haste':
      return `Enemies Haste ${String(effect.n)}.`;
    case 'bleed':
      return `Bleed ${String(effect.n)}.`;
    case 'strain':
      return `Strain ${String(effect.n)}.`;
    case 'echo':
      return 'Echo.';
    case 'exhaust':
      return 'Exhaust.';
    case 'perjury':
      return `Perjury ${String(effect.in)}: ${describeEffects(effect.effects)}`;
    case 'next_action':
      return `At the start of your next action: ${describeEffects(effect.effects)}`;
    case 'next_lap':
      return `Next lap: ${describeEffects(effect.effects)}`;
    case 'on_kill':
      return `If this kills: ${describeEffects(effect.effects)}`;
    case 'salt':
      return `Gain ${String(effect.n)} Salt.`;
    case 'spend_salt':
      return `Spend ${String(effect.n)} Salt: ${describeEffects(effect.effects)}`;
    case 'steal_guard':
      return `Steal ${String(effect.n)} Guard per ${String(effect.divide)} ${COUNTABLE_TEXT[effect.per]}, max ${String(effect.max)}.`;
    case 'reveal_intents':
      return `Reveal the enemy's next ${String(effect.n)} intents.`;
    case 'empower_next': {
      const cards = effect.n === 1 ? 'Your next card' : `Your next ${String(effect.n)} cards`;
      const when = effect.untilLapEnd === true ? ' this lap' : '';
      return `${cards}${when} ${boonText(effect.boon)}.`;
    }
    case 'lap_boon':
      return `This lap your cards ${boonText(effect.boon)}.`;
    case 'return_last':
      return effect.weight === undefined
        ? 'Return your last played card to hand.'
        : `Return your last played card to hand at Weight ${String(effect.weight)}.`;
    case 'copy_intent':
      return `Copy the enemy's next intent into your hand at Weight ${String(effect.weight)}.`;
    case 'remove_compound':
      return `Remove ${String(effect.n)} ${plural(effect.n, 'Compound')} from your draw pile.`;
    case 'purge_compounds':
      return effect.guardPer === undefined
        ? 'Remove all Compounds from combat.'
        : `Remove all Compounds from combat. Gain Guard equal to ${String(effect.guardPer)}x the number removed.`;
    case 'add_compound':
      return `Add ${String(effect.n)} ${plural(effect.n, 'Compound')} to your ${effect.to} pile.`;
    case 'seed_discard':
      return `Put ${String(effect.n)} cards into your discard.`;
    case 'survive_lethal':
      return `When you would die this combat, heal ${String(effect.heal)} and Exhaust this instead.`;
    case 'vulnerable':
      return `Takes ${String(effect.multiplier)}x damage for ${String(effect.beats)} beats.`;
    case 'steal_salt':
      return `Steal ${String(effect.n)} Salt.`;
    case 'ally_damage':
      return `An ally deals +${String(effect.n)}.`;
    case 'reveal_nodes':
      return `Reveal the next ${String(effect.n)} map nodes.`;
  }
}

export function describeEffects(effects: readonly Effect[]): string {
  return effects
    .map(describeEffect)
    .filter((line): line is string => line !== null)
    .join(' ');
}

/** What goes on the card face. The override wins where there is one. */
export function cardText(card: Card): string {
  return card.textOverride ?? describeEffects(card.effects);
}

/** Words in a rendered line, for the §13 length check. */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
