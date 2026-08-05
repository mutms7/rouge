import { useEffect } from 'react';
import './app.css';
import './combat/combat.css';
import './run/run.css';
import { Credits } from './Credits';
import { Settings } from './SettingsScreen';
import { useAudioSettingsSync, usePresentationSync, useReducedMotionSync } from './settings';
import { useApp } from './store';
import { RunScreen } from './run/RunScreen';
import { Title } from './Title';

/**
 * Two screens: the way in, and the run. Settings and credits are overlays on top of either
 * one, because turning the volume down should never require leaving a fight.
 *
 * Combat is not a third screen. A fight is a field on a run, so `RunScreen` shows it the same
 * way it shows a shop, and the router has no state of its own to get wrong: which screen is up
 * is a function of whether there is a run.
 */
export function App() {
  useReducedMotionSync();
  useAudioSettingsSync();
  usePresentationSync();
  const run = useApp((s) => s.run);
  const seed = useApp((s) => s.seed);
  const hasSave = useApp((s) => s.hasSave);
  const settingsOpen = useApp((s) => s.settingsOpen);
  const creditsOpen = useApp((s) => s.creditsOpen);
  const store = useApp.getState;

  // The title screen has no key listener of its own: `RunScreen` owns Escape while a run is
  // live, and this is the only path left once one closes and a run has not started yet.
  useEffect(() => {
    if (run) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      const current = store();
      if (current.settingsOpen || current.creditsOpen) {
        event.preventDefault();
        current.cancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [run, store]);

  return (
    <>
      {run ? (
        <RunScreen />
      ) : (
        <Title
          seed={seed}
          hasSave={hasSave}
          onSeed={(next) => {
            store().setSeed(next);
          }}
          onBegin={() => {
            store().startRun(seed);
          }}
          onResume={() => {
            store().resumeRun();
          }}
          onAbandon={() => {
            store().abandonRun();
          }}
          onSettings={() => {
            store().toggleSettings();
          }}
          onCredits={() => {
            store().toggleCredits();
          }}
        />
      )}
      {settingsOpen ? (
        <Settings
          onClose={() => {
            store().toggleSettings();
          }}
        />
      ) : null}
      {creditsOpen ? (
        <Credits
          onClose={() => {
            store().toggleCredits();
          }}
        />
      ) : null}
    </>
  );
}
