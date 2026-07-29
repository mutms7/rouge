/**
 * platform/ is the seam between the game and whatever it is running inside.
 *
 * Saves, achievements, telemetry. One interface, two implementations: web (localStorage and
 * no-ops) and Tauri (files in the app data directory where Steam Cloud points, plus
 * Steamworks through Tauri commands). Nothing above this layer knows which one it got, which
 * is what makes phase 8 a wiring job instead of a rewrite.
 *
 * The choice is made once, here, by asking whether the Tauri bridge is on the window rather
 * than by a build flag, so the same bundle runs in a browser and in the shell.
 */
import type { Platform } from './types';
import { webPlatform } from './web';

export * from './types';
export { webPlatform } from './web';

let current: Platform = webPlatform;

/** Phase 8 calls this once at boot with the Tauri implementation. */
export function usePlatform(platform: Platform): void {
  current = platform;
}

export function platform(): Platform {
  return current;
}
