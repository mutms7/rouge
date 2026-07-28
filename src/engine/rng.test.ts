import { describe, expect, it } from 'vitest';
import { makeRng, makeRngStreams, nextFloat, nextInt, nextUint32, pick, RNG_STREAMS, shuffle } from './rng';

function take(seed: number, stream: string, n: number): number[] {
  let rng = makeRng(seed, stream);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const [value, next] = nextUint32(rng);
    rng = next;
    out.push(value);
  }
  return out;
}

describe('rng', () => {
  it('gives the same sequence for the same seed and stream', () => {
    expect(take(7, 'shuffle', 12)).toEqual(take(7, 'shuffle', 12));
  });

  it('gives different sequences for different seeds', () => {
    expect(take(7, 'shuffle', 8)).not.toEqual(take(8, 'shuffle', 8));
  });

  it('keeps streams independent, so one concern cannot disturb another', () => {
    const streams = RNG_STREAMS.map((stream) => take(3, stream, 6).join(','));
    expect(new Set(streams).size).toBe(RNG_STREAMS.length);
  });

  it('is a value, not a generator: stepping the same state twice agrees', () => {
    const rng = makeRng(11, 'ai');
    expect(nextUint32(rng)).toEqual(nextUint32(rng));
    const [, next] = nextUint32(rng);
    expect(next).not.toEqual(rng);
  });

  it('makes one stream per concern', () => {
    const streams = makeRngStreams(1);
    expect(Object.keys(streams).sort()).toEqual([...RNG_STREAMS].sort());
  });

  it('stays inside its bounds', () => {
    let rng = makeRng(2, 'map');
    for (let i = 0; i < 500; i += 1) {
      const [value, next] = nextInt(rng, 13);
      rng = next;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(13);
    }
    const [f] = nextFloat(makeRng(2, 'map'));
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThan(1);
  });

  it('rejects a bad bound and an empty pick', () => {
    expect(() => nextInt(makeRng(1, 'map'), 0)).toThrow();
    expect(() => nextInt(makeRng(1, 'map'), 2.5)).toThrow();
    expect(() => pick(makeRng(1, 'map'), [])).toThrow();
  });

  it('shuffles into a permutation without touching the input', () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const [shuffled, next] = shuffle(makeRng(5, 'shuffle'), input);
    expect([...shuffled].sort((a, b) => a - b)).toEqual([...input]);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(next).not.toEqual(makeRng(5, 'shuffle'));
    expect(shuffle(makeRng(5, 'shuffle'), input)[0]).toEqual(shuffled);
  });

  it('actually reorders something of a reasonable size', () => {
    const input = Array.from({ length: 40 }, (_, i) => i);
    const [shuffled] = shuffle(makeRng(9, 'shuffle'), input);
    expect(shuffled).not.toEqual(input);
  });
});
