/**
 * Combat, assembled.
 *
 * This is the only file in the combat UI that holds a listener or an effect. Everything
 * below it is a function of the props it gets, and everything it reads is a function of
 * one `CombatState`. That is the whole architecture of phase 3 in one sentence: the engine
 * resolves an action to completion synchronously, the store keeps the value that came
 * back, and the view interpolates between the old value and the new one.
 *
 * Which is why fast-forward cannot desync anything. Holding F sets a duration to zero. It
 * does not skip a queue, drain a buffer, or race a timer, because there is no queue, no
 * buffer and nothing waiting on a timer that the board depends on. The worst a dropped
 * animation can do is make the board correct sooner.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { encounterOf } from '../../content/enemies';
import { effectiveWeight, isPlayerTurn } from '../../engine/combat';
import { cardWeight } from '../../engine/tally';
import type { Action, CombatState } from '../../engine/types';
import { useSettings } from '../settings';
import { strings } from '../strings';
import { EnemyBoard, PlayerPanel } from './Bodies';
import { faceOf } from './face';
import { logLines, namingFor } from './feed';
import { Hand, Readout, Record, type HandCard } from './Hand';
import { Help } from './Help';
import { intentForKey, isFastForwardKey, moveCursor } from './keys';
import { Outcome } from './Outcome';
import { previewAction } from './preview';
import { actorOf, needsTarget, playAction, targetableEnemies, useCombat } from './store';
import { Tally } from './Tally';
import { trackView } from './track';
import { useFlashes } from './useFlashes';

/** How much of the record the panel keeps on screen. Older lines are still in state. */
const RECORD_LINES = 60;

/** The action a card commits to, with a body attached when the card needs one. */
function actionFor(state: CombatState, uid: string, targetIndex: number): Action {
  const foes = targetableEnemies(state);
  const foe = foes[Math.max(0, Math.min(foes.length - 1, targetIndex))];
  return playAction(state, uid, foe?.id);
}

export function CombatScreen({ onLeave }: { readonly onLeave: () => void }) {
  const state = useCombat((s) => s.state);
  const encounterId = useCombat((s) => s.encounterId);
  const seed = useCombat((s) => s.seed);
  const cursor = useCombat((s) => s.cursor);
  const hovered = useCombat((s) => s.hovered);
  const targeting = useCombat((s) => s.targeting);
  const helpOpen = useCombat((s) => s.helpOpen);
  const hoveredTarget = useCombat((s) => s.hoveredTarget);
  const store = useCombat.getState;

  const flashes = useFlashes();
  const fastForwardLocked = useSettings((s) => s.fastForwardLocked);
  const toggleFastForwardLock = useSettings((s) => s.toggleFastForwardLock);

  const interactive = state !== null && isPlayerTurn(state);
  const hand = state?.deck.hand ?? [];

  // Which card the preview is about: the mouse beats the keyboard, because it moved more
  // recently, and a card being targeted beats both.
  const previewUid = targeting?.uid ?? hovered ?? (interactive ? hand[cursor]?.uid : undefined) ?? null;

  const targetIndex = useMemo(() => {
    if (!state) return 0;
    if (targeting) return targeting.index;
    if (!hoveredTarget) return 0;
    const found = targetableEnemies(state).findIndex((c) => c.id === hoveredTarget);
    return found < 0 ? 0 : found;
  }, [state, targeting, hoveredTarget]);

  const preview = useMemo(() => {
    if (!state || !interactive || !previewUid) return null;
    return previewAction(state, actionFor(state, previewUid, targetIndex));
  }, [state, interactive, previewUid, targetIndex]);

  const commit = useCallback(
    (uid: string) => {
      const current = store().state;
      if (!current || !isPlayerTurn(current)) return;
      if (needsTarget(current, uid) && store().targeting?.uid !== uid) {
        store().beginTargeting(uid);
        return;
      }
      store().dispatch(actionFor(current, uid, store().targeting?.index ?? targetIndex));
    },
    [store, targetIndex],
  );

  // One listener for the whole screen. `keys.ts` owns the mapping; this owns the wiring.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isFastForwardKey(event.key)) {
        useSettings.getState().setFastForwardHeld(true);
        event.preventDefault();
        return;
      }

      const current = store();
      const live = current.state;
      const size = live?.deck.hand.length ?? 0;
      const intent = intentForKey(event.key, {
        handSize: size,
        targeting: current.targeting !== null,
        interactive: live !== null && isPlayerTurn(live),
      });
      if (!intent) return;
      event.preventDefault();

      switch (intent.k) {
        case 'cursor':
          current.setCursor(intent.to);
          current.setHovered(null);
          break;
        case 'cursor_move':
          current.setCursor(moveCursor(current.cursor, intent.by, size));
          current.setHovered(null);
          break;
        case 'target_move':
          current.moveTarget(intent.by);
          break;
        case 'commit': {
          const uid = current.targeting?.uid ?? live?.deck.hand[current.cursor]?.uid;
          if (uid) commit(uid);
          break;
        }
        case 'cancel':
          current.cancel();
          break;
        case 'wait':
          current.dispatch({ k: 'wait' });
          break;
        case 'toggle_help':
          current.toggleHelp();
          break;
        case 'restart':
          if (current.encounterId) current.start(current.encounterId, current.seed);
          break;
      }
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      if (isFastForwardKey(event.key)) useSettings.getState().setFastForwardHeld(false);
    };
    // A window that loses focus mid-hold would otherwise never see the keyup.
    const onBlur = (): void => {
      useSettings.getState().setFastForwardHeld(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [store, commit]);

  if (!state || !encounterId) return null;

  const naming = namingFor(state);
  const view = trackView(state, actorOf(state)?.id ?? null);
  const lines = logLines(state, naming).slice(-RECORD_LINES);
  const encounter = encounterOf(encounterId);

  const cards: HandCard[] = hand.flatMap((instance) => {
    const face = faceOf(state, instance.cardId);
    if (!face) return [];
    return [
      {
        uid: instance.uid,
        face,
        weight: effectiveWeight(state, instance.uid) ?? cardWeight(face.def, instance),
        printedWeight: cardWeight(face.def, instance),
      },
    ];
  });

  // Ghost markers: where the player's marker lands, and any body the card *shoves*.
  //
  // A body that simply takes its turn inside the span has moved too, but its next action
  // is already drawn as a chip and a second ghost on top of it says nothing. A body that
  // got Slipped without acting is the case worth drawing, because Slip is otherwise
  // completely invisible until you commit.
  const ghosts: Record<string, number> = {};
  if (preview) {
    const player = state.combatants.find((c) => c.team === 'player');
    if (player) ghosts[player.id] = preview.landsOn;
    for (const body of preview.bodies) {
      if (body.dies || body.positionAfter === body.positionBefore) continue;
      if (preview.interveningKeys.some((key) => key.startsWith(`${body.id}:`))) continue;
      ghosts[body.id] = body.positionAfter;
    }
  }

  const targetId = targeting ? (targetableEnemies(state)[targetIndex]?.id ?? null) : null;
  const previewCard = previewUid ? (cards.find((c) => c.uid === previewUid)?.face ?? null) : null;

  return (
    <div className="combat">
      <header className="combat__bar">
        <button type="button" className="link" onClick={onLeave}>
          {strings.outcome.back}
        </button>
        <span className="combat__title">{encounter.name}</span>
        <span className="combat__clock">
          {strings.combat.lap(view.lap)} · {strings.combat.beat} {state.beat}
        </span>
        <span className="combat__seed">
          {strings.select.seed} {seed}
        </span>
        <button
          type="button"
          className="link"
          data-on={fastForwardLocked || undefined}
          onClick={toggleFastForwardLock}
        >
          {strings.keys.fastForward} ({strings.keys.fastForwardHint})
        </button>
        <button type="button" className="link" onClick={() => { store().toggleHelp(); }}>
          {strings.keys.help}
        </button>
      </header>

      <EnemyBoard
        state={state}
        flashes={flashes}
        preview={preview?.bodies ?? []}
        targetId={targetId}
        onHover={(id) => { store().setHoveredTarget(id); }}
        onPick={(id) => {
          const current = store();
          if (current.targeting) current.playCard(current.targeting.uid, id);
        }}
      />

      <Tally view={view} preview={preview} ghostPositions={ghosts} />

      <div className="combat__middle">
        <PlayerPanel
          state={state}
          flashes={flashes}
          guardAfter={preview?.guardAfter ?? null}
          hpAfter={preview?.hpAfter ?? null}
        />
        <Readout
          preview={preview}
          card={previewCard}
          targeting={targeting !== null}
          waiting={!interactive && state.outcome === 'ongoing'}
        />
        <Record lines={lines} />
      </div>

      <Hand
        cards={cards}
        cursor={cursor}
        hovered={hovered}
        interactive={interactive}
        onHover={(uid) => { store().setHovered(uid); }}
        onActivate={commit}
      />

      {state.outcome === 'ongoing' ? null : (
        <Outcome
          state={state}
          onAgain={() => { store().start(encounterId, seed); }}
          onLeave={onLeave}
        />
      )}
      {helpOpen ? <Help onClose={() => { store().toggleHelp(); }} /> : null}
    </div>
  );
}
