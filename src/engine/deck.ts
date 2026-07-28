/**
 * The piles.
 *
 * The hand persists for the whole fight and there is no end-of-turn discard, so the
 * only pressure on it is the cap. You draw one per action, which means acting cheaply
 * is also how you find cards, and a Weight 5 nuke costs you tempo *and* cards.
 */
import { emit } from './draft';
import type { Draft } from './draft';
import { shuffle } from './rng';
import type { CardInstance } from './types';

export function handIsFull(draft: Draft): boolean {
  return draft.deck.hand.length >= draft.handCap;
}

/**
 * Put a card in hand. Returns false when the hand is full, in which case the card is
 * dropped: Echo copies and overdrawn cards evaporate rather than queueing up.
 */
export function addToHand(draft: Draft, instance: CardInstance): boolean {
  if (handIsFull(draft)) return false;
  draft.deck.hand.push(instance);
  return true;
}

function reshuffleDiscard(draft: Draft): boolean {
  if (draft.deck.discard.length === 0) return false;
  const [shuffled, rng] = shuffle(draft.rng.shuffle, draft.deck.discard);
  draft.deck.draw = shuffled;
  draft.deck.discard = [];
  draft.rng = { ...draft.rng, shuffle: rng };
  emit(draft, { k: 'reshuffle', count: shuffled.length });
  return true;
}

/**
 * Draw up to n cards. Stops early on a full hand or an empty deck, rather than
 * throwing: running out of cards is a legitimate late-fight state, not an error.
 */
export function drawCards(draft: Draft, n: number): void {
  for (let i = 0; i < n; i += 1) {
    if (handIsFull(draft)) return;
    if (draft.deck.draw.length === 0 && !reshuffleDiscard(draft)) return;
    const card = draft.deck.draw.shift();
    if (!card) return;
    draft.deck.hand.push(card);
    emit(draft, { k: 'draw', uid: card.uid, cardId: card.cardId });
  }
}

export function discardCard(draft: Draft, instance: CardInstance): void {
  draft.deck.discard.push(instance);
}

/**
 * Out of the deck for the rest of this combat. §3.6.
 *
 * Also a run-log entry, per the brief: nothing reads it in the demo, and it is far
 * cheaper to write now than to backfill once there are three acts of content.
 */
export function exhaustCard(draft: Draft, instance: CardInstance): void {
  draft.deck.exhausted.push(instance);
  emit(draft, { k: 'exhaust', uid: instance.uid, cardId: instance.cardId });
  draft.runLog.push({ k: 'card_exhausted', cardId: instance.cardId, beat: draft.beat });
}

export function removeFromHand(draft: Draft, uid: string): CardInstance | null {
  const index = draft.deck.hand.findIndex((c) => c.uid === uid);
  if (index < 0) return null;
  const [removed] = draft.deck.hand.splice(index, 1);
  return removed ?? null;
}
