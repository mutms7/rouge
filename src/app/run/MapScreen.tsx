/**
 * The ledger: twelve layers of Act 1, top to bottom, with your line drawn down it.
 *
 * §2 asks for a map somebody understands in four seconds, so this is a column of rows and
 * nothing cleverer. Depth reads downward because you are descending, the layer you may step
 * into is the only one lit, and everything past the horizon is a ruled line with no symbol on
 * it: the shape of what is coming is legible, the content is not, which is what makes Lantern
 * and the handwriting on the wall worth having.
 *
 * Colourblind rule, and it applies to every node on screen: the symbol from §5.1 and the
 * node's name are both always present. Nothing here is carried by colour.
 */
import { motion } from 'motion/react';
import { nodeOf } from '../../content/run';
import { visibleLayers } from '../../engine/run';
import type { RunNode, RunState } from '../../engine/runtypes';
import { useDuration } from '../settings';
import { strings } from '../strings';
import type { RunChoice } from './choices';

export type MapScreenProps = {
  readonly run: RunState;
  readonly choices: readonly RunChoice[];
  readonly cursor: number;
  readonly onHover: (index: number) => void;
  readonly onPick: (index: number) => void;
};

type NodeCellProps = {
  readonly node: RunNode;
  readonly state: 'walked' | 'here' | 'open' | 'closed';
  readonly choiceIndex: number;
  readonly selected: boolean;
  readonly onHover: () => void;
  readonly onPick: () => void;
};

function NodeCell({ node, state, choiceIndex, selected, onHover, onPick }: NodeCellProps) {
  const def = nodeOf(node.kind);
  const label = `${def.symbol} ${def.name}`;

  if (state !== 'open') {
    return (
      <span className="ledger__node" data-state={state} aria-label={label}>
        <span className="ledger__symbol" aria-hidden="true">
          {def.symbol}
        </span>
        <span className="ledger__name">{def.name}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className="ledger__node ledger__node--open"
      data-state="open"
      data-selected={selected || undefined}
      onMouseEnter={onHover}
      onFocus={onHover}
      onClick={onPick}
      aria-label={label}
      aria-keyshortcuts={choiceIndex < 9 ? String(choiceIndex + 1) : undefined}
    >
      <span className="ledger__symbol" aria-hidden="true">
        {def.symbol}
      </span>
      <span className="ledger__name">{def.name}</span>
    </button>
  );
}

export function MapScreen({ run, choices, cursor, onHover, onPick }: MapScreenProps) {
  const duration = useDuration(0.25);
  const horizon = visibleLayers(run);
  const here = run.at === null ? -1 : (run.map.nodes[run.at]?.layer ?? -1);
  const openIds = new Set(choices.map((c) => c.nodeId));

  return (
    <motion.section
      className="ledger"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration }}
      aria-label={strings.run.map}
    >
      <h2 className="ledger__heading">{strings.run.map}</h2>
      <p className="ledger__depth">{strings.run.depth(Math.max(1, here + 1), run.map.layers.length)}</p>

      <ol className="ledger__layers">
        {run.map.layers.map((ids, layer) => {
          const readable = layer <= horizon;
          return (
            <li className="ledger__layer" key={layer} data-readable={readable || undefined}>
              <span className="ledger__index" aria-hidden="true">
                {String(layer + 1).padStart(2, '0')}
              </span>
              <div className="ledger__row">
                {ids.map((id) => {
                  const node = run.map.nodes[id];
                  if (!node) return null;
                  const walked = run.visited.includes(id);
                  const isHere = run.at === id;
                  const open = openIds.has(id);
                  const index = choices.findIndex((c) => c.nodeId === id);
                  const state = isHere ? 'here' : walked ? 'walked' : open ? 'open' : 'closed';

                  if (!readable && !open && !walked && !isHere) {
                    return <span className="ledger__unread" key={id} aria-label={strings.run.unknown} />;
                  }

                  return (
                    <NodeCell
                      key={id}
                      node={node}
                      state={state}
                      choiceIndex={index}
                      selected={index >= 0 && index === cursor}
                      onHover={() => {
                        if (index >= 0) onHover(index);
                      }}
                      onPick={() => {
                        if (index >= 0) onPick(index);
                      }}
                    />
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>
    </motion.section>
  );
}
