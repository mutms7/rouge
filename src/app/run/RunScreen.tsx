/**
 * The run, assembled. Router, status bar, and the one key listener above combat.
 *
 * Which screen is up is a function of the run value and nothing else: a live fight is a
 * fight, a queued prompt is that room, and neither is a room the map is a map. There is no
 * navigation state, so there is no way to be on the wrong screen, and resuming a save lands
 * exactly where it left off for free.
 *
 * The status bar is always the same four numbers in the same four places, on every screen,
 * because HP and Salt are what every decision above combat is spent against. Load is up there
 * too even though nothing bills you for it until phase 5: a player should feel the number
 * growing before it starts costing.
 */
import { useEffect } from 'react';
import { compoundsPerLap } from '../../content/run';
import { currentPrompt, deckLoadOf, markSlotsOf } from '../../engine/run';
import { CombatScreen } from '../combat/CombatScreen';
import { Help } from '../combat/Help';
import { useSettings } from '../settings';
import { choices as choicesOf, useApp } from '../store';
import { strings } from '../strings';
import { runIntentForKey } from './keys';
import { MapScreen } from './MapScreen';
import { PromptScreen } from './PromptScreen';
import { RunOver } from './RunOver';
import { Sheet } from './Sheet';

function StatusBar({ onSheet, onHelp }: { readonly onSheet: () => void; readonly onHelp: () => void }) {
  const run = useApp((s) => s.run);
  const fastForwardLocked = useSettings((s) => s.fastForwardLocked);
  const toggleFastForwardLock = useSettings((s) => s.toggleFastForwardLock);
  if (!run) return null;

  const load = deckLoadOf(run);

  return (
    <header className="runbar">
      <span className="runbar__stat">
        <span className="runbar__label">{strings.combat.hp}</span>
        <span className="runbar__value" data-low={run.hp * 3 <= run.maxHp || undefined}>
          {String(run.hp)} / {String(run.maxHp)}
        </span>
      </span>
      <span className="runbar__stat">
        <span className="runbar__label">{strings.run.salt}</span>
        <span className="runbar__value">{String(run.salt)}</span>
      </span>
      <span className="runbar__stat" title={strings.run.loadHint(compoundsPerLap(load))}>
        <span className="runbar__label">{strings.run.load}</span>
        <span className="runbar__value">{String(load)}</span>
      </span>
      <span className="runbar__stat">
        <span className="runbar__label">{strings.run.marks}</span>
        <span className="runbar__value">{strings.run.slots(run.marks.length, markSlotsOf(run))}</span>
      </span>
      <span className="runbar__spacer" />
      <span className="runbar__stat runbar__stat--quiet">
        <span className="runbar__label">{strings.select.seed}</span>
        <span className="runbar__value">{String(run.seed)}</span>
      </span>
      <button type="button" className="link" onClick={onSheet}>
        {strings.run.sheetHint}
      </button>
      <button type="button" className="link" data-on={fastForwardLocked || undefined} onClick={toggleFastForwardLock}>
        {strings.keys.fastForward} ({strings.keys.fastForwardHint})
      </button>
      <button type="button" className="link" onClick={onHelp}>
        {strings.keys.help}
      </button>
    </header>
  );
}

export function RunScreen() {
  const run = useApp((s) => s.run);
  const endedCombat = useApp((s) => s.endedCombat);
  const cursor = useApp((s) => s.choice);
  const confirm = useApp((s) => s.confirm);
  const sheetOpen = useApp((s) => s.sheetOpen);
  const helpOpen = useApp((s) => s.helpOpen);
  const store = useApp.getState;

  const prompt = run ? currentPrompt(run) : null;
  const list = choicesOf(run);
  // A live fight owns the keyboard: `CombatScreen` has its own listener and its own scheme.
  const inCombat = (run?.combat ?? null) !== null || endedCombat !== null;

  useEffect(() => {
    if (inCombat) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const current = store();
      const intent = runIntentForKey(event.key, {
        choices: choicesOf(current.run).length,
        overlay: current.sheetOpen || current.helpOpen,
      });
      if (!intent) return;
      event.preventDefault();

      switch (intent.k) {
        case 'choice':
          current.setChoice(intent.to);
          break;
        case 'choice_move':
          current.moveChoice(intent.by);
          break;
        case 'commit':
          current.commitChoice();
          break;
        case 'cancel':
          current.cancel();
          break;
        case 'toggle_sheet':
          current.toggleSheet();
          break;
        case 'toggle_help':
          current.toggleHelp();
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [store, inCombat]);

  if (!run) return null;

  const board = run.combat ?? endedCombat;
  const encounterId = run.at === null ? null : (run.map.nodes[run.at]?.encounterId ?? null);

  return (
    <div className="run">
      <StatusBar
        onSheet={() => {
          store().toggleSheet();
        }}
        onHelp={() => {
          store().toggleHelp();
        }}
      />

      {board !== null && encounterId !== null ? (
        <CombatScreen
          state={board}
          encounterId={encounterId}
          onward={
            endedCombat === null
              ? null
              : () => {
                  store().onward();
                }
          }
        />
      ) : prompt ? (
        <PromptScreen
          prompt={prompt}
          choices={list}
          cursor={cursor}
          confirm={confirm}
          onHover={(index) => {
            store().setChoice(index);
          }}
          onPick={(index) => {
            store().setChoice(index);
            store().commitChoice();
          }}
        />
      ) : (
        <MapScreen
          run={run}
          choices={list}
          cursor={cursor}
          onHover={(index) => {
            store().setChoice(index);
          }}
          onPick={(index) => {
            store().setChoice(index);
            store().commitChoice();
          }}
        />
      )}

      {run.outcome === 'ongoing' || endedCombat !== null ? null : (
        <RunOver
          run={run}
          onAgain={() => {
            store().startRun(run.seed + 1);
          }}
        />
      )}
      {sheetOpen ? (
        <Sheet
          run={run}
          onClose={() => {
            store().toggleSheet();
          }}
        />
      ) : null}
      {helpOpen ? (
        <Help
          onClose={() => {
            store().toggleHelp();
          }}
        />
      ) : null}
    </div>
  );
}
