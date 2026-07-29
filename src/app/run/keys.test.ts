import { describe, expect, it } from 'vitest';
import { runIntentForKey } from './keys';

const room = { choices: 4, overlay: false };
const covered = { choices: 4, overlay: true };

describe('keyboard play above combat', () => {
  it('walks the choices with either axis', () => {
    // Both axes, because the map reads vertically and a shelf reads horizontally, and the
    // player should not have to know which one they are looking at.
    expect(runIntentForKey('ArrowLeft', room)).toEqual({ k: 'choice_move', by: -1 });
    expect(runIntentForKey('ArrowUp', room)).toEqual({ k: 'choice_move', by: -1 });
    expect(runIntentForKey('ArrowRight', room)).toEqual({ k: 'choice_move', by: 1 });
    expect(runIntentForKey('ArrowDown', room)).toEqual({ k: 'choice_move', by: 1 });
  });

  it('jumps by number, within the list', () => {
    expect(runIntentForKey('1', room)).toEqual({ k: 'choice', to: 0 });
    expect(runIntentForKey('4', room)).toEqual({ k: 'choice', to: 3 });
    expect(runIntentForKey('5', room)).toBeNull();
  });

  it('takes a choice on enter or space', () => {
    expect(runIntentForKey('Enter', room)).toEqual({ k: 'commit' });
    expect(runIntentForKey(' ', room)).toEqual({ k: 'commit' });
  });

  it('always answers the sheet, the legend and escape', () => {
    for (const context of [room, covered]) {
      expect(runIntentForKey('s', context)).toEqual({ k: 'toggle_sheet' });
      expect(runIntentForKey('?', context)).toEqual({ k: 'toggle_help' });
      expect(runIntentForKey('Escape', context)).toEqual({ k: 'cancel' });
    }
  });

  it('goes quiet under an overlay, so nothing commits behind a dialog', () => {
    expect(runIntentForKey('Enter', covered)).toBeNull();
    expect(runIntentForKey('ArrowRight', covered)).toBeNull();
    expect(runIntentForKey('2', covered)).toBeNull();
  });

  it('takes either case, and leaves everything else to the browser', () => {
    expect(runIntentForKey('S', room)).toEqual({ k: 'toggle_sheet' });
    expect(runIntentForKey('Tab', room)).toBeNull();
    expect(runIntentForKey('q', room)).toBeNull();
  });

  it('does nothing with the arrows when there is nothing to walk', () => {
    // Movement is still an intent; the store is what clamps an empty list. Keeping the
    // mapping total means the only place that knows about list length is the store.
    expect(runIntentForKey('1', { choices: 0, overlay: false })).toBeNull();
  });
});
