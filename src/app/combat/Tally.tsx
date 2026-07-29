/**
 * The Tally. The centrepiece, and the thing the whole game lives or dies on.
 *
 * One lane per body, twenty-four cells wide, cell 0 is now. Every enemy action is pinned
 * to the beat where it fires, not to "next turn", because planning in this game is spatial
 * (§3.4). As the clock advances the whole strip slides left, which is the only animation in
 * here that is doing real work: it is what makes the track feel like a track rather than a
 * row of boxes that redraws.
 *
 * Positioning is transforms and nothing else. Every movable element is exactly one cell
 * wide, so `translateX(n * 100%)` puts it on beat n whatever the container's width. That
 * is why this survives 1280 through ultrawide with no measurement, no ResizeObserver, and
 * no layout thrash while a marker is mid-flight.
 *
 * The preview band is the single most important thing on the screen. It is drawn as one
 * cell scaled along X, so it stays a transform too, and every intent chip inside it is
 * flagged: those are the actions you are handing over by playing that card.
 */
import { motion } from 'motion/react';
import { useDuration } from '../settings';
import { strings } from '../strings';
import type { PlayPreview } from './preview';
import type { Chip } from './summary';
import type { TrackIntent, TrackLane, TrackView } from './track';

export type TallyProps = {
  readonly view: TrackView;
  readonly preview: PlayPreview | null;
  /** Bodies whose marker the preview moves. Slip is invisible without this. */
  readonly ghostPositions: Readonly<Record<string, number>>;
};

function ChipBadge({ chip }: { readonly chip: Chip }) {
  return (
    <span className="chip" data-hostile={chip.hostile || undefined} data-promised={chip.promised || undefined}>
      {chip.n === null ? null : <span className="chip__n">{chip.n}</span>}
      <span className="chip__code">{chip.code}</span>
    </span>
  );
}

function IntentChip({ intent, flagged, duration }: {
  readonly intent: TrackIntent;
  readonly flagged: boolean;
  readonly duration: number;
}) {
  const label = intent.chips.map((chip) => chip.label).join(' ');
  return (
    <motion.div
      className="tally__slot"
      initial={false}
      animate={{ x: `${String(intent.offset * 100)}%` }}
      transition={{ duration, ease: 'easeOut' }}
    >
      <div className="intent" data-flagged={flagged || undefined} title={label} aria-label={label}>
        {intent.chips.slice(0, 2).map((chip, i) => (
          <ChipBadge chip={chip} key={`${chip.code}${String(i)}`} />
        ))}
      </div>
    </motion.div>
  );
}

/**
 * Guard, drawn as the distance it actually is.
 *
 * The bar reaches the last beat this Guard still covers, so a slab raised eight beats
 * early visibly stops short of the swing it was meant to stop, and the frozen part (Chalk
 * Line, Corroborated) is drawn solid where the melting part is hatched. Same trick as
 * everything else on the strip: one cell wide, scaled along X.
 */
function GuardBar({ guard, duration, label }: {
  readonly guard: NonNullable<TrackLane['guard']>;
  readonly duration: number;
  readonly label: string;
}) {
  return (
    <>
      <motion.div
        className="tally__guard"
        initial={false}
        animate={{ scaleX: guard.through + 1 }}
        transition={{ duration, ease: 'easeOut' }}
        title={label}
        aria-label={label}
      />
      {guard.frozenThrough > 0 ? (
        <motion.div
          className="tally__guard tally__guard--held"
          initial={false}
          animate={{ scaleX: guard.frozenThrough }}
          transition={{ duration, ease: 'easeOut' }}
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}

function Marker({ lane, duration }: { readonly lane: TrackLane; readonly duration: number }) {
  const marker = lane.marker;
  if (!marker) return null;
  const isPlayer = lane.team === 'player';
  return (
    <motion.div
      className="tally__slot tally__slot--marker"
      initial={false}
      animate={{ x: `${String(marker.offset * 100)}%` }}
      transition={{ duration, ease: 'easeOut' }}
    >
      <div
        className="marker"
        data-team={lane.team}
        data-current={marker.current || undefined}
        data-clamped={marker.clamped || undefined}
        aria-label={`${strings.combat.marker(lane.name)}, ${strings.combat.beat.toLowerCase()} ${String(marker.beat)}`}
      >
        <span className="marker__face">{isPlayer ? strings.combat.you : lane.name.slice(0, 2)}</span>
      </div>
    </motion.div>
  );
}

function GhostMarker({ offset, duration, label }: {
  readonly offset: number;
  readonly duration: number;
  readonly label: string;
}) {
  return (
    <motion.div
      className="tally__slot tally__slot--marker"
      initial={false}
      animate={{ x: `${String(offset * 100)}%` }}
      transition={{ duration, ease: 'easeOut' }}
    >
      <div className="marker marker--ghost" aria-hidden="true">
        <span className="marker__face">{label}</span>
      </div>
    </motion.div>
  );
}

export function Tally({ view, preview, ghostPositions }: TallyProps) {
  const duration = useDuration(0.32);
  const flagged = new Set(preview?.interveningKeys ?? []);
  const last = view.beats - 1;

  const bandFrom = preview ? Math.max(0, Math.min(last, preview.from - view.start)) : 0;
  const bandSpan = preview ? Math.max(0.001, Math.min(view.beats - bandFrom, preview.span)) : 0;

  return (
    <section className="tally" style={{ ['--beats' as string]: view.beats }} aria-label={strings.combat.tally}>
      <div className="tally__ruler" aria-hidden="true">
        {view.cells.map((cell) => (
          <div className="tally__tick" data-lap-start={cell.lapStart || undefined} key={cell.beat}>
            {cell.trackBeat}
          </div>
        ))}
      </div>

      <div className="tally__lanes">
        {view.lanes.map((lane) => {
          const ghost = ghostPositions[lane.id];
          const isPlayer = lane.team === 'player';
          return (
            <div className="tally__lane" data-team={lane.team} data-dead={lane.alive ? undefined : true} key={lane.id}>
              <div className="tally__name">{isPlayer ? strings.combat.you : lane.name}</div>
              <div className="tally__strip">
                <div className="tally__grid" aria-hidden="true">
                  {view.cells.map((cell) => (
                    <div className="tally__cell" data-lap-start={cell.lapStart || undefined} key={cell.beat} />
                  ))}
                </div>

                {isPlayer && preview ? (
                  <motion.div
                    className="tally__band"
                    initial={false}
                    animate={{ x: `${String(bandFrom * 100)}%`, scaleX: bandSpan }}
                    transition={{ duration, ease: 'easeOut' }}
                    aria-hidden="true"
                  />
                ) : null}

                {lane.guard ? (
                  <GuardBar
                    guard={lane.guard}
                    duration={duration}
                    label={strings.combat.guardThrough(lane.guard.n, view.start + lane.guard.through)}
                  />
                ) : null}

                {lane.intents.map((intent) => (
                  <IntentChip intent={intent} flagged={flagged.has(intent.key)} duration={duration} key={intent.key} />
                ))}

                {ghost === undefined ? null : (
                  <GhostMarker
                    offset={Math.max(0, Math.min(last, ghost - view.start))}
                    duration={duration}
                    label={isPlayer ? strings.combat.you : lane.name.slice(0, 2)}
                  />
                )}

                <Marker lane={lane} duration={duration} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
