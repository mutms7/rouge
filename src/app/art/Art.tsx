import type { ArtKind } from '../../content/art';
import type { Suit } from '../../content/palette';
import './art.css';
import { artUrl } from './manifest';
import { GLYPH_PATHS, placeholderFor, type PlaceholderGlyph } from './placeholder';

export type ArtProps = {
  kind: ArtKind;
  id: string;
  /** Tints the placeholder. Cards pass their suit; other kinds have a default. */
  suit?: Suit;
  /** Shape hint on the placeholder. Cards pass attack or skill. */
  glyph?: PlaceholderGlyph;
  /** Description for assistive tech. Omit for decorative art. */
  alt?: string;
  className?: string;
};

/**
 * Renders the real image when the manifest has one and a procedural placeholder when
 * it does not. Nothing else in the codebase should ever build an art URL by hand.
 */
export function Art({ kind, id, suit, glyph, alt, className }: ArtProps) {
  const url = artUrl(kind, id);
  const classes = className ? `art ${className}` : 'art';

  if (url) {
    return <img className={`${classes} art__img`} src={url} alt={alt ?? ''} data-art={`${kind}/${id}`} />;
  }

  const placeholder = placeholderFor(kind, id, { ...(suit ? { suit } : {}), ...(glyph ? { glyph } : {}) });

  return (
    <div
      className={`${classes} art--placeholder`}
      style={{
        background: placeholder.background,
        color: placeholder.ink,
        aspectRatio: placeholder.aspectRatio,
      }}
      data-art={placeholder.label}
      data-placeholder="true"
      {...(alt ? { role: 'img', 'aria-label': alt } : {})}
    >
      <svg className="art__glyph" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <path d={GLYPH_PATHS[placeholder.glyph]} fill="currentColor" fillRule="evenodd" />
      </svg>
      <span className="art__label" aria-hidden={alt ? true : undefined}>
        {placeholder.label}
      </span>
    </div>
  );
}
