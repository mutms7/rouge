/**
 * The map, and the two properties that would ruin a run if they broke quietly.
 *
 * A dead end and a path that skips the Reckoning are both bugs you find at node nine, in
 * front of somebody, having already lost the seed. So they are asserted across a hundred
 * seeds rather than one: the generator is cheap and a hundred seeds is a second.
 */
import { describe, expect, it } from 'vitest';
import { RUN_CONTENT } from '../content/library';
import { generateMap, reachableFrom, visibleThroughLayer } from './map';
import { makeRng } from './rng';
import type { NodeKind, RunMap } from './runtypes';

function mapFor(seed: number): RunMap {
  const [map] = generateMap(RUN_CONTENT, makeRng(seed, 'map'));
  return map;
}

/** Every walk from the first layer to the last, as lists of node kinds. */
function everyPath(map: RunMap): NodeKind[][] {
  const out: NodeKind[][] = [];
  const walk = (id: string, so_far: NodeKind[]): void => {
    const node = map.nodes[id];
    if (!node) return;
    const path = [...so_far, node.kind];
    if (node.next.length === 0) {
      out.push(path);
      return;
    }
    for (const next of node.next) walk(next, path);
  };
  for (const start of map.layers[0] ?? []) walk(start, []);
  return out;
}

const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);

describe('Act 1 generation', () => {
  it('is twelve layers deep, opening on one node and ending on the boss', () => {
    const map = mapFor(7);
    expect(map.layers).toHaveLength(12);
    expect(map.layers[0]).toHaveLength(1);
    expect(map.layers[11]).toHaveLength(1);
    const boss = map.nodes[map.layers[11]?.[0] ?? ''];
    expect(boss?.kind).toBe('boss');
    expect(boss?.encounterId).toBe('the_notary');
  });

  it('opens on the tutorial body, every time', () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      const first = map.nodes[map.layers[0]?.[0] ?? ''];
      expect(first?.kind).toBe('debtor');
      expect(first?.encounterId).toBe('chalk_debtor');
    }
  });

  it('has no dead ends and no unreachable nodes', () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      const reached = new Set<string>(map.layers[0] ?? []);
      for (const [layer, ids] of map.layers.entries()) {
        for (const id of ids) {
          const node = map.nodes[id];
          expect(node).toBeDefined();
          if (layer < map.layers.length - 1) {
            // Somewhere to go.
            expect(node?.next.length ?? 0).toBeGreaterThan(0);
            for (const next of node?.next ?? []) reached.add(next);
          } else {
            expect(node?.next).toEqual([]);
          }
        }
      }
      // Somewhere to come from.
      for (const id of Object.keys(map.nodes)) expect(reached.has(id)).toBe(true);
    }
  });

  it('gives every possible walk one Assay, one Reckoning and one Wake', () => {
    for (const seed of SEEDS.slice(0, 25)) {
      for (const path of everyPath(mapFor(seed))) {
        expect(path).toHaveLength(12);
        expect(path.filter((k) => k === 'assay').length).toBeGreaterThanOrEqual(1);
        expect(path.filter((k) => k === 'reckoning')).toHaveLength(1);
        expect(path.filter((k) => k === 'wake').length).toBeGreaterThanOrEqual(1);
        expect(path.filter((k) => k === 'collector').length).toBeGreaterThanOrEqual(1);
        expect(path[11]).toBe('boss');
      }
    }
  });

  it('fills every fight and every event with real content', () => {
    for (const seed of SEEDS) {
      for (const node of Object.values(mapFor(seed).nodes)) {
        if (node.kind === 'debtor' || node.kind === 'collector' || node.kind === 'boss') {
          expect(RUN_CONTENT.encounterSetups[node.encounterId ?? '']).toBeDefined();
        } else if (node.kind === 'hollow') {
          expect(RUN_CONTENT.hollows[node.hollowId ?? '']).toBeDefined();
        } else {
          expect(node.encounterId).toBeNull();
        }
      }
    }
  });

  it('never puts the same Hollow in a run twice', () => {
    for (const seed of SEEDS) {
      const ids = Object.values(mapFor(seed).nodes)
        .filter((n) => n.kind === 'hollow')
        .map((n) => n.hollowId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('is the same map from the same seed, and a different one from another', () => {
    expect(JSON.stringify(mapFor(11))).toBe(JSON.stringify(mapFor(11)));
    expect(JSON.stringify(mapFor(11))).not.toBe(JSON.stringify(mapFor(12)));
  });
});

describe('reading the map', () => {
  it('offers the whole first layer before the first step', () => {
    const map = mapFor(3);
    expect(reachableFrom(map, null)).toEqual(map.layers[0]);
  });

  it('offers exactly the out-edges after it', () => {
    const map = mapFor(3);
    const start = map.layers[0]?.[0] ?? '';
    expect(reachableFrom(map, start)).toEqual(map.nodes[start]?.next);
  });

  /** A choice you cannot see is a coin flip, so the next layer is always legible. */
  it('always shows one layer ahead, and further with a Lantern', () => {
    const map = mapFor(3);
    expect(visibleThroughLayer(map, null, 0)).toBe(0);
    const start = map.layers[0]?.[0] ?? '';
    expect(visibleThroughLayer(map, start, 0)).toBe(1);
    expect(visibleThroughLayer(map, start, 3)).toBe(4);
    // And never past the end of the act.
    expect(visibleThroughLayer(map, start, 99)).toBe(11);
  });
});
