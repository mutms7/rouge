/**
 * Keyboard containment for a modal overlay.
 *
 * Every dialog in this game (`Help`, `Sheet`, `Outcome`, `RunOver`, `Settings`, `Credits`,
 * the tutorial) sits on a `position: fixed` panel over the screen it covers. Visually that is
 * a modal. To the keyboard it was not one: nothing stopped Tab from walking off the panel and
 * into a button hidden behind it, which is a keyboard trap in the technical sense (WCAG
 * 2.1.2) even though the failure reads as "focus vanished" rather than "focus is stuck".
 *
 * This closes the loop: Tab and Shift+Tab cycle between the first and last focusable element
 * inside the panel, and closing the dialog returns focus to whatever had it before the panel
 * opened. It does not touch Escape or any other key. Every call site already owns its own
 * key handling, and duplicating that here would be the second place a dialog could disagree
 * with itself about how to close.
 */
import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/** Trap Tab inside `ref` while `active`, and hand focus back to its prior owner on close. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const panel = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab' || !panel) return;
      const focusable = focusableIn(panel);
      if (focusable.length === 0) return;

      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      const current = document.activeElement;

      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      } else if (!panel.contains(current)) {
        // Focus drifted outside the panel (a stale ref, a click on the backdrop). Pull it
        // back in rather than leaving it wherever it landed.
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [ref, active]);
}
