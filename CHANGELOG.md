# Changelog

### 0.3.9 (2026-08-31)

#### Bug Fixes

- deps: approve esbuild build script in pnpm-workspace.yaml (ec041ff)

### v0.3.8 (2026-08-31)

#### Bug Fixes

- deps: add pnpm-workspace.yaml for build script approvals (ee479c8)

### v0.3.7 (2026-08-31)

#### Maintenance

- deps: remove pnpm onlyBuiltDependencies configuration (cde238b)

### v0.3.6 (2026-08-31)

#### Continuous Integration

- github: update node version to 26 in publish workflow (5a499e8)

### v0.3.5 (2026-08-31)

#### Maintenance

- deps: move pnpm configuration to package.json (c3d1873)

### v0.3.4 (2026-08-31)

#### Build System

- npm: configure only-built-dependencies for security (2cd2712)

### v0.3.3 (2026-08-31)

#### Maintenance

- deps: remove pnpm dependency configuration (63a66bf)

### v0.3.2 (2026-08-31)

#### Continuous Integration

- github: upgrade node version to 22 (aeeec26)

### v0.3.1 (2026-08-31)

#### Continuous Integration

- github: update pnpm action version to 11 (b117544)

## v0.3.0 (2026-08-31)

#### Features

- ui: enhance modal styling and add sync debouncing (9e3c74a)
- timer: implement timer record editing and deletion (3a21274)
- sync: implement multi-device backend sync (7a9d244)
- data: expand adjective and noun lists for random name generation (72fe8b3)
- timer: add active time tracking to daily report (54da347)

#### Bug Fixes

- tag: prevent resume when timer is inactive (a6f8ba0)

#### Continuous Integration

- github: use workflow variables for deployment configuration (eb1c474)

## v0.2.0 (2026-08-28)

#### Features

- settings: add settings modal component (eb5fe30)

#### Refactor

- clock: move time tracking out of Pinia store (138edd9)
- helpers: improve timer range overlap and reporting logic (535380e)

### v0.1.1 (2026-08-28)

#### Bug Fixes

- build: resolve typescript and workspace compile crashes (4037314)

## v0.1.0 (2026-08-28)

#### Features

- style: add custom fonts and update typography (c5d4b73)

#### Maintenance

- deps: configure pnpm workspace dependencies (7658008)

### Misc
- Keep deleted tags in their original position in the report (8a09352)
- Stop open timers when their tag is deleted (e41e60e)
- Keep a deleted tag's own row in the report, not just its surviving ancestor's (d6ceaf5)

### v0.0.11 (2026-08-27)

#### Documentation

- readme: remove outdated IDE setup instructions (fcfe549)

#### Build System

- deps: update project dependencies (56cfd5c)

#### Maintenance

- config: add foonver.toml configuration file (719ad4d)
- vscode: remove extensions configuration (b42411b)

### Misc
- Give Resume its own icon instead of reusing plain Play (3192502)
- Show pause/resume on tags that only have sub-timers running (1dcf9ba)
- Include sub-timer-only tags in the report, in tree order; fix a sibling-name prefix bug (f893a1d)
- Give report list entries a breadcrumb name display (dbb5ed0)
- Replace running-timers panel with a daily report and day navigation (892818a)
- Fix Resume not appearing when a pause is inherited from a parent (3cea872)
- Detect redundant duplicate timer records on startup (c354cf1)
- Give the add-tag/quick-start row breathing room (16763b1)
- Rework nested tag card layout: more room, title-first, bigger time (74175cc)
- Redesign quick-start icon: bare arrow, corner badge (ae6477d)
- Add one-click random tag + start button (bef924c)
- Write a proper README (37c0f05)
- Add resume and hide pause controls when nothing own is running (ef1326f)
- Make timer status visually distinct (ebac3bf)
- Fix Edit Tag creating a duplicate instead of updating (890db4d)
- Fixed scripts (b1e3830)
- Testing scripts (0df7673)

### v0.0.10 (2024-03-25)

### Misc
- Some styling (f6a0fb1)
- Combined daily timers, needs styling. (b18f846)
- Timer positive optional (2bbf0d7)
- Added day <-> date calculation functions. (bfbfd6e)

### v0.0.9 (2024-03-19)

### Misc
- Hopefully working calculation. (33a6a98)
- Almost working, but completely wrong time calc. (6477766)

### v0.0.8 (2024-03-18)

### Misc
- Added pause button (bcb4b57)
- Change to manifest file. (b5ef09b)
- Styling cleanup (c9ebee3)

### v0.0.7 (2024-03-17)

### Misc
- Formatting (b6da650)
- Styling and some conditional logic (a2f4986)

### v0.0.6 (2024-03-14)

### Misc
- PWA (577225a)

### v0.0.5 (2024-03-11)

### Misc
- Deploy script (08bcf3c)

### v0.0.4 (2024-03-11)

### Misc
- Updated lock file (04fd420)

### v0.0.3 (2024-03-11)

### Misc
- Formatting (b974d1a)
- Basic timer logic. (b76733e)
- TimeDisplay component (e1c5d28)
- Basic timer output (1479f12)
- Added manifest, style tweaks (9762b1e)
- Working linting (3104a45)

### v0.0.2 (2024-02-26)

### Misc
- Test github action (99bb306)
- Basic Tag management working. (d6c1740)
- Basic tag display (51fcd16)
- Initial commit (07d4d71)

