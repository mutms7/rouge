/**
 * The only source of randomness.
 *
 * `Math.random` is banned in `engine/` and `content/` by lint and trapped at runtime
 * by `purity.test.ts`. Everything random comes through here, seeded off the run seed,
 * with a separate stream per concern so that rerolling a map does not also reshuffle
 * your draw pile.
 *
 * The generator is sfc32: 128 bits of state, which fits in four numbers. Values are
 * immutable. Every call returns the next number *and* the next state, which is why
 * the reducer can stay `(state, action) => state` and still be seeded: the streams
 * live in the state, so a snapshot round-trips and a replay lands on the same bytes.
 */

/** Four 32-bit words. Immutable: thread the returned state through, never mutate. */
export type Rng = readonly [number, number, number, number];

/**
 * One stream per concern. Adding a stream never disturbs the others, because each is
 * seeded independently off the run seed rather than drawn from a shared sequence.
 */
export const RNG_STREAMS = ['map', 'rewards', 'shuffle', 'ai'] as const;

export type RngStream = (typeof RNG_STREAMS)[number];

export type RngStreams = Readonly<Record<RngStream, Rng>>;

/** xmur3, expanded to four words. Turns a string into a well-mixed sfc32 seed. */
function seedWords(text: string): Rng {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const words: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    words.push(h >>> 0);
  }
  return [words[0] ?? 0, words[1] ?? 0, words[2] ?? 0, words[3] ?? 0];
}

export function makeRng(seed: number, stream: string): Rng {
  return seedWords(`${seed}:${stream}`);
}

export function makeRngStreams(seed: number): RngStreams {
  const streams = {} as Record<RngStream, Rng>;
  for (const stream of RNG_STREAMS) streams[stream] = makeRng(seed, stream);
  return streams;
}

/** sfc32, one step. Returns the 32-bit value and the state that follows it. */
export function nextUint32(rng: Rng): readonly [number, Rng] {
  let [a, b, c, d] = rng;
  a |= 0;
  b |= 0;
  c |= 0;
  d |= 0;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  return [t >>> 0, [a, b, c, d]];
}

/** Uniform in [0, 1). */
export function nextFloat(rng: Rng): readonly [number, Rng] {
  const [value, next] = nextUint32(rng);
  return [value / 4294967296, next];
}

/** Uniform integer in [0, maxExclusive). */
export function nextInt(rng: Rng, maxExclusive: number): readonly [number, Rng] {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error(`nextInt needs a positive integer bound, got ${maxExclusive}`);
  }
  const [value, next] = nextFloat(rng);
  return [Math.floor(value * maxExclusive), next];
}

export function pick<T>(rng: Rng, items: readonly T[]): readonly [T, Rng] {
  const [index, next] = nextInt(rng, items.length);
  const item = items[index];
  if (item === undefined) throw new Error('pick from an empty list');
  return [item, next];
}

/** Fisher-Yates. Returns a new array; the input is left alone. */
export function shuffle<T>(rng: Rng, items: readonly T[]): readonly [T[], Rng] {
  const out = [...items];
  let next = rng;
  for (let i = out.length - 1; i > 0; i -= 1) {
    const [j, advanced] = nextInt(next, i + 1);
    next = advanced;
    const held = out[i] as T;
    out[i] = out[j] as T;
    out[j] = held;
  }
  return [out, next];
}
