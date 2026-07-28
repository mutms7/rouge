/**
 * platform/ is the seam between the game and whatever it is running inside.
 *
 * Saves, achievements, telemetry. One interface, two implementations: web
 * (localStorage and no-ops) and Tauri (files in the app data directory where Steam
 * Cloud points, plus Steamworks through Tauri commands). Nothing above this layer
 * knows which one it got, which is what makes phase 8 a wiring job instead of a
 * rewrite.
 *
 * Phase 4 needs the save interface. Nothing to export yet.
 */
export {};
