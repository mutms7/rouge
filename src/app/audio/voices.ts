/**
 * Procedural sound, per the same principle as the art contract's placeholders.
 *
 * The art pipeline draws a labelled, suit-tinted rectangle when a PNG is missing, so a
 * screenshot taken before the art exists is still legible and a missing file is never a
 * crash. This is that idea for the ear: every cue has a recipe, so the demo has a full sound
 * design the day it is wired up, and a real recording dropped into `public/audio/` takes
 * over silently. Nothing here pretends to be the final sound. It pretends to be *a* sound,
 * which is the whole job of a placeholder.
 *
 * Written as small envelopes over oscillators and filtered noise rather than as samples,
 * because the alternative is inventing binary assets, and an invented WAV is exactly the kind
 * of thing that survives into a shipped build because nobody can diff it.
 *
 * Deliberately no Howler in this file. Howler owns playback of real files; this owns the
 * fallback, and keeping them apart means the fallback is testable arithmetic rather than a
 * mock of an audio library.
 */
import type { Cue } from '../combat/feel';

export type Voice = {
  /** Seconds. Nothing here is long: these play on top of each other constantly. */
  readonly length: number;
  /** How loud, before the master gain. 0 to 1. */
  readonly gain: number;
  readonly render: (ctx: AudioContext, into: AudioNode, at: number) => void;
};

// ---------------------------------------------------------------------------
// Ingredients
// ---------------------------------------------------------------------------

/** One shaped burst of an oscillator. The building block for everything with a pitch. */
function tone(
  ctx: AudioContext,
  into: AudioNode,
  at: number,
  options: {
    readonly type: OscillatorType;
    readonly from: number;
    readonly to?: number;
    readonly length: number;
    readonly gain: number;
    /** Seconds of fade-in. A click is 0, a swell is most of the length. */
    readonly attack?: number;
  },
): void {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  const attack = options.attack ?? 0.002;

  osc.type = options.type;
  osc.frequency.setValueAtTime(options.from, at);
  if (options.to !== undefined && options.to !== options.from) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.to), at + options.length);
  }

  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(options.gain, at + attack);
  // Exponential to a floor rather than to zero: ramping to exactly 0 is undefined and
  // Chrome renders it as a click, which is audible on a sound this short.
  amp.gain.exponentialRampToValueAtTime(0.0001, at + options.length);

  osc.connect(amp).connect(into);
  osc.start(at);
  osc.stop(at + options.length + 0.02);
}

/** A cached second of white noise. Paper, breath, and the grain under every impact. */
let noiseCache: AudioBuffer | null = null;
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseCache && noiseCache.sampleRate === ctx.sampleRate) return noiseCache;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Deterministic, so two runs of the same fight sound the same. A little pride, no cost:
  // a 32-bit LCG is three lines and nothing here needs statistical quality.
  let seed = 0x2f6e6a;
  for (let i = 0; i < data.length; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  noiseCache = buffer;
  return buffer;
}

/** Filtered noise. `q` above 1 turns it from a hiss into a pitch you can almost name. */
function noise(
  ctx: AudioContext,
  into: AudioNode,
  at: number,
  options: {
    readonly length: number;
    readonly gain: number;
    readonly type: BiquadFilterType;
    readonly from: number;
    readonly to?: number;
    readonly q?: number;
    readonly attack?: number;
  },
): void {
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  const attack = options.attack ?? 0.003;

  source.buffer = noiseBuffer(ctx);
  source.loop = true;
  filter.type = options.type;
  filter.frequency.setValueAtTime(options.from, at);
  if (options.to !== undefined && options.to !== options.from) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, options.to), at + options.length);
  }
  filter.Q.value = options.q ?? 0.8;

  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(options.gain, at + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + options.length);

  source.connect(filter).connect(amp).connect(into);
  source.start(at);
  source.stop(at + options.length + 0.02);
}

// ---------------------------------------------------------------------------
// The voices
// ---------------------------------------------------------------------------

/**
 * One recipe per cue. The fiction is dry, administrative, and made of paper (§13), so almost
 * nothing here is a musical note: it is card stock, ink, wood, and one appalling brass stamp.
 */
export const VOICES: Record<Cue, Voice> = {
  /** Card stock leaving a hand. A short shaped hiss, no pitch. */
  card_play: {
    length: 0.16,
    gain: 0.5,
    render: (ctx, into, at) => {
      noise(ctx, into, at, { length: 0.13, gain: 0.5, type: 'bandpass', from: 2600, to: 900, q: 0.9 });
      tone(ctx, into, at, { type: 'triangle', from: 320, to: 180, length: 0.06, gain: 0.1 });
    },
  },

  /** Quieter and higher than a play: one card off the top, not a whole gesture. */
  card_draw: {
    length: 0.1,
    gain: 0.3,
    render: (ctx, into, at) => {
      noise(ctx, into, at, { length: 0.075, gain: 0.42, type: 'highpass', from: 1500, to: 3400, q: 0.6 });
    },
  },

  /** Meat and paper. The low body carries it; the noise is the edge of the wound. */
  hit: {
    length: 0.28,
    gain: 0.85,
    render: (ctx, into, at) => {
      tone(ctx, into, at, { type: 'sine', from: 170, to: 48, length: 0.24, gain: 0.85 });
      noise(ctx, into, at, { length: 0.11, gain: 0.35, type: 'lowpass', from: 1700, to: 400 });
    },
  },

  /** Held. A dull woody knock that goes nowhere, because nothing got through. */
  guard_hold: {
    length: 0.13,
    gain: 0.45,
    render: (ctx, into, at) => {
      tone(ctx, into, at, { type: 'square', from: 210, to: 150, length: 0.05, gain: 0.22 });
      noise(ctx, into, at, { length: 0.1, gain: 0.3, type: 'bandpass', from: 700, to: 420, q: 2.4 });
    },
  },

  /** Slate giving. Brighter, longer, and with a tail the hold does not have. */
  guard_break: {
    length: 0.42,
    gain: 0.8,
    render: (ctx, into, at) => {
      noise(ctx, into, at, { length: 0.3, gain: 0.6, type: 'highpass', from: 900, to: 2600, q: 0.7 });
      tone(ctx, into, at, { type: 'triangle', from: 620, to: 90, length: 0.2, gain: 0.35 });
      // The pieces landing.
      noise(ctx, into, at + 0.09, { length: 0.22, gain: 0.22, type: 'bandpass', from: 1800, to: 3000, q: 1.6 });
    },
  },

  /**
   * Interest. A ledger being written in while you were busy.
   *
   * Three quick nib strokes, descending, so it reads as a total being carried rather than as
   * a hit. Debt in this game is clerical, and the sound is the only place that can say so
   * while your HP bar is dropping.
   */
  interest: {
    length: 0.5,
    gain: 0.6,
    render: (ctx, into, at) => {
      for (const [index, offset] of [0, 0.075, 0.15].entries()) {
        noise(ctx, into, at + offset, {
          length: 0.07,
          gain: 0.3,
          type: 'bandpass',
          from: 3200 - index * 500,
          to: 1500,
          q: 3,
        });
      }
      tone(ctx, into, at + 0.16, { type: 'sine', from: 130, to: 74, length: 0.3, gain: 0.4, attack: 0.02 });
    },
  },

  /**
   * The stamp. The most memorable sound in the demo, per the phase brief.
   *
   * Three parts in eighty milliseconds, which is what makes a stamp a stamp: the *shove* of
   * the arm coming down, the flat wooden crack of the die meeting the desk, and the low brass
   * ring underneath that nothing else in the mix has. Loudest voice in the table, and the
   * only one with a real tail, because the Notary stamping your character sheet is the worst
   * thing that happens in Act 1 and it should not be possible to miss.
   */
  stamp: {
    length: 0.75,
    gain: 1,
    render: (ctx, into, at) => {
      // The arm.
      noise(ctx, into, at, { length: 0.05, gain: 0.3, type: 'lowpass', from: 2200, to: 700, attack: 0.012 });
      // The die on the desk. Hard attack, no pitch to speak of.
      noise(ctx, into, at + 0.045, { length: 0.09, gain: 0.95, type: 'bandpass', from: 1100, to: 300, q: 1.1, attack: 0.001 });
      tone(ctx, into, at + 0.045, { type: 'square', from: 260, to: 60, length: 0.1, gain: 0.55, attack: 0.001 });
      // Brass, ringing after. Two close partials so it beats slightly rather than sitting still.
      tone(ctx, into, at + 0.05, { type: 'sine', from: 196, length: 0.62, gain: 0.3, attack: 0.006 });
      tone(ctx, into, at + 0.05, { type: 'sine', from: 293, length: 0.5, gain: 0.16, attack: 0.008 });
      tone(ctx, into, at + 0.05, { type: 'sine', from: 61, length: 0.7, gain: 0.4, attack: 0.01 });
    },
  },

  /** A lie coming true. Rising, because it is the one good surprise in the deck. */
  perjury: {
    length: 0.36,
    gain: 0.55,
    render: (ctx, into, at) => {
      tone(ctx, into, at, { type: 'triangle', from: 240, to: 700, length: 0.22, gain: 0.3, attack: 0.01 });
      tone(ctx, into, at + 0.06, { type: 'sine', from: 480, to: 990, length: 0.24, gain: 0.2, attack: 0.02 });
    },
  },

  /** The re-ink window opening. A wet intake, and an invitation. */
  reink: {
    length: 0.4,
    gain: 0.5,
    render: (ctx, into, at) => {
      noise(ctx, into, at, { length: 0.3, gain: 0.34, type: 'bandpass', from: 500, to: 2400, q: 1.3, attack: 0.09 });
      tone(ctx, into, at + 0.1, { type: 'sine', from: 330, to: 494, length: 0.28, gain: 0.16, attack: 0.05 });
    },
  },

  /** Settling. Down, and then nothing. */
  death: {
    length: 0.6,
    gain: 0.7,
    render: (ctx, into, at) => {
      tone(ctx, into, at, { type: 'sine', from: 150, to: 40, length: 0.5, gain: 0.5, attack: 0.01 });
      noise(ctx, into, at + 0.04, { length: 0.4, gain: 0.28, type: 'lowpass', from: 1200, to: 200 });
    },
  },
};
