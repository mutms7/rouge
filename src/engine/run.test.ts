/**
 * The run: every room, and the rules that keep a run from becoming unplayable.
 *
 * Two kinds of test in here. The narrow ones drop the reducer into one situation and check one
 * rule, and the broad one plays whole runs with the sim's heuristic policy, which is the only
 * way to find out whether twelve rooms and eight Hollows actually compose. The broad test is
 * where a prompt that never clears or a Hollow that throws will show up.
 */
import { describe, expect, it } from 'vitest';
import { RUN_CONTENT } from '../content/library';
import { chooseAction } from '../sim/policy';
import {
  combatSetupAt,
  createRun,
  currentPrompt,
  deckLoadOf,
  eligibleUids,
  legalRunActions,
  markSlotsOf,
  removableUids,
  runReduce,
  settleableUids,
} from './run';
import type { RunAction, RunPrompt, RunState } from './runtypes';
import { baseIdOf } from './variants';

function fresh(seed = 1): RunState {
  return createRun(RUN_CONTENT, seed);
}

/** Force a prompt on, for the tests that are about one room rather than about a walk. */
function withPrompt(state: RunState, prompt: RunPrompt): RunState {
  return { ...state, prompts: [prompt], at: state.map.layers[0]?.[0] ?? null };
}

/** Play any live fight to its end with the heuristic policy. Consistent, not good. */
function fightOut(state: RunState, limit = 600): RunState {
  let next = state;
  for (let step = 0; step < limit && next.combat !== null && next.outcome === 'ongoing'; step += 1) {
    const action = chooseAction(next.combat);
    if (!action) throw new Error('the policy had nothing to do mid-fight');
    next = runReduce(next, { k: 'combat', action });
  }
  if (next.combat !== null && next.outcome === 'ongoing') throw new Error('a fight did not finish');
  return next;
}

/**
 * Walk a whole run, taking the first legal thing in every room.
 *
 * Deliberately close to the dumbest possible player: it never optimises and it takes every
 * card it is handed, which is the pressure a "do twelve rooms actually compose" test wants.
 *
 * It does walk out of shops without buying, and that is not tidiness. Buying the first thing
 * on the shelf means paying in paper, every time, because it arrives at the Assay with no
 * Salt; six purchases later the deck is five cards that deal almost no damage, and against a
 * Collector that is a *stalemate* rather than a loss. The fight cannot end, because nothing in
 * Act 1 punishes a player for taking too long. That is Interest's job, and Interest is phase 5.
 */
function walk(seed: number, limit = 6000): { state: RunState; actions: RunAction[] } {
  let state = fresh(seed);
  const actions: RunAction[] = [];
  const push = (action: RunAction): void => {
    actions.push(action);
    state = runReduce(state, action);
  };

  for (let step = 0; step < limit && state.outcome === 'ongoing'; step += 1) {
    if (state.combat !== null) {
      const action = chooseAction(state.combat);
      if (!action) throw new Error('the policy had nothing to do mid-fight');
      push({ k: 'combat', action });
      continue;
    }
    const legal = legalRunActions(state);
    const shopping = currentPrompt(state)?.k === 'shop';
    const pick = shopping ? legal.find((a) => a.k === 'decline') : legal[0];
    if (!pick) throw new Error(`nothing legal at step ${String(step)}, prompt ${String(currentPrompt(state)?.k)}`);
    push(pick);
  }
  return { state, actions };
}

describe('starting a run', () => {
  it('deals Wick his ten cards and three empty slots', () => {
    const run = fresh();
    expect(run.deck).toHaveLength(10);
    expect(run.deck.map((c) => c.cardId).filter((id) => id === 'paper_cut')).toHaveLength(4);
    expect(run.markSlots).toBe(3);
    expect(run.marks).toEqual([]);
    expect(run.hp).toBe(68);
    expect(run.salt).toBe(0);
    expect(run.at).toBeNull();
    expect(deckLoadOf(run)).toBe(12);
  });

  it('offers the first layer and nothing else', () => {
    const run = fresh();
    expect(legalRunActions(run)).toEqual([{ k: 'travel', nodeId: run.map.layers[0]?.[0] }]);
  });

  it('refuses a step that is not a step from here', () => {
    const run = fresh();
    expect(() => runReduce(run, { k: 'travel', nodeId: 'l5n0' })).toThrow();
  });
});

describe('a fight node', () => {
  it('starts a combat seeded off the node rather than off the run', () => {
    const run = runReduce(fresh(4), { k: 'travel', nodeId: fresh(4).map.layers[0]?.[0] ?? '' });
    expect(run.combat).not.toBeNull();
    expect(run.combat?.seed).not.toBe(run.seed);
    expect(run.combat?.combatants.map((c) => c.id)).toEqual(['wick', 'chalk_debtor']);
    // The fight is handed the run's HP and Salt, not the character sheet's defaults.
    expect(run.combat?.combatants[0]?.hp).toBe(run.hp);
  });

  it('banks HP, Salt and the run log on the way out, and offers a card', () => {
    const start = fresh(4);
    const after = fightOut(runReduce(start, { k: 'travel', nodeId: start.map.layers[0]?.[0] ?? '' }));
    expect(after.outcome).toBe('ongoing');
    expect(after.combat).toBeNull();
    expect(after.lastCombat?.outcome).toBe('won');
    expect(after.hp).toBeLessThanOrEqual(start.hp);
    expect(after.salt).toBeGreaterThanOrEqual(RUN_CONTENT.economy.saltPerDebtor);
    expect(currentPrompt(after)?.k).toBe('gain_card');
  });

  it('takes the card you pick and lets you refuse it', () => {
    const start = fresh(4);
    const won = fightOut(runReduce(start, { k: 'travel', nodeId: start.map.layers[0]?.[0] ?? '' }));
    const prompt = currentPrompt(won);
    if (prompt?.k !== 'gain_card') throw new Error('expected a card reward');

    const taken = runReduce(won, { k: 'answer', id: prompt.ids[0] as string });
    expect(taken.deck).toHaveLength(11);
    expect(taken.deck.at(-1)?.cardId).toBe(prompt.ids[0]);
    expect(currentPrompt(taken)).toBeNull();

    const refused = runReduce(won, { k: 'decline' });
    expect(refused.deck).toHaveLength(10);
    expect(currentPrompt(refused)).toBeNull();
  });

  it('never offers a card the reward pool is not meant to hold', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const start = fresh(seed);
      const won = fightOut(runReduce(start, { k: 'travel', nodeId: start.map.layers[0]?.[0] ?? '' }));
      const prompt = currentPrompt(won);
      if (prompt?.k !== 'gain_card') continue;
      expect(new Set(prompt.ids).size).toBe(prompt.ids.length);
      for (const id of prompt.ids) {
        const rarity = RUN_CONTENT.cardRarity[id] ?? '';
        // Compounds are never drafted and a fourth Paper Cut is not a reward.
        expect(rarity).not.toBe('compound');
        expect(rarity).not.toBe('starter');
      }
    }
  });

  it('ends the run when the fight does', () => {
    const start = { ...fresh(4), hp: 1 };
    const lost = fightOut(runReduce(start, { k: 'travel', nodeId: start.map.layers[0]?.[0] ?? '' }));
    expect(lost.outcome).toBe('lost');
    expect(lost.hp).toBe(0);
    expect(legalRunActions(lost)).toEqual([]);
  });

  /**
   * The Rope You Kept: "Survive lethal once per run at 1 HP."
   *
   * Armed as an ordinary combat ward, because surviving happens on a beat and the run has no
   * beats. Which means the run has to read the log to find out whether it fired, and the log
   * has to say *which* ward fired: a Dead Man's Switch doing its job must not quietly spend
   * the one on your character sheet.
   */
  it('spends the once-per-run escape, and only that one', () => {
    const node = fresh(4).map.layers[0]?.[0] ?? '';

    // With the rope, a fight that would have ended at zero HP fires a ward off the sheet.
    const roped = fightOut(runReduce({ ...fresh(4), hp: 1, tokens: ['the_rope_you_kept'] }, { k: 'travel', nodeId: node }));
    const spent = roped.lastCombat?.log.filter((e) => e.event.k === 'ward_spent') ?? [];
    expect(spent).toHaveLength(1);
    expect(spent[0]?.event).toMatchObject({ fromCard: false });
    expect(roped.lethalWardSpent).toBe(true);

    // Armed for a fight that has one left, and not for a fight that does not.
    const nodeDef = roped.map.nodes[node];
    if (!nodeDef) throw new Error('no node');
    const armed = (state: RunState): boolean =>
      (combatSetupAt(state, nodeDef).player.mods ?? []).some(
        (mod) => mod.k === 'on_combat_start' && mod.effects.some((e) => e.k === 'survive_lethal'),
      );
    expect(armed({ ...roped, lethalWardSpent: false })).toBe(true);
    expect(armed(roped)).toBe(false);

    // Without the rope, the run ward never existed, and a card spending its own is not it.
    const carded = { ...fresh(4), hp: 1, deck: [...fresh(4).deck, { uid: 'w', cardId: 'dead_mans_switch' }] };
    expect(armed(carded)).toBe(false);
    const cardFight = fightOut(runReduce(carded, { k: 'travel', nodeId: node }));
    const cardWards = cardFight.lastCombat?.log.filter((e) => e.event.k === 'ward_spent') ?? [];
    for (const entry of cardWards) expect(entry.event).toMatchObject({ fromCard: true });
    expect(cardFight.lethalWardSpent).toBe(false);
  });
});

describe('a Reckoning', () => {
  const settling = (state: RunState): RunState =>
    withPrompt(state, {
      k: 'pick_deck_card',
      op: 'settle',
      uids: settleableUids(state),
      skippable: true,
      destroysMark: false,
    });

  it('trades the card for its Mark', () => {
    const run = settling(fresh());
    const uid = settleableUids(run)[0] as string;
    const cardId = run.deck.find((c) => c.uid === uid)?.cardId ?? '';
    const markId = RUN_CONTENT.cardMarks[baseIdOf(cardId)] ?? '';

    const after = runReduce(run, { k: 'answer', id: uid });
    expect(after.deck).toHaveLength(9);
    expect(after.deck.some((c) => c.uid === uid)).toBe(false);
    expect(after.marks).toEqual([markId]);
    expect(after.runLog).toContainEqual({ k: 'card_settled', cardId, markId });
  });

  it('fires what a Mark or a Token hangs off Settling', () => {
    // Someone Else's Wedding Band: heal 6 whenever you Settle a card.
    const run = settling({ ...fresh(), hp: 40, tokens: ['someone_elses_wedding_band'] });
    const after = runReduce(run, { k: 'answer', id: settleableUids(run)[0] as string });
    expect(after.hp).toBe(46);
  });

  /**
   * A Reckoning with nothing to offer still puts a screen up, with no rows on it.
   *
   * The alternative is a node that silently drops you back on the map, which reads as a bug
   * rather than as "your sheet is full".
   */
  it('still opens with an empty sheet full, so the room can say why', () => {
    const base = fresh(7);
    const reckoning = Object.values(base.map.nodes).find((n) => n.kind === 'reckoning');
    if (!reckoning) throw new Error('no Reckoning in this act');
    const before = Object.values(base.map.nodes).find((n) => n.next.includes(reckoning.id));
    if (!before) throw new Error('the Reckoning has no way in');

    const full = { ...base, at: before.id, marks: ['whetted', 'braced', 'fine_print'] };
    const state = runReduce(full, { k: 'travel', nodeId: reckoning.id });
    const prompt = currentPrompt(state);
    if (prompt?.k !== 'pick_deck_card') throw new Error('expected a Reckoning');
    expect(prompt.uids).toEqual([]);
    expect(legalRunActions(state)).toEqual([{ k: 'decline' }]);
    expect(currentPrompt(runReduce(state, { k: 'decline' }))).toBeNull();
  });

  it('offers nothing once the slots are full', () => {
    const full = { ...fresh(), marks: ['whetted', 'braced', 'fine_print'] };
    expect(settleableUids(full)).toEqual([]);
    // Ledger Bone buys a fourth slot, so the same sheet has room again.
    const withBone = { ...full, tokens: ['ledger_bone'] };
    expect(markSlotsOf(withBone)).toBe(4);
    expect(settleableUids(withBone).length).toBeGreaterThan(0);
  });

  it('never offers a Mark you already carry or one that was burned', () => {
    const run = { ...fresh(), marks: ['whetted'], blockedMarks: ['braced'] };
    const offered = settleableUids(run).map((uid) => run.deck.find((c) => c.uid === uid)?.cardId);
    expect(offered).not.toContain('paper_cut');
    expect(offered).not.toContain('flinch');
  });

  it('can be walked past', () => {
    const run = settling(fresh());
    const after = runReduce(run, { k: 'decline' });
    expect(after.deck).toHaveLength(10);
    expect(currentPrompt(after)).toBeNull();
  });
});

describe('the Assay', () => {
  /**
   * Walk in from the layer above, which is the only legal way to arrive.
   *
   * `travel` checks the edge, correctly, so the test cannot just plant the player on the shop
   * node: it has to stand on something that leads there. What is under test is the shelf, so
   * the Salt and the Tokens are patched in on the way past.
   */
  function shopAt(seed: number, tokens: readonly string[] = [], salt = 500): RunState {
    const base = fresh(seed);
    const assay = Object.values(base.map.nodes).find((n) => n.kind === 'assay');
    if (!assay) throw new Error('no Assay in this act');
    const before = Object.values(base.map.nodes).find((n) => n.next.includes(assay.id));
    if (!before) throw new Error('the Assay has no way in');
    return runReduce({ ...base, at: before.id, salt, tokens: [...tokens] }, { k: 'travel', nodeId: assay.id });
  }

  function shop(seed = 5): RunState {
    return shopAt(seed);
  }

  function shelfOf(state: RunState): Extract<RunPrompt, { k: 'shop' }> {
    const prompt = currentPrompt(state);
    if (prompt?.k !== 'shop') throw new Error('expected a shop');
    return prompt;
  }

  it('stocks cards, Tokens and services', () => {
    const prompt = shelfOf(shop());
    expect(prompt.items.filter((i) => i.kind === 'card')).toHaveLength(RUN_CONTENT.economy.assayCards);
    expect(prompt.items.filter((i) => i.kind === 'token')).toHaveLength(RUN_CONTENT.economy.assayTokens);
    expect(prompt.items.some((i) => i.kind === 'remove')).toBe(true);
  });

  it('sells for Salt', () => {
    const state = shop();
    const prompt = shelfOf(state);
    const item = prompt.items.find((i) => i.kind === 'card');
    if (!item?.refId) throw new Error('no card on the shelf');

    const after = runReduce(state, { k: 'answer', id: item.id, pay: 'salt' });
    expect(after.salt).toBe(state.salt - item.salt);
    expect(after.deck.at(-1)?.cardId).toBe(item.refId);
    // The shelf stays up, with that row struck through.
    const next = currentPrompt(after);
    if (next?.k !== 'shop') throw new Error('the shop closed itself');
    expect(next.items.find((i) => i.id === item.id)?.sold).toBe(true);
    expect(legalRunActions(after).some((a) => a.k === 'answer' && a.id === item.id)).toBe(false);
  });

  /** §5.1: "Pay in Salt, or pay in cards." Paper costs a card off the register instead. */
  it('sells for paper', () => {
    const state = { ...shop(), salt: 0 };
    const item = shelfOf(state).items.find((i) => i.kind === 'card' && i.cards === 1);
    if (!item?.refId) throw new Error('no card priced in one card');

    const owing = runReduce(state, { k: 'answer', id: item.id, pay: 'cards' });
    expect(currentPrompt(owing)?.k).toBe('pick_deck_card');
    expect(owing.owed?.cardsLeft).toBe(1);
    expect(owing.deck).toHaveLength(10);

    const paid = runReduce(owing, { k: 'answer', id: removableUids(owing)[0] as string });
    expect(paid.owed).toBeNull();
    expect(paid.deck).toHaveLength(10);
    expect(paid.deck.at(-1)?.cardId).toBe(item.refId);
    expect(paid.salt).toBe(0);
    expect(currentPrompt(paid)?.k).toBe('shop');
  });

  it('leaves when told to', () => {
    const after = runReduce(shop(), { k: 'decline' });
    expect(currentPrompt(after)).toBeNull();
  });

  // Counterfeit Sixpence is 25 percent off. Same seed, same shelf, one Token apart.
  it('takes a Token discount off the shelf price', () => {
    const plain = shelfOf(shopAt(5));
    const cheap = shelfOf(shopAt(5, ['counterfeit_sixpence']));
    for (const [index, item] of plain.items.entries()) {
      expect(cheap.items[index]?.salt ?? 0).toBeLessThan(item.salt);
    }
  });
});

describe('a Wake', () => {
  function wake(): RunState {
    return withPrompt({ ...fresh(), hp: 20, salt: 200 }, { k: 'wake', canUpgrade: true });
  }

  it('heals thirty percent of the maximum', () => {
    const after = runReduce(wake(), { k: 'answer', id: 'rest' });
    expect(after.hp).toBe(20 + Math.round(68 * 0.3));
    expect(currentPrompt(after)).toBeNull();
  });

  it('sells a slot for sixty Salt, per §5.1', () => {
    const after = runReduce(wake(), { k: 'answer', id: 'slot' });
    expect(after.markSlots).toBe(4);
    expect(after.salt).toBe(140);
  });

  it('inks a card', () => {
    const after = runReduce(wake(), { k: 'answer', id: 'upgrade' });
    const prompt = currentPrompt(after);
    if (prompt?.k !== 'pick_deck_card') throw new Error('expected a card pick');
    const uid = prompt.uids[0] as string;
    const was = after.deck.find((c) => c.uid === uid)?.cardId ?? '';

    const inked = runReduce(after, { k: 'answer', id: uid });
    const now = inked.deck.find((c) => c.uid === uid)?.cardId ?? '';
    expect(now).toBe(`${was}+`);
    expect(inked.library[now]?.name.endsWith('+')).toBe(true);
    // And it cannot be inked a second time.
    expect(eligibleUids(inked, 'upgrade')).not.toContain(uid);
  });

  it('refuses a slot it cannot pay for', () => {
    const broke = withPrompt({ ...fresh(), salt: 10 }, { k: 'wake', canUpgrade: false });
    expect(legalRunActions(broke).map((a) => (a.k === 'answer' ? a.id : a.k))).toEqual(['rest']);
    expect(() => runReduce(broke, { k: 'answer', id: 'slot' })).toThrow();
  });
});

describe('a Vault', () => {
  it('pays Salt and hands over a Token', () => {
    const base = fresh(9);
    const vault = Object.values(base.map.nodes).find((n) => n.kind === 'vault');
    if (!vault) return;
    const state = runReduce(base, { k: 'travel', nodeId: vault.id });
    expect(state.salt).toBe(RUN_CONTENT.economy.saltPerVault);
    const prompt = currentPrompt(state);
    if (prompt?.k !== 'gain_token') throw new Error('expected a Token');
    const after = runReduce(state, { k: 'answer', id: prompt.ids[0] as string });
    expect(after.tokens).toEqual([prompt.ids[0]]);
  });
});

describe('the Hollows', () => {
  function hollowState(hollowId: string, patch: Partial<RunState> = {}): RunState {
    return withPrompt({ ...fresh(), salt: 200, ...patch }, { k: 'hollow', hollowId });
  }

  it('resolves every option of every Hollow without throwing', () => {
    for (const hollowId of RUN_CONTENT.hollowIds) {
      const hollow = RUN_CONTENT.hollows[hollowId];
      if (!hollow) throw new Error(`no Hollow called ${hollowId}`);
      for (const option of hollow.options) {
        const state = hollowState(hollowId);
        if (!legalRunActions(state).some((a) => a.k === 'answer' && a.id === option.id)) continue;
        let after = runReduce(state, { k: 'answer', id: option.id });
        // Anything that needs a choice becomes a prompt. Answer them all.
        for (let guard = 0; guard < 8 && currentPrompt(after) !== null; guard += 1) {
          const legal = legalRunActions(after)[0];
          if (!legal) throw new Error(`${hollowId}/${option.id} left a prompt nobody can answer`);
          after = runReduce(after, legal);
        }
        expect(currentPrompt(after)).toBeNull();
      }
    }
  });

  it('logs a refusal, because the Compound remembers', () => {
    const state = hollowState('the_confessional_booth');
    const after = runReduce(state, { k: 'answer', id: 'refuse' });
    expect(after.runLog).toContainEqual({
      k: 'option_refused',
      eventId: 'the_confessional_booth',
      optionId: 'refuse',
    });
  });

  it('burns the Mark along with the card in the Weighing Room', () => {
    let state = hollowState('the_weighing_room');
    state = runReduce(state, { k: 'answer', id: 'weigh_one' });
    const prompt = currentPrompt(state);
    if (prompt?.k !== 'pick_deck_card') throw new Error('expected a card pick');
    expect(prompt.destroysMark).toBe(true);

    const uid = prompt.uids[0] as string;
    const cardId = state.deck.find((c) => c.uid === uid)?.cardId ?? '';
    const markId = RUN_CONTENT.cardMarks[baseIdOf(cardId)] ?? '';
    const after = runReduce(state, { k: 'answer', id: uid });
    expect(after.blockedMarks).toContain(markId);
    expect(after.runLog).toContainEqual({ k: 'card_removed', cardId });
  });

  it('dips one card, not two', () => {
    let state = hollowState('the_ink_well');
    state = runReduce(state, { k: 'answer', id: 'dip_one' });
    const prompt = currentPrompt(state);
    if (prompt?.k !== 'pick_deck_card') throw new Error('expected a card pick');
    expect(prompt.op).toBe('dip');

    const uid = prompt.uids[0] as string;
    const was = state.deck.find((c) => c.uid === uid)?.cardId ?? '';
    const after = runReduce(state, { k: 'answer', id: uid });
    expect(after.deck.find((c) => c.uid === uid)?.cardId).toBe(`${was}+^`);
    expect(deckLoadOf(after)).toBe(deckLoadOf(state) + 1);
    expect(currentPrompt(after)).toBeNull();
  });

  it('walking through Nothing Here costs and gives nothing', () => {
    const state = hollowState('nothing_here');
    const after = runReduce(state, { k: 'answer', id: 'move_on' });
    expect(after.deck).toEqual(state.deck);
    expect(after.hp).toBe(state.hp);
    expect(after.salt).toBe(state.salt);
  });

  /** An event that can kill you out of nowhere is not a decision, it is an ambush. */
  it('hides an option that would cost more HP than you have', () => {
    const dying = hollowState('chalk_children', { hp: 5 });
    expect(legalRunActions(dying).some((a) => a.k === 'answer' && a.id === 'feed_blood')).toBe(false);
    const healthy = hollowState('chalk_children', { hp: 50 });
    expect(legalRunActions(healthy).some((a) => a.k === 'answer' && a.id === 'feed_blood')).toBe(true);
  });

  it('hides an option it cannot pay for', () => {
    const broke = hollowState('a_man_selling_his_own_name', { salt: 0 });
    expect(legalRunActions(broke).some((a) => a.k === 'answer' && a.id === 'buy_the_space')).toBe(false);
  });
});

describe('the deck floor', () => {
  it('stops a run from deleting its way into a deck it cannot play', () => {
    const thin = { ...fresh(), deck: fresh().deck.slice(0, RUN_CONTENT.economy.minDeckSize) };
    expect(removableUids(thin)).toEqual([]);
    // Settling is exempt: it is the intended way down, and it hands you a Mark for it.
    expect(settleableUids(thin).length).toBeGreaterThan(0);
  });

  it('will not strike off the Notary’s Countersign', () => {
    const cursed = fresh();
    const withJunk = {
      ...cursed,
      deck: [...cursed.deck, { uid: 'junk', cardId: 'the_notarys_countersign' }],
    };
    expect(removableUids(withJunk)).not.toContain('junk');
  });
});

describe('a whole run', () => {
  it('walks twelve nodes to a conclusion, on twenty seeds', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const { state } = walk(seed);
      expect(state.outcome).not.toBe('ongoing');
      expect(state.visited.length).toBeLessThanOrEqual(12);
      if (state.outcome === 'won') {
        expect(state.visited).toHaveLength(12);
        expect(state.hp).toBeGreaterThan(0);
      }
      // Whatever happened, nothing is left half-answered.
      expect(currentPrompt(state)).toBeNull();
      expect(state.combat).toBeNull();
    }
  });

  it('writes the run log nobody reads yet', () => {
    let found = false;
    for (let seed = 1; seed <= 20 && !found; seed += 1) {
      const { state } = walk(seed);
      if (state.runLog.some((e) => e.k === 'card_settled')) found = true;
      for (const entry of state.runLog) {
        expect(['card_exhausted', 'card_removed', 'card_settled', 'option_refused']).toContain(entry.k);
      }
    }
    expect(found).toBe(true);
  });

  it('never lets a Mark be carried twice or past the sheet', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const { state } = walk(seed);
      expect(new Set(state.marks).size).toBe(state.marks.length);
      expect(state.marks.length).toBeLessThanOrEqual(markSlotsOf(state));
      expect(markSlotsOf(state)).toBeLessThanOrEqual(RUN_CONTENT.maxMarkSlots);
    }
  });
});
