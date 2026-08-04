/**
 * The hand, the preview readout, and the record.
 *
 * The hand persists across the whole fight, so it is a row rather than a "turn's worth of
 * cards": no discard at end of turn, no reshuffle theatre. Cards leave it when you play
 * them and arrive one at a time as you act.
 *
 * The readout under it is the other half of the hover preview. The band on the track says
 * *where*; this says *what it costs you*, in the four numbers a player actually needs:
 * beats handed over, actions that fire first, damage taken, Guard left standing.
 */
import { AnimatePresence, motion } from 'motion/react';
import { useDuration } from '../settings';
import { strings } from '../strings';
import { CardFace } from './CardFace';
import type { CardFaceData } from './face';
import type { LogLine } from './feed';
import type { PlayPreview } from './preview';

export type HandCard = {
  readonly uid: string;
  readonly face: CardFaceData;
  readonly weight: number;
  readonly printedWeight: number;
  readonly discardable: boolean;
};

export type HandProps = {
  readonly cards: readonly HandCard[];
  readonly handCap: number;
  readonly cursor: number;
  readonly hovered: string | null;
  /** The card that owns visual selection (targeting > pointer > keyboard cursor). */
  readonly activeUid?: string | null;
  readonly interactive: boolean;
  readonly onHover: (uid: string | null) => void;
  readonly onActivate: (uid: string) => void;
  readonly onDiscard: (uid: string) => void;
  readonly onWait: () => void;
};

export function Hand({ cards, handCap, cursor, hovered, activeUid, interactive, onHover, onActivate, onDiscard, onWait }: HandProps) {
  const duration = useDuration(0.22);
  // A pointer hover is the strongest visual selection. If the pointer is not over a card,
  // the keyboard cursor remains the accessible fallback. Ignore stale hover ids after a
  // card leaves the hand so the cursor never appears to disappear.
  const hoveredCard = hovered !== null && cards.some((card) => card.uid === hovered) ? hovered : null;
  const visualUid = activeUid ?? hoveredCard ?? (interactive ? cards[cursor]?.uid ?? null : null);

  const noPlayableChoice = cards.every((card) => !card.face.playable);
  const waitBlocked = cards.length >= handCap;
  const waitLabel = waitBlocked ? strings.combat.waitFull : strings.combat.waitNoOptions;

  return (
    <div className={`hand${cards.length === 0 ? ' hand--empty' : ''}`} role="group" aria-label={strings.combat.hand}>
      {cards.length === 0 ? <p>{strings.combat.empty}</p> : null}
      <AnimatePresence initial={false}>
        {cards.map((card, index) => (
          <motion.div
            className="hand__slot"
            key={card.uid}
            // Slot dimensions are reserved in CSS. Animating layout here would briefly
            // reflow neighbouring cards while a card is added or removed, which makes a
            // pointer hover look like a jump even though the card itself only transforms.
            layout={false}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24, scale: 0.9 }}
            transition={{ duration, ease: 'easeOut' }}
            onMouseEnter={() => {
              onHover(card.uid);
            }}
            onMouseLeave={() => {
              onHover(null);
            }}
          >
            <CardFace
              face={card.face}
              weight={card.weight}
              printedWeight={card.printedWeight}
              index={index}
              selected={interactive && visualUid === card.uid}
              hovered={interactive && hoveredCard === card.uid}
              onActivate={() => {
                onActivate(card.uid);
              }}
            />
            {card.discardable ? (
              <button
                type="button"
                className="card__discard"
                disabled={!interactive}
                aria-label={strings.combat.discardCompound(card.face.def.name)}
                onClick={() => {
                  onDiscard(card.uid);
                }}
              >
                {strings.combat.discardZero}
              </button>
            ) : null}
          </motion.div>
        ))}
      </AnimatePresence>
      {noPlayableChoice ? (
        <button
          type="button"
          className="hand__wait"
          disabled={!interactive || waitBlocked}
          aria-label={waitLabel}
          aria-keyshortcuts="W"
          onClick={onWait}
        >
          <span>{waitLabel}</span>
          <kbd>W</kbd>
        </button>
      ) : null}
    </div>
  );
}

export type ReadoutProps = {
  readonly preview: PlayPreview | null;
  /** The face the preview is about, so the readout can carry its full text. */
  readonly card: CardFaceData | null;
  readonly targeting: boolean;
  readonly waiting: boolean;
};

/**
 * The four numbers, in the order a player asks for them.
 *
 * Targeting adds a prompt rather than replacing the readout, because the numbers are the
 * entire reason you are choosing a body: which of the two Owed you hit changes what comes
 * back at you, and hiding that until after you commit would be the wrong way round.
 */
export function Readout({ preview, card, targeting, waiting }: ReadoutProps) {
  if (!preview) {
    return (
      <div className="readout readout--prompt" role="status" aria-live="polite" aria-atomic="true">
        <span>{waiting ? strings.combat.waiting : strings.combat.yourMove}</span>
      </div>
    );
  }

  const parts: string[] = [
    strings.preview.cost(preview.weight),
    strings.preview.lands(preview.landsOn),
    strings.preview.handsOver(preview.span),
    preview.interveningKeys.length === 0
      ? strings.preview.noActions
      : strings.preview.actions(preview.interveningKeys.length),
    preview.damageTaken === 0 ? strings.preview.takesNothing : strings.preview.takes(preview.damageTaken),
    strings.preview.guardLeft(preview.guardAfter),
  ];
  if (preview.kills.length > 0) parts.push(strings.preview.kills(preview.kills));
  if (preview.crossesLap) parts.push(strings.preview.lapCrossed);

  return (
    <div
      className="readout"
      data-fatal={preview.fatal || undefined}
      data-wins={preview.wins || undefined}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="readout__head">
        {card?.def.name ?? strings.preview.heading}
        {targeting ? <span className="readout__prompt">{strings.preview.target}</span> : null}
      </span>
      {card ? <span className="readout__rules">{card.playable ? card.text : strings.combat.unplayable}</span> : null}
      <span className="readout__line">{parts.join(' · ')}</span>
      {card?.markName ? (
        <span className="readout__mark">
          {card.markName}. {card.markText}
        </span>
      ) : null}
      {preview.fatal ? <span className="readout__warn">{strings.preview.fatal}</span> : null}
      {preview.wins ? <span className="readout__win">{strings.preview.wins}</span> : null}
    </div>
  );
}

/**
 * The record.
 *
 * Newest first in the DOM, laid out `column-reverse`, which puts it back in reading order
 * on screen with the newest line at the bottom and the scroll already pinned there. No
 * effect, no ref, no scroll management: the panel cannot fall behind the log because it
 * never had a position to lose.
 */
export function Record({ lines }: { readonly lines: readonly LogLine[] }) {
  const newestFirst = [...lines].reverse();
  return (
    <div className="record" aria-label={strings.combat.log}>
      <div className="record__head">{strings.combat.log}</div>
      <ol className="record__list">
        {newestFirst.map((line) => (
          <li className="record__line" data-tone={line.tone} key={line.key}>
            <span className="record__beat">{line.beat}</span>
            <span>{line.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
