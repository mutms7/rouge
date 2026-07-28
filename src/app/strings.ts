/**
 * Every user-facing string in the game, in one place, from day one.
 *
 * Not an i18n library, just the single file that makes one possible later. No bare
 * text in components. Ever.
 */
export const strings = {
  brand: {
    title: 'ROUGE',
    tagline: 'You are in the red.',
  },
  pipeline: {
    heading: 'Art pipeline',
    blurb:
      'Placeholders are procedural and keyed to content ID. Drop a PNG at the path under each one, run the manifest, and it appears here with no code change.',
    manifestEmpty: 'Manifest loaded. No art files yet, so everything below is a placeholder.',
    manifestCount: (files: number, kinds: number) =>
      `Manifest loaded: ${String(files)} file${files === 1 ? '' : 's'} across ${String(kinds)} kind${kinds === 1 ? '' : 's'}.`,
    manifestMissing: 'No manifest found. Run `npm run art:manifest`.',
  },
} as const;
