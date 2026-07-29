/**
 * Every legal run action, with a label on it, in one flat list.
 *
 * This is the piece that makes full keyboard play cheap on seven different screens. A map, a
 * shop, a Wake, a card reward and a Reckoning are all "here is a list, pick one", so there is
 * one cursor, one commit key, and one function that decides what the list is. The screens
 * differ in how they *draw* an entry, not in how they are navigated, and declining is an
 * entry in the list rather than a special key, because a skip you have to discover is a skip
 * somebody misses.
 *
 * `legalRunActions` in the engine is the authority on what is allowed. This only names
 * things, and marks the ones it may name but not offer, because a shelf that reflows as you
 * spend is a shelf you lose your place on.
 */
import { cardOf } from '../../content/cards';
import { hollowOf } from '../../content/hollows';
import { cardText } from '../../content/rules-text';
import { nodeOf } from '../../content/run';
import { tokenOf } from '../../content/tokens';
import { currentPrompt, legalRunActions, markIdFor, removableUids } from '../../engine/run';
import type { RunAction, RunPrompt, RunState } from '../../engine/runtypes';
import { baseIdOf, parseVariantId } from '../../engine/variants';
import { strings } from '../strings';

export type ChoiceKind = 'node' | 'card' | 'token' | 'deck_card' | 'shop' | 'option' | 'decline';

export type RunChoice = {
  readonly action: RunAction;
  readonly kind: ChoiceKind;
  readonly label: string;
  readonly detail: string | null;
  /** Price, requirement, or Weight. Whatever belongs in the corner of the row. */
  readonly cost: string | null;
  /** Card id or Token id behind it, for art and for the card face. */
  readonly refId: string | null;
  readonly nodeId: string | null;
  readonly uid: string | null;
  /** Rows that belong to the same shelf item share this, so the two prices sit together. */
  readonly group: string | null;
  /** Asks twice before it commits. */
  readonly irreversible: boolean;
  /** On screen, not takeable: sold, or more than you have. */
  readonly disabled: boolean;
};

type Partialish = Partial<RunChoice> & { action: RunAction; kind: ChoiceKind; label: string };

function choice(partial: Partialish): RunChoice {
  return {
    detail: null,
    cost: null,
    refId: null,
    nodeId: null,
    uid: null,
    group: null,
    irreversible: false,
    disabled: false,
    ...partial,
  };
}

/** A card's name, whatever variant it has drifted into. */
export function cardName(cardId: string): string {
  const spec = parseVariantId(cardId);
  const base = cardOf(spec.baseId);
  return spec.upgraded ? `${base.name} +` : base.name;
}

/**
 * Rules text for a possibly-upgraded card.
 *
 * A variant's numbers are its own, so the base card's hand-written override would be a lie
 * about them. `cardText` regenerates from effects, which is exactly what an inked card wants.
 */
export function cardTextOf(state: RunState, cardId: string): string {
  const base = cardOf(baseIdOf(cardId));
  const def = state.library[cardId];
  if (!def || def.baseId === undefined) return cardText(base);
  const { textOverride: _ignored, ...rest } = base;
  return cardText({ ...rest, ...def });
}

/** The Mark a card would Settle into, if it still can. */
function markFor(state: RunState, cardId: string) {
  const markId = markIdFor(state, cardId);
  if (markId === null) return null;
  return cardOf(baseIdOf(cardId)).mark;
}

function deckCardChoice(state: RunState, prompt: Extract<RunPrompt, { k: 'pick_deck_card' }>, uid: string): RunChoice {
  const cardId = state.deck.find((c) => c.uid === uid)?.cardId ?? '';
  const def = state.library[cardId];
  const mark = markFor(state, cardId);

  let detail = cardTextOf(state, cardId);
  if (prompt.op === 'settle' && mark) detail = `${strings.run.settlesInto(mark.name)} · ${mark.text}`;
  else if (prompt.op === 'remove' && prompt.destroysMark && mark) detail = `${detail} · ${strings.run.markBurned}`;

  return choice({
    action: { k: 'answer', id: uid },
    kind: 'deck_card',
    label: cardName(cardId),
    detail,
    cost: def ? `${strings.combat.weight} ${String(def.weight)}` : null,
    refId: cardId,
    uid,
    irreversible: prompt.op === 'settle' || prompt.op === 'remove',
  });
}

function shopLabel(state: RunState, item: Extract<RunPrompt, { k: 'shop' }>['items'][number]) {
  switch (item.kind) {
    case 'card':
      return {
        label: item.refId ? cardName(item.refId) : '',
        detail: item.refId ? cardTextOf(state, item.refId) : null,
      };
    case 'token':
      return { label: item.refId ? tokenOf(item.refId).name : '', detail: item.refId ? tokenOf(item.refId).text : null };
    case 'slot':
      return { label: 'Room on the sheet.', detail: `+1 ${strings.run.marks}.` };
    case 'remove':
      return { label: 'Strike a card off.', detail: 'It leaves the register. Its Mark is untouched.' };
  }
}

/**
 * One row per way of paying.
 *
 * §5.1 says the Assay takes Salt or cards, and two rows is the honest way to put that on a
 * keyboard: the alternative is a modifier key that nobody finds. They share a `group` so the
 * screen can draw one item with two prices under it.
 */
function shopChoices(state: RunState, prompt: Extract<RunPrompt, { k: 'shop' }>): RunChoice[] {
  const paper = removableUids(state).length;
  const out: RunChoice[] = [];

  for (const item of prompt.items) {
    const { label, detail } = shopLabel(state, item);
    const short = Math.max(0, item.salt - state.salt);
    out.push(
      choice({
        action: { k: 'answer', id: item.id, pay: 'salt' },
        kind: 'shop',
        label,
        detail,
        cost: item.sold ? strings.run.sold : strings.run.priceSalt(item.salt),
        refId: item.refId,
        group: item.id,
        disabled: item.sold || short > 0,
      }),
    );
    if (item.cards !== null) {
      out.push(
        choice({
          action: { k: 'answer', id: item.id, pay: 'cards' },
          kind: 'shop',
          label,
          detail,
          cost: strings.run.priceCards(item.cards),
          refId: item.refId,
          group: item.id,
          // No warning here even though a card does leave the deck: paying in paper opens a
          // "which card" prompt, and *that* is where the confirm belongs. Warning twice for
          // one decision teaches the player to click through warnings.
          disabled: item.sold || paper < item.cards,
        }),
      );
    }
  }
  return out;
}

function wakeChoices(state: RunState, prompt: Extract<RunPrompt, { k: 'wake' }>): RunChoice[] {
  const economy = state.content.economy;
  const healed = Math.max(1, Math.round((state.maxHp * economy.wakeHealPct) / 100));
  const out: RunChoice[] = [
    choice({
      action: { k: 'answer', id: 'rest' },
      kind: 'option',
      label: 'Sit down for a while.',
      detail: `Heal ${String(healed)}.`,
    }),
  ];
  if (prompt.canUpgrade) {
    out.push(
      choice({
        action: { k: 'answer', id: 'upgrade' },
        kind: 'option',
        label: 'Go over a card in ink.',
        detail: 'It comes out better at what it does.',
      }),
    );
  }
  out.push(
    choice({
      action: { k: 'answer', id: 'slot' },
      kind: 'option',
      label: 'Buy room on the sheet.',
      detail: `+1 ${strings.run.marks}.`,
      cost: strings.run.priceSalt(economy.wakeSlotSalt),
      disabled: state.salt < economy.wakeSlotSalt,
    }),
  );
  return out;
}

function declineLabel(prompt: RunPrompt): string {
  switch (prompt.k) {
    case 'gain_card':
    case 'gain_token':
      return strings.run.takeNothing;
    case 'pick_deck_card':
      return strings.run.keepAll;
    default:
      return strings.run.leave;
  }
}

/** Whether the engine would accept this row. Names are ours; permission is the engine's. */
function permitted(legal: readonly RunAction[], entry: RunChoice): boolean {
  return legal.some((action) => {
    if (action.k !== entry.action.k) return false;
    if (action.k !== 'answer' || entry.action.k !== 'answer') return true;
    return action.id === entry.action.id && (action.pay ?? 'salt') === (entry.action.pay ?? 'salt');
  });
}

export function choicesFor(state: RunState): RunChoice[] {
  if (state.outcome !== 'ongoing' || state.combat !== null) return [];
  const legal = legalRunActions(state);
  const prompt = currentPrompt(state);

  if (!prompt) {
    return legal.flatMap((action) => {
      if (action.k !== 'travel') return [];
      const node = state.map.nodes[action.nodeId];
      if (!node) return [];
      const def = nodeOf(node.kind);
      return [choice({ action, kind: 'node', label: def.name, detail: def.text, nodeId: node.id })];
    });
  }

  const named: RunChoice[] = [];
  switch (prompt.k) {
    case 'shop':
      named.push(...shopChoices(state, prompt));
      break;
    case 'wake':
      named.push(...wakeChoices(state, prompt));
      break;
    case 'hollow':
      for (const option of hollowOf(prompt.hollowId).options) {
        named.push(
          choice({
            action: { k: 'answer', id: option.id },
            kind: 'option',
            label: option.label,
            cost: option.requires?.salt === undefined ? null : strings.run.priceSalt(option.requires.salt),
          }),
        );
      }
      break;
    case 'gain_card':
      for (const id of prompt.ids) {
        named.push(
          choice({
            action: { k: 'answer', id },
            kind: 'card',
            label: cardName(id),
            detail: cardTextOf(state, id),
            cost: `${strings.combat.weight} ${String(state.library[id]?.weight ?? 0)}`,
            refId: id,
          }),
        );
      }
      break;
    case 'gain_token':
      for (const id of prompt.ids) {
        named.push(
          choice({
            action: { k: 'answer', id },
            kind: 'token',
            label: tokenOf(id).name,
            detail: tokenOf(id).text,
            refId: id,
          }),
        );
      }
      break;
    case 'pick_deck_card':
      for (const uid of prompt.uids) named.push(deckCardChoice(state, prompt, uid));
      break;
  }

  // A shelf keeps its sold and unaffordable rows, greyed. Everything else only shows what
  // can actually be taken, so a Hollow never lists an option that throws.
  const out =
    prompt.k === 'shop' || prompt.k === 'wake' || prompt.k === 'hollow'
      ? named.map((entry) => (permitted(legal, entry) ? entry : { ...entry, disabled: true }))
      : named.filter((entry) => permitted(legal, entry));

  if (legal.some((action) => action.k === 'decline')) {
    out.push(choice({ action: { k: 'decline' }, kind: 'decline', label: declineLabel(prompt) }));
  }
  return out;
}

/** Choices that delete something. The store makes these ask twice. */
export function isIrreversible(entry: RunChoice): boolean {
  return entry.irreversible;
}
