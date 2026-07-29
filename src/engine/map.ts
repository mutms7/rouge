/**
 * Act 1's map. Twelve layers, branching, seeded, and generated once per run.
 *
 * §2 says the run structure is deliberately the standard skeleton: someone should
 * understand the map in four seconds and then get blindsided by the first fight. So this is
 * a layered DAG, one step per layer, and the interesting decision is which *branch* you
 * take rather than how the graph is shaped.
 *
 * Two properties the generator guarantees, because both are bugs you would find at the
 * worst possible moment otherwise:
 *
 * 1. No dead ends. Every node has an out-edge to the next layer and an in-edge from the
 *    previous one, so no path can strand you and no node is unreachable.
 * 2. Every path is a legal run. The structural layers (Assay, Reckoning, Wake) are one kind
 *    across their whole layer, so you get exactly one of each however you walk it. Whether
 *    the fight at layer 3 is a Chalk Hound or a Receipt Wraith is what the branch is for.
 *
 * Everything is drawn off the `map` stream, at generation time, so the whole map including
 * which body stands where is fixed by the seed. A bug report in this game is a seed.
 */
import { nextInt, shuffle } from './rng';
import type { Rng } from './rng';
import type { LayerSpec, NodeKind, RunContent, RunMap, RunNode } from './runtypes';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export function nodeId(layer: number, index: number): string {
  return `l${String(layer)}n${String(index)}`;
}

/**
 * Deals from a shuffled bag, reshuffling when it runs dry.
 *
 * Which is not the same as picking at random each time: a run should not open with the same
 * body three layers running, and a bag gives you that for free without a "did I just use
 * this" check at every call site.
 */
type Bag = { items: string[]; rng: Rng };

function makeBag(rng: Rng, items: readonly string[]): Bag {
  const [shuffled, next] = shuffle(rng, items);
  return { items: shuffled, rng: next };
}

function draw(bag: Bag, source: readonly string[]): string {
  if (bag.items.length === 0) {
    const [shuffled, next] = shuffle(bag.rng, source);
    bag.items = shuffled;
    bag.rng = next;
  }
  // Non-null: either the bag had something or it was just refilled from a non-empty source.
  return bag.items.pop() as string;
}

function widthOf(spec: LayerSpec, rng: Rng): readonly [number, Rng] {
  const [min, max] = spec.width;
  const low = Math.max(1, Math.min(min, max));
  const high = Math.max(low, max);
  if (high === low) return [low, rng];
  const [roll, next] = nextInt(rng, high - low + 1);
  return [low + roll, next];
}

/**
 * Edges between two layers.
 *
 * Two passes, and both are needed. The first gives every node in this layer somewhere to
 * go; the second gives every node in the next layer somewhere to come from. Then one
 * optional extra edge per node, which is the only source of interesting shape: without it
 * a 2-wide map is two parallel corridors and the branch never means anything.
 */
function edgesBetween(width: number, nextWidth: number, rng: Rng): readonly [number[][], Rng] {
  const out: number[][] = Array.from({ length: width }, () => []);
  let stream = rng;

  for (let i = 0; i < width; i += 1) {
    const target = Math.min(nextWidth - 1, Math.floor((i * nextWidth) / width));
    (out[i] as number[]).push(target);
  }
  for (let j = 0; j < nextWidth; j += 1) {
    if (out.some((targets) => targets.includes(j))) continue;
    const from = Math.min(width - 1, Math.floor((j * width) / nextWidth));
    (out[from] as number[]).push(j);
  }
  for (let i = 0; i < width; i += 1) {
    const targets = out[i] as number[];
    // A node that already reaches everything has nothing to gain, and a fork the player
    // cannot see the far side of is noise.
    if (targets.length >= nextWidth) continue;
    const [roll, next] = nextInt(stream, 2);
    stream = next;
    if (roll === 0) continue;
    const neighbour = (targets[0] as number) + ((roll % 2) * 2 - 1);
    const clamped = Math.max(0, Math.min(nextWidth - 1, neighbour));
    if (!targets.includes(clamped)) targets.push(clamped);
  }

  for (const targets of out) targets.sort((a, b) => a - b);
  return [out, stream];
}

/**
 * A whole act.
 *
 * Returns the map and the advanced stream, so the caller threads the RNG on rather than
 * this reaching for a fresh one. Same contract as everything else in `rng.ts`.
 */
export function generateMap(content: RunContent, rng: Rng): readonly [RunMap, Rng] {
  const specs = content.layers;
  if (specs.length < 2) throw new Error('an act needs at least a first layer and a boss');

  let stream = rng;

  // Widths first, because an edge needs to know how wide the layer it lands in is.
  const widths: number[] = [];
  for (const spec of specs) {
    const [width, next] = widthOf(spec, stream);
    stream = next;
    widths.push(width);
  }

  const kindBags = new Map<string, Bag>();
  const normals = makeBag(stream, content.encounters.normal);
  stream = normals.rng;
  const collectors = makeBag(stream, content.encounters.collector);
  stream = collectors.rng;
  const hollows = makeBag(stream, content.hollowIds);
  stream = hollows.rng;

  const nodes: Record<string, RunNode> = {};
  const layers: string[][] = [];

  for (const [layer, spec] of specs.entries()) {
    const width = widths[layer] as number;
    const ids: string[] = [];
    for (let index = 0; index < width; index += 1) {
      let kind: NodeKind;
      if (spec.kinds.length === 1) {
        kind = spec.kinds[0] as NodeKind;
      } else {
        // A per-layer bag rather than a fresh roll, so a 3-wide layer of two kinds cannot
        // come out all the same and quietly remove the choice.
        const key = `layer${String(layer)}`;
        let bag = kindBags.get(key);
        if (!bag) {
          bag = makeBag(stream, spec.kinds);
          stream = bag.rng;
          kindBags.set(key, bag);
        }
        kind = draw(bag, spec.kinds) as NodeKind;
      }

      let encounterId: string | null = null;
      let hollowId: string | null = null;
      if (kind === 'debtor') {
        // Fight one is always the tutorial body. The beat grid has to explain itself
        // against something with a single telegraphed attack.
        encounterId = layer === 0 ? content.encounters.tutorial : draw(normals, content.encounters.normal);
      } else if (kind === 'collector') {
        encounterId = draw(collectors, content.encounters.collector);
      } else if (kind === 'boss') {
        encounterId = content.encounters.boss;
      } else if (kind === 'hollow') {
        hollowId = draw(hollows, content.hollowIds);
      }

      const id = nodeId(layer, index);
      nodes[id] = { id, layer, index, kind, encounterId, hollowId, next: [] };
      ids.push(id);
    }
    layers.push(ids);
  }

  for (let layer = 0; layer < specs.length - 1; layer += 1) {
    const [edges, next] = edgesBetween(widths[layer] as number, widths[layer + 1] as number, stream);
    stream = next;
    for (const [index, targets] of edges.entries()) {
      const node = nodes[nodeId(layer, index)] as Mutable<RunNode>;
      node.next = targets.map((target) => nodeId(layer + 1, target));
    }
  }

  return [{ nodes, layers }, stream];
}

/** The nodes a player standing at `at` may step to. The whole first layer, at the start. */
export function reachableFrom(map: RunMap, at: string | null): readonly string[] {
  if (at === null) return map.layers[0] ?? [];
  return map.nodes[at]?.next ?? [];
}

export function nodeAt(map: RunMap, id: string): RunNode {
  const node = map.nodes[id];
  if (!node) throw new Error(`no node called ${id}`);
  return node;
}

/**
 * Which layers the player may read.
 *
 * The next one is always legible, because a choice you cannot see is a coin flip. Lantern
 * and the handwriting on the wall push the horizon out from there.
 */
export function visibleThroughLayer(map: RunMap, at: string | null, revealed: number): number {
  const here = at === null ? -1 : nodeAt(map, at).layer;
  return Math.min(map.layers.length - 1, here + 1 + revealed);
}
