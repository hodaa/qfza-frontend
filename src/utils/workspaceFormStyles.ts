const BAR_BASE = 'w-full bg-white';

/** The keyword search shell. */
export const WORKSPACE_BAR = `${BAR_BASE} rounded-xl p-2 shadow-sm`;

/** The loaded video's URL control: present, but quieter than the keyword search. */
export const WORKSPACE_COMPACT_BAR = `${BAR_BASE} rounded-xl border border-slate-200/70 p-2`;

/** The home-page entry bar, sized and lit to read as the primary action. */
export const WORKSPACE_HERO_BAR = `${BAR_BASE} rounded-2xl border-2 border-action/20 p-2.5 shadow-xl shadow-action/10 ring-4 ring-action/5 sm:p-3`;

/** One bar's contents: label, field, then submit; stacked on narrow screens. */
export const WORKSPACE_ROW = 'flex flex-col gap-2 sm:flex-row sm:items-center';

/** The loaded-video bar stays on one line: it is a secondary control. */
export const WORKSPACE_COMPACT_ROW = 'flex items-center gap-2';

const INPUT_BASE =
  'w-full rounded-lg border text-slate-900 placeholder:text-slate-500 transition-all duration-200 focus:bg-white focus:outline-none focus:ring-2';

/** The compact field used once a video is loaded. */
export const WORKSPACE_INPUT = `${INPUT_BASE} min-h-11 px-3.5 py-2 ps-10 text-base`;

/** The home-page field: taller type and target for the first thing a visitor does. */
export const WORKSPACE_HERO_INPUT = `${INPUT_BASE} min-h-14 px-4 py-2.5 ps-10 text-base sm:text-lg`;

const SUBMIT_LAYOUT =
  'inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg font-bold text-white transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 sm:w-auto';

const SUBMIT_BASE = `${SUBMIT_LAYOUT} bg-action hover:bg-action-hover focus-visible:ring-action`;

const SUBMIT_ACCENT = `${SUBMIT_LAYOUT} bg-accent-strong hover:bg-accent-deep focus-visible:ring-accent-strong`;

/** The keyword search is the workspace's primary action, so it carries the accent. */
export const WORKSPACE_SUBMIT = `${SUBMIT_ACCENT} min-h-11 px-5 text-sm shadow-sm`;

/** The loaded video's change action, using the homepage's navy CTA fill. */
export const WORKSPACE_COMPACT_SUBMIT =
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-action px-3 text-sm font-bold text-white shadow-sm transition-colors duration-200 hover:bg-action-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4';

/** The home-page action, matching the hero field's weight. */
export const WORKSPACE_HERO_SUBMIT = `${SUBMIT_BASE} min-h-14 px-7 text-base shadow-lg shadow-action/20`;

/** A secondary control living inside the field's trailing rail. */
export const WORKSPACE_RAIL_BUTTON =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors duration-200 hover:bg-slate-200/70 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-40';

/** The hero field's trailing rail, scaled to its taller input. */
export const WORKSPACE_HERO_RAIL_BUTTON =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors duration-200 hover:bg-slate-200/70 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-40';
