export const APP_VERSION = '0.1.4';

export interface ChangelogEntry {
  hash: string;
  date: string;
  title: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    hash: 'unreleased',
    date: '2026-06-19',
    title: 'Separated spouse retirement age and wages, and clarified Basic vs Advanced account and expense modeling.',
  },
  {
    hash: 'db974cd',
    date: '2026-06-19',
    title: 'Softened Roth Optimizer wording, added educational-model disclosures, and surfaced modeled tax years.',
  },
  {
    hash: 'a001efb',
    date: '2026-06-17',
    title: 'Fixed Per-year comparison mode so it shows the per-year Roth conversion scenario instead of the lowest-tax scenario.',
  },
  {
    hash: 'd34e671',
    date: '2026-06-17',
    title: 'Defaulted unset spouse age consistently across projections, Monte Carlo runs, and spouse Social Security modeling.',
  },
  {
    hash: '689eea9',
    date: '2026-06-13',
    title: 'Added the active plan name to the top bar, including selected sample plans.',
  },
  {
    hash: '81ac0af',
    date: '2026-06-13',
    title: 'Persisted the Roth Optimizer mode with applied schedules and re-applied schedules when the mode changes.',
  },
  {
    hash: 'd00190f',
    date: '2026-06-13',
    title: 'Unified sliders for smoother touch input and added LAN dev testing URLs.',
  },
  {
    hash: '551ffb9',
    date: '2026-06-13',
    title: 'Improved export button states, state tax controls, and iPad slider behavior.',
  },
  {
    hash: '2a4da9a',
    date: '2026-06-12',
    title: 'Modeled pension ownership, end ages, and survivor benefits.',
  },
  {
    hash: 'a2e9fff',
    date: '2026-06-11',
    title: 'Added a Roth Optimizer link from the Roth Conversions setup page.',
  },
  {
    hash: '0c4719e',
    date: '2026-06-11',
    title: 'Cleaned up the Roth Optimizer layout and collapsible analysis sections.',
  },
  {
    hash: '4fd1bfe',
    date: '2026-06-11',
    title: 'Improved keyboard number entry for range-style controls.',
  },
  {
    hash: 'a121d53',
    date: '2026-06-11',
    title: 'Added state tax presets with local tax adjustments.',
  },
  {
    hash: 'fd8c7cb',
    date: '2026-06-11',
    title: 'Exposed one-time expenses in Basic expenses.',
  },
  {
    hash: '36ee3e8',
    date: '2026-06-11',
    title: 'Added expense change schedules for future spending shifts.',
  },
  {
    hash: '7e3d950',
    date: '2026-06-11',
    title: 'Added account growth assumptions by account type.',
  },
];
