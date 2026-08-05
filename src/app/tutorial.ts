/**
 * Whether the player has already seen the Tally walkthrough.
 *
 * One flag, not a settings field: it is progress, not a preference, and it has exactly one
 * writer (dismissing the walkthrough) and one reader (should the first fight show it).
 * Never throws, same shape as everything else that touches `localStorage` in this app.
 */
const STORAGE_KEY = 'rouge:tutorial:v1';

export function hasSeenTutorial(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTutorialSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // No storage, no memory of it. The walkthrough shows again next time, which is a much
    // smaller problem than a game that cannot boot.
  }
}
