import './app.css';
import './combat/combat.css';
import './run/run.css';
import { useReducedMotionSync } from './settings';
import { useApp } from './store';
import { RunScreen } from './run/RunScreen';
import { Title } from './Title';

/**
 * Two screens: the way in, and the run.
 *
 * Combat is not a third one. A fight is a field on a run, so `RunScreen` shows it the same way
 * it shows a shop, and the router has no state of its own to get wrong: which screen is up is
 * a function of whether there is a run.
 */
export function App() {
  useReducedMotionSync();
  const run = useApp((s) => s.run);
  const seed = useApp((s) => s.seed);
  const hasSave = useApp((s) => s.hasSave);
  const store = useApp.getState;

  if (!run) {
    return (
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
      />
    );
  }

  return <RunScreen />;
}
