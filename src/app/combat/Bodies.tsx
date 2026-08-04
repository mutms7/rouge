/**
 * The bodies: the enemies across the top, Wick along the bottom, and the numbers that
 * float off both of them when something lands.
 *
 * Everything here reads straight off the current engine state. The floating numbers are
 * the one exception and they are decoration, not state: they come off the slice of the
 * combat log the last action appended, and they expire on a timer. If the timer never
 * fired, or fired instantly under fast-forward, the board would still be correct. That is
 * deliberate. Nothing you can see is allowed to be the only copy of anything.
 */
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { ENEMIES } from '../../content/enemies';
import { Art } from '../art/Art';
import { useDuration } from '../settings';
import { strings } from '../strings';
import type { Flash } from './feed';
import { displayNames } from './names';
import { isNotaryBody, notaryStatus } from './notary';
import type { PreviewBody } from './preview';
import { summarize } from './summary';
import type { CombatState, Combatant } from '../../engine/types';

/**
 * One body, one PNG, however many of it a fight puts in front of you.
 *
 * Combatant ids are per-encounter (`marginalia_a`, `the_owed_b`) while art is addressed by
 * the *definition* id, so a trailing letter comes off when the exact id is not a body the
 * bestiary knows. Bosses are the one exception to one-id-one-file: phases are separate
 * images, per art contract §2.
 */
function artFor(body: Combatant): { kind: 'enemies' | 'bosses'; id: string } {
  const def = ENEMIES[body.id] ?? ENEMIES[body.id.replace(/_[a-z]$/, '')];
  if (def?.artKind === 'bosses') return { kind: 'bosses', id: `${def.id}_p${String(body.phase)}` };
  return { kind: 'enemies', id: def?.id ?? body.id };
}

export function Flashes({ flashes }: { readonly flashes: readonly Flash[] }) {
  const duration = useDuration(0.7);
  return (
    <div className="flashes" aria-hidden="true">
      <AnimatePresence>
        {flashes.map((flash) => (
          <motion.span
            className="flash"
            data-kind={flash.kind}
            key={flash.key}
            initial={{ opacity: 0, y: 0, scale: 0.8 }}
            animate={{ opacity: 1, y: -26, scale: 1 }}
            exit={{ opacity: 0, y: -38 }}
            transition={{ duration, ease: 'easeOut' }}
          >
            {flash.kind === 'heal' || flash.kind === 'guard' ? '+' : ''}
            {flash.amount}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

function Bar({ value, max, kind }: { readonly value: number; readonly max: number; readonly kind: string }) {
  const duration = useDuration(0.35);
  const fraction = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <span className="bar" data-kind={kind} aria-hidden="true">
      <motion.span
        className="bar__fill"
        initial={false}
        animate={{ scaleX: fraction }}
        transition={{ duration, ease: 'easeOut' }}
      />
    </span>
  );
}

/**
 * A number that counts, rather than one that cuts.
 *
 * Salt is the only stat you *accumulate*, and a total that ticks up reads as money in a way a
 * number that swaps itself out never does. Everything else on the panel jumps, because HP
 * arriving in instalments would be a lie about what just happened.
 *
 * The tween is view-only and forgets itself: it always starts from whatever is on screen and
 * ends at the value in engine state, so a skipped frame, a fast-forward, or a mid-count second
 * gain all land on the right total. There is no path where the displayed number is the only
 * copy of anything.
 */
function Counter({ value, seconds }: { readonly value: number; readonly seconds: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (seconds <= 0 || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    const startedAt = performance.now();
    let frame = 0;
    const step = (now: number): void => {
      const t = Math.min(1, (now - startedAt) / (seconds * 1000));
      // Ease out, so it arrives rather than stopping.
      const eased = 1 - (1 - t) * (1 - t);
      setShown(Math.round(start + (value - start) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      from.current = value;
    };
  }, [value, seconds]);

  return <>{shown}</>;
}

function Stat({ label, value, after, count }: {
  readonly label: string;
  readonly value: number;
  readonly after?: number;
  /** Tween the digits instead of swapping them. Salt only. */
  readonly count?: true;
}) {
  const duration = useDuration(0.22);
  const counting = useDuration(0.55);
  return (
    <span className="stat" data-zero={value === 0 || undefined}>
      <span className="stat__label">{label}</span>
      <motion.span
        className="stat__value"
        // A counting stat keeps one element across the change, or the tween would be remounted
        // at every intermediate value and never move.
        key={count ? label : value}
        initial={{ scale: duration > 0 && !count ? 1.35 : 1 }}
        animate={{ scale: 1 }}
        transition={{ duration, ease: 'easeOut' }}
      >
        {count ? <Counter value={value} seconds={counting} /> : value}
      </motion.span>
      {after !== undefined && after !== value ? <span className="stat__after">{after}</span> : null}
    </span>
  );
}

export type EnemyBoardProps = {
  readonly state: CombatState;
  readonly flashes: readonly Flash[];
  readonly preview: readonly PreviewBody[];
  /** The body the preview is pointed at, while targeting. */
  readonly targetId: string | null;
  readonly onHover?: (id: string | null) => void;
  readonly onPick?: (id: string) => void;
};

export function EnemyBoard({ state, flashes, preview, targetId, onHover, onPick }: EnemyBoardProps) {
  const shake = useDuration(0.3);
  const bodies = state.combatants.filter((c) => c.team === 'enemy');
  const names = displayNames(state);
  const status = notaryStatus(state);

  return (
    <div className="bodies">
      {bodies.map((body) => {
        const art = artFor(body);
        const ahead = preview.find((p) => p.id === body.id);
        const hit = flashes.some((f) => f.who === body.id && (f.kind === 'damage' || f.kind === 'bleed'));
        const dead = body.hp <= 0;
        const next = body.intents[body.intentIndex % body.intents.length];

        return (
          <motion.div
            className="body"
            data-dead={dead || undefined}
            data-target={targetId === body.id || undefined}
            data-doomed={ahead?.dies || undefined}
            key={body.id}
            animate={hit && shake > 0 ? { x: [0, -6, 5, -3, 0] } : { x: 0 }}
            transition={{ duration: shake, ease: 'easeOut' }}
            onMouseEnter={() => onHover?.(body.id)}
            onMouseLeave={() => onHover?.(null)}
            onClick={() => {
              if (!dead) onPick?.(body.id);
            }}
          >
            <div className="body__art">
              <Art kind={art.kind} id={art.id} alt={names[body.id] ?? body.name} />
              <Flashes flashes={flashes.filter((f) => f.who === body.id)} />
            </div>

            <div className="body__name">
              {names[body.id] ?? body.name}
              {isNotaryBody(body) || (body.phases.length > 0 && body.phase > 1) ? (
                <span className="body__phase">{strings.combat.phase(body.phase)}</span>
              ) : null}
            </div>

            <div className="body__hp">
              <Bar value={body.hp} max={body.maxHp} kind="hp" />
              <span className="body__hpText">
                {dead ? strings.combat.dead : `${String(body.hp)}/${String(body.maxHp)}`}
                {ahead && !dead && ahead.hpAfter !== body.hp ? (
                  <span className="body__hpAfter">{ahead.hpAfter}</span>
                ) : null}
              </span>
            </div>

            {dead ? null : (
              <div className="body__stats">
                <Stat label={strings.combat.guard} value={body.guard} {...(ahead ? { after: ahead.guardAfter } : {})} />
                {body.bleed > 0 ? <Stat label={strings.combat.bleed} value={body.bleed} /> : null}
                {isNotaryBody(body) && status?.active ? (
                  <span className="tag" aria-label={strings.combat.reinkActive(status.window.multiplier, status.remaining)}>
                    {strings.combat.reinkTag(status.window.multiplier, status.remaining)}
                  </span>
                ) : null}
              </div>
            )}

            {dead || !next ? null : (
              <div className="body__next">
                {summarize(next.effects, { by: 'enemy' }).map((chip, i) => (
                  <span
                    className="chip"
                    data-hostile={chip.hostile || undefined}
                    key={`${chip.code}${String(i)}`}
                    title={chip.label}
                  >
                    {chip.n === null ? null : <span className="chip__n">{chip.n}</span>}
                    <span className="chip__code">{chip.code}</span>
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

export type PlayerPanelProps = {
  readonly state: CombatState;
  readonly flashes: readonly Flash[];
  readonly guardAfter: number | null;
  readonly hpAfter: number | null;
  /** Guard went to nothing under a hit this exchange. Drawn, not just heard. */
  readonly guardBroke: boolean;
};

export function PlayerPanel({ state, flashes, guardAfter, hpAfter, guardBroke }: PlayerPanelProps) {
  const shake = useDuration(0.3);
  const player = state.combatants.find((c) => c.team === 'player');
  if (!player) return null;
  const hit = flashes.some((f) => f.who === player.id && (f.kind === 'damage' || f.kind === 'bleed'));
  const frozen = player.guardFrozenUntil > state.beat;
  const portrait = player.hp <= 0 ? 'dying' : player.hp * 3 <= player.maxHp ? 'hurt' : 'neutral';

  return (
    <motion.div
      className="player"
      data-guard-broke={(guardBroke && shake > 0) || undefined}
      animate={hit && shake > 0 ? { x: [0, -5, 4, -2, 0] } : { x: 0 }}
      transition={{ duration: shake, ease: 'easeOut' }}
    >
      <div className="player__portrait">
        <Art kind="portraits" id={`wick_${portrait}`} alt={player.name} />
        <Flashes flashes={flashes.filter((f) => f.who === player.id)} />
      </div>

      <div className="player__stats">
        <div className="player__hp">
          <span className="player__name">{player.name}</span>
          <Bar value={player.hp} max={player.maxHp} kind="hp" />
          <span className="player__hpText">
            {player.hp}/{player.maxHp}
            {hpAfter !== null && hpAfter !== player.hp ? <span className="body__hpAfter">{hpAfter}</span> : null}
          </span>
        </div>

        <div className="player__row">
          <Stat
            label={frozen ? `${strings.combat.guard} (held)` : strings.combat.guard}
            value={player.guard}
            {...(guardAfter !== null ? { after: guardAfter } : {})}
          />
          <Stat label={strings.combat.strain} value={state.strain} />
          <Stat label={strings.combat.salt} value={state.salt} count />
          {player.bleed > 0 ? <Stat label={strings.combat.bleed} value={player.bleed} /> : null}
        </div>

        <div className="player__piles">
          <span>
            {strings.combat.draw} {state.deck.draw.length}
          </span>
          <span>
            {strings.combat.discard} {state.deck.discard.length}
          </span>
          <span>
            {strings.combat.spent} {state.deck.exhausted.length}
          </span>
          <span>
            {strings.combat.hand} {state.deck.hand.length}/{state.handCap}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
