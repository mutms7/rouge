/**
 * Sound, behind one function.
 *
 * `play('stamp')` is the entire public surface. Underneath it there are two players and the
 * caller never learns which one answered:
 *
 * - Howler, for a real file in `public/audio/`. The stack is locked to Howler by the brief,
 *   and this is what it is for: sprite handling, pooling, the mobile unlock dance, and the
 *   volume plumbing that would otherwise be written twice.
 * - The procedural voices in `voices.ts`, when there is no file. Same contract as the art
 *   placeholders: a missing asset is a legible stand-in, never silence and never a crash.
 *
 * Which one is in play is decided by Howler's own load error, so dropping a real `hit.webm`
 * into `public/audio/` is the only step needed to replace a voice. There is no manifest to
 * regenerate and no per-cue wiring to change.
 *
 * Nothing in here is allowed to throw into a render. A browser that refuses audio entirely,
 * an autoplay policy that has not been satisfied yet, a `webm` a browser will not decode:
 * all of it degrades to a quiet game. The board is never waiting on a sound.
 */
import { Howl, Howler } from 'howler';
import type { Cue } from '../combat/feel';
import { VOICES } from './voices';

/** Where a real recording would live. Both extensions are tried, in this order. */
const DIRECTORY = '/audio';
const FORMATS = ['webm', 'mp3'] as const;

/**
 * Cues that may fire several times in one exchange but should only be heard once.
 *
 * A card that draws four cards is one sound, not four, and a Marginalia flood is one hit and
 * not three. Kept as a floor in milliseconds rather than as a queue, because the alternative
 * is a scheduler that can fall behind the board.
 */
const RETRIGGER_MS: Partial<Record<Cue, number>> = {
  card_draw: 55,
  hit: 45,
  guard_hold: 60,
};

type Entry = {
  /** Present once Howler has confirmed a file. Null while loading, or forever if there is none. */
  howl: Howl | null;
  /** Set when Howler fails: from then on, the voice answers immediately. */
  synthesized: boolean;
  lastPlayedAt: number;
};

const entries = new Map<Cue, Entry>();
let context: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let volume = 0.7;

function entryFor(cue: Cue): Entry {
  const existing = entries.get(cue);
  if (existing) return existing;

  const entry: Entry = { howl: null, synthesized: false, lastPlayedAt: 0 };
  entries.set(cue, entry);

  // Ask for a file, once, and never ask again. Howler reports the failure asynchronously, so
  // until it does, `play` uses the voice: the first stamp of a session is never silent while
  // a 404 is in flight.
  try {
    const howl = new Howl({
      src: FORMATS.map((format) => `${DIRECTORY}/${cue}.${format}`),
      preload: true,
      html5: false,
      volume: VOICES[cue].gain,
      onload: () => {
        entry.howl = howl;
      },
      onloaderror: () => {
        entry.synthesized = true;
      },
    });
  } catch {
    entry.synthesized = true;
  }
  return entry;
}

/**
 * The context, made on first use rather than at import.
 *
 * Browsers refuse to start one before a gesture, and a suspended context created at module
 * load stays suspended in some of them. Resuming on every play is cheap and idempotent.
 */
function audioContext(): { ctx: AudioContext; into: AudioNode } | null {
  // The precise question, rather than "is there a window": a browser can have a DOM and refuse
  // the Web Audio API, and a headless environment can have neither.
  if (typeof AudioContext === 'undefined') return null;
  try {
    if (!context) {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = volume;
      master.connect(context.destination);
    }
    if (context.state === 'suspended') void context.resume();
    return master ? { ctx: context, into: master } : null;
  } catch {
    return null;
  }
}

/** Master volume, 0 to 1. Phase 7 puts a slider on it; the plumbing is here now. */
export function setVolume(value: number): void {
  volume = Math.max(0, Math.min(1, value));
  if (master) master.gain.value = volume;
  Howler.volume(volume);
}

export function setAudioEnabled(value: boolean): void {
  enabled = value;
  Howler.mute(!value);
}

export function audioEnabled(): boolean {
  return enabled;
}

/** True when the cue is currently coming from `voices.ts` rather than from a file. */
export function isSynthesized(cue: Cue): boolean {
  return entryFor(cue).synthesized;
}

/** Play one cue. Never throws, never blocks, and never makes the caller wait. */
export function play(cue: Cue, at = Date.now()): void {
  if (!enabled) return;
  const entry = entryFor(cue);

  const floor = RETRIGGER_MS[cue] ?? 0;
  if (floor > 0 && at - entry.lastPlayedAt < floor) return;
  entry.lastPlayedAt = at;

  if (entry.howl) {
    try {
      entry.howl.play();
      return;
    } catch {
      // A file that loaded and then refused to play is a file we stop trusting.
      entry.howl = null;
      entry.synthesized = true;
    }
  }

  const audio = audioContext();
  if (!audio) return;
  const voice = VOICES[cue];
  try {
    const shaped = audio.ctx.createGain();
    shaped.gain.value = voice.gain;
    shaped.connect(audio.into);
    voice.render(audio.ctx, shaped, audio.ctx.currentTime);
  } catch {
    // A closed or throwing context means a quiet game, which is a fine way to lose.
  }
}

/** Play a whole moment's worth. Order is the log's order, which is the order it happened. */
export function playAll(cues: readonly Cue[], at = Date.now()): void {
  for (const cue of cues) play(cue, at);
}

/** Drop every cached decision. Tests only: the browser has nothing to reset. */
export function resetAudioForTests(): void {
  entries.clear();
  context = null;
  master = null;
  enabled = true;
  volume = 0.7;
}
