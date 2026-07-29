/**
 * One card.
 *
 * Nothing here knows about the Tally. It takes a face, a Weight, and some flags, and it
 * draws a piece of paper. The zoom is a transform on hover, which is the whole reason the
 * card is DOM rather than canvas: no re-render, no reflow, and the reduced-motion setting
 * turns it off by lengthening nothing.
 *
 * Colour never carries meaning on its own. The suit is a tinted rule *and* the word, the
 * type is a glyph *and* the word, and an unplayable card says "unplayable" rather than
 * merely going grey.
 */
import { motion } from 'motion/react';
import { SUIT_TINT, PALETTE } from '../../content/palette';
import { Art } from '../art/Art';
import { useDuration } from '../settings';
import { strings } from '../strings';
import type { CardFaceData } from './face';

export type CardFaceProps = {
  readonly face: CardFaceData;
  /** What it costs right now. Boons and the once-per-lap discount are already in it. */
  readonly weight: number;
  /** Printed Weight, so a discount can show its working. */
  readonly printedWeight: number;
  readonly selected?: boolean;
  readonly hovered?: boolean;
  readonly index?: number;
  readonly onHover?: (hovered: boolean) => void;
  readonly onActivate?: () => void;
};

/** Ten cards is the hand cap, so the tenth is keyed to 0. */
function shortcutFor(index: number | undefined): string | null {
  if (index === undefined || index > 9) return null;
  return index === 9 ? '0' : String(index + 1);
}

export function CardFace({
  face,
  weight,
  printedWeight,
  selected = false,
  hovered = false,
  index,
  onHover,
  onActivate,
}: CardFaceProps) {
  // Reduced motion and fast-forward zero the *duration*, not the transform. The zoom is
  // how you read a card, so it still happens, it just happens at once.
  const duration = useDuration(0.18);
  const shortcut = shortcutFor(index);
  const discounted = weight !== printedWeight;

  // A card in hand is about 100px wide at 720p, which is enough to recognise and not
  // enough to read. The zoom is the reading view, and the keyboard gets a smaller one for
  // free so that playing without a mouse does not mean playing without the rules text.
  const scale = hovered ? 1.45 : selected ? 1.25 : 1;

  return (
    <motion.button
      type="button"
      className="card"
      data-suit={face.suit}
      data-selected={selected || undefined}
      data-unplayable={face.playable ? undefined : true}
      style={{ ['--suit-tint' as string]: PALETTE[SUIT_TINT[face.suit]] }}
      animate={{ y: hovered ? -34 : selected ? -18 : 0, scale }}
      transition={{ duration, ease: 'easeOut' }}
      disabled={!face.playable}
      aria-label={`${face.def.name}. ${strings.combat.weight} ${String(weight)}. ${face.text}`}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
      onClick={onActivate}
    >
      <span className="card__top">
        <span className="card__weight" data-discounted={discounted || undefined}>
          <span className="card__weightNum">{weight}</span>
          <span className="card__weightLabel">{discounted ? `was ${String(printedWeight)}` : strings.combat.weight}</span>
        </span>
        {shortcut ? <span className="card__key">{shortcut}</span> : null}
        <span className="card__type">{face.def.type}</span>
      </span>

      <span className="card__art">
        <Art kind="cards" id={face.def.id} suit={face.suit} glyph={face.def.type} />
      </span>

      <span className="card__name">{face.def.name}</span>
      <span className="card__text">{face.playable ? face.text : strings.combat.unplayable}</span>

      <span className="card__foot">
        <span className="card__suit">{face.suit}</span>
        {face.markName ? <span className="card__mark">{face.markName}</span> : null}
      </span>
    </motion.button>
  );
}
