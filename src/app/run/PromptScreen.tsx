/**
 * Every room that is not a fight.
 *
 * One component, because they are one interaction: a heading, some prose, and a list of
 * choices with a cursor on it. What differs is the *shape* of a row, and that is three
 * variants, not seven: a card face, a small object, or a line of text. A Reckoning and a card
 * reward are both "pick a card"; the difference between them is which words are underneath,
 * and words are data.
 *
 * The confirm step for Settling lives here rather than in the engine, because it is not a
 * rule, it is a courtesy: the reducer would happily delete the card on the first press. The
 * second press is for the player's benefit and it belongs where the player is.
 */
import { motion } from 'motion/react';
import { CARDS } from '../../content/cards';
import { hollowOf } from '../../content/hollows';
import { TOKENS } from '../../content/tokens';
import type { RunPrompt } from '../../engine/runtypes';
import { baseIdOf } from '../../engine/variants';
import { Art } from '../art/Art';
import { useDuration } from '../settings';
import { strings } from '../strings';
import { cardName, type RunChoice } from './choices';

export type PromptScreenProps = {
  readonly prompt: RunPrompt;
  readonly choices: readonly RunChoice[];
  readonly cursor: number;
  readonly confirm: number | null;
  readonly onHover: (index: number) => void;
  readonly onPick: (index: number) => void;
};

/** Heading and prose for a room. The one place that knows a Reckoning from an Ink Well. */
function copyFor(prompt: RunPrompt): { heading: string; blurb: string | null } {
  switch (prompt.k) {
    case 'shop':
      return { heading: strings.run.shopHeading, blurb: strings.run.shopBlurb };
    case 'wake':
      return { heading: strings.run.wakeHeading, blurb: strings.run.wakeBlurb };
    case 'hollow': {
      const hollow = hollowOf(prompt.hollowId);
      return { heading: hollow.name, blurb: hollow.text };
    }
    case 'gain_card':
      return { heading: strings.run.rewardHeading, blurb: null };
    case 'gain_token':
      return { heading: strings.run.tokenHeading, blurb: null };
    case 'pick_deck_card':
      switch (prompt.op) {
        case 'settle':
          return { heading: strings.run.settleHeading, blurb: strings.run.settleBlurb };
        case 'remove':
          return { heading: strings.run.removeHeading, blurb: null };
        case 'upgrade':
          return { heading: strings.run.upgradeHeading, blurb: null };
        default:
          return { heading: strings.run.dipHeading, blurb: strings.run.dipBlurb };
      }
  }
}

/** A card row, with its suit tint and its illustration keyed off the base card. */
function CardRow({ choice }: { readonly choice: RunChoice }) {
  const cardId = choice.refId ?? '';
  const base = CARDS[baseIdOf(cardId)];
  return (
    <>
      <span className="pick__art">
        <Art
          kind="cards"
          id={baseIdOf(cardId)}
          {...(base ? { suit: base.suit, glyph: base.type } : {})}
          alt={cardName(cardId)}
        />
      </span>
      <span className="pick__body">
        <span className="pick__name">{cardName(cardId)}</span>
        {choice.detail === null ? null : <span className="pick__detail">{choice.detail}</span>}
      </span>
    </>
  );
}

function TokenRow({ choice }: { readonly choice: RunChoice }) {
  return (
    <>
      <span className="pick__art pick__art--token">
        <Art kind="tokens" id={choice.refId ?? ''} alt={choice.label} />
      </span>
      <span className="pick__body">
        <span className="pick__name">{choice.label}</span>
        {choice.detail === null ? null : <span className="pick__detail">{choice.detail}</span>}
      </span>
    </>
  );
}

function TextRow({ choice }: { readonly choice: RunChoice }) {
  return (
    <span className="pick__body">
      <span className="pick__name">{choice.label}</span>
      {choice.detail === null ? null : <span className="pick__detail">{choice.detail}</span>}
    </span>
  );
}

/**
 * Which shape a row takes, decided by what is behind it rather than by which screen it is on.
 *
 * A card is a card whether you are drafting it, buying it or striking it off, and a shelf can
 * hold both cards and small sad objects, so asking the content what the id refers to is more
 * honest than a per-prompt branch.
 */
function Row({ choice }: { readonly choice: RunChoice }) {
  if (choice.refId !== null && CARDS[baseIdOf(choice.refId)]) return <CardRow choice={choice} />;
  if (choice.refId !== null && TOKENS[choice.refId]) return <TokenRow choice={choice} />;
  return <TextRow choice={choice} />;
}

export function PromptScreen({ prompt, choices, cursor, confirm, onHover, onPick }: PromptScreenProps) {
  const duration = useDuration(0.25);
  const { heading, blurb } = copyFor(prompt);
  const wide = prompt.k === 'gain_card' || (prompt.k === 'pick_deck_card' && prompt.uids.length > 0);

  return (
    <motion.section
      className="prompt"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration }}
      aria-label={heading}
    >
      <h2 className="prompt__heading">{heading}</h2>
      {blurb === null ? null : <p className="prompt__blurb">{blurb}</p>}
      {prompt.k === 'pick_deck_card' && prompt.op === 'settle' && prompt.uids.length === 0 ? (
        <p className="prompt__blurb prompt__blurb--quiet">{strings.run.settleNone}</p>
      ) : null}

      <ul className="prompt__list" data-wide={wide || undefined}>
        {choices.map((choice, index) => {
          const armed = confirm === index;
          return (
            <li key={`${choice.kind}:${choice.action.k}:${String(index)}`}>
              <button
                type="button"
                className={`pick pick--${choice.kind}`}
                data-selected={index === cursor || undefined}
                data-armed={armed || undefined}
                data-disabled={choice.disabled || undefined}
                disabled={choice.disabled}
                onMouseEnter={() => {
                  onHover(index);
                }}
                onFocus={() => {
                  onHover(index);
                }}
                onClick={() => {
                  onPick(index);
                }}
                aria-keyshortcuts={index < 9 ? String(index + 1) : undefined}
              >
                <Row choice={choice} />
                {choice.cost === null ? null : <span className="pick__cost">{choice.cost}</span>}
                {armed ? <span className="pick__confirm">{strings.run.confirm}</span> : null}
                {choice.irreversible && !armed ? (
                  <span className="pick__warn">{strings.run.cannotUndo}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}

