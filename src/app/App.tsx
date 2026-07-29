import { useState } from 'react';
import './app.css';
import { CombatScreen } from './combat/CombatScreen';
import { FightSelect } from './combat/FightSelect';
import { useCombat } from './combat/store';
import './combat/combat.css';
import { useReducedMotionSync } from './settings';

/**
 * Two screens: pick a fight, have the fight.
 *
 * Phase 4 puts a map between them and this becomes a router. Until then the whole app is
 * one boolean, and the seed lives up here so it survives leaving a combat: you almost
 * always want to replay the same seed with a different line.
 */
export function App() {
  useReducedMotionSync();
  const [seed, setSeed] = useState(1);
  const encounterId = useCombat((s) => s.encounterId);
  const start = useCombat((s) => s.start);
  const leave = useCombat((s) => s.leave);

  if (encounterId === null) {
    return (
      <FightSelect
        seed={seed}
        onSeed={setSeed}
        onPick={(id) => {
          start(id, seed);
        }}
      />
    );
  }

  return <CombatScreen onLeave={leave} />;
}
