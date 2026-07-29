import { describe, expect, it } from 'vitest';
import { intentForKey, isFastForwardKey, moveCursor } from './keys';

const playing = { handSize: 5, targeting: false, interactive: true };
const picking = { handSize: 5, targeting: true, interactive: true };
const over = { handSize: 0, targeting: false, interactive: false };

describe('keyboard play', () => {
  it('walks the hand', () => {
    expect(intentForKey('ArrowLeft', playing)).toEqual({ k: 'cursor_move', by: -1 });
    expect(intentForKey('ArrowRight', playing)).toEqual({ k: 'cursor_move', by: 1 });
  });

  it('jumps to a card by number, with the tenth on zero', () => {
    expect(intentForKey('1', playing)).toEqual({ k: 'cursor', to: 0 });
    expect(intentForKey('5', playing)).toEqual({ k: 'cursor', to: 4 });
    expect(intentForKey('0', { ...playing, handSize: 10 })).toEqual({ k: 'cursor', to: 9 });
  });

  it('ignores a number past the end of the hand', () => {
    expect(intentForKey('9', playing)).toBeNull();
    expect(intentForKey('0', playing)).toBeNull();
  });

  it('plays on enter, space, and up', () => {
    for (const key of ['Enter', ' ', 'ArrowUp']) {
      expect(intentForKey(key, playing)).toEqual({ k: 'commit' });
    }
  });

  it('offers the selected Compound discard binding while not targeting', () => {
    expect(intentForKey('d', playing)).toEqual({ k: 'discard' });
    expect(intentForKey('D', picking)).toBeNull();
  });

  it('repurposes left and right while targeting', () => {
    expect(intentForKey('ArrowLeft', picking)).toEqual({ k: 'target_move', by: -1 });
    expect(intentForKey('Enter', picking)).toEqual({ k: 'commit' });
    expect(intentForKey('w', picking)).toBeNull();
  });

  it('always answers escape and the legend', () => {
    expect(intentForKey('Escape', picking)).toEqual({ k: 'cancel' });
    expect(intentForKey('Escape', over)).toEqual({ k: 'cancel' });
    expect(intentForKey('?', over)).toEqual({ k: 'toggle_help' });
  });

  it('goes quiet once the fight is decided, apart from moving on', () => {
    expect(intentForKey('1', over)).toBeNull();
    expect(intentForKey('w', over)).toBeNull();
    for (const key of ['Enter', ' ', 'r']) expect(intentForKey(key, over)).toEqual({ k: 'onward' });
    // R is not a hotkey mid-fight: the run should not move on under your hands.
    expect(intentForKey('r', playing)).toBeNull();
  });

  it('takes either case', () => {
    expect(intentForKey('W', playing)).toEqual({ k: 'wait' });
    expect(isFastForwardKey('F')).toBe(true);
    expect(isFastForwardKey('f')).toBe(true);
    expect(isFastForwardKey('g')).toBe(false);
  });

  it('leaves everything else to the browser', () => {
    expect(intentForKey('Tab', playing)).toBeNull();
    expect(intentForKey('x', playing)).toBeNull();
  });
});

describe('the hand cursor', () => {
  it('wraps both ways', () => {
    expect(moveCursor(0, -1, 5)).toBe(4);
    expect(moveCursor(4, 1, 5)).toBe(0);
    expect(moveCursor(2, 1, 5)).toBe(3);
  });

  it('sits still on an empty hand', () => {
    expect(moveCursor(3, 1, 0)).toBe(0);
  });
});
