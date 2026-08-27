# Foonlys Hierarchical Timer

A hierarchical time tracker with a very low barrier of entry. Instead of picking a
single project from a dropdown, you build a tree of tags — projects, tasks,
sub-tasks — and track time against any node in it. Time rolls up: the total shown
on a tag includes everything running underneath it.

It's a local-first Vue 3 PWA — no backend, no accounts. Everything lives in the
browser's `localStorage` and it works offline once loaded.

## How it works

**Tags** are the tree you organize work under (e.g. `Work // ProjectA // Bugfix`).
Each tag can have its own description and any number of sub-tags nested under it.

**Timers** are started and stopped against a tag. A tag's displayed time is the
sum of its own timers plus every timer running under any of its sub-tags.

Each tag/timer can be:

- **Running** — actively accruing time.
- **Paused** — started, but temporarily not counting. Pausing a tag also pauses
  everything nested under it, even if a sub-tag has its own timer running
  independently — so pausing a parent is a quick way to freeze a whole branch
  without stopping each sub-task individually.
- **Sub-timer running** — this tag has no timer of its own active, but a
  sub-tag does, so its rolled-up total is still increasing.
- **Stopped** — nothing active.

These states are shown with a colored dot and a matching card accent (see the
legend at the top of the app), so you can tell at a glance what's actually
accruing time.

A "day" for the purposes of grouping today's timers starts at 4am rather than
midnight, so a late work session doesn't get split across two days.

## Development

Requires [pnpm](https://pnpm.io/).

```sh
pnpm install
pnpm dev       # start the dev server
pnpm build     # type-check and build for production
pnpm preview   # preview the production build locally
pnpm lint      # eslint
pnpm format    # prettier --write
pnpm test      # lint + prettier --check
```

Pushing a `v*` tag runs the CI workflow in `.github/workflows/publish.yml`,
which tests, builds, and deploys `dist/` to the production server.

### Recommended IDE setup

[VS Code](https://code.visualstudio.com/) with
[Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) and the
[TypeScript Vue Plugin](https://marketplace.visualstudio.com/items?itemName=Vue.vscode-typescript-vue-plugin).
Vanilla `tsc` can't type-check `.vue` files, which is why `pnpm build` uses
`vue-tsc` instead — the same plugin gives your editor that awareness too.

## Tech stack

- [Vue 3](https://vuejs.org/) (`<script setup>`) + TypeScript
- [Pinia](https://pinia.vuejs.org/) with
  [`pinia-plugin-persistedstate`](https://prazdevs.github.io/pinia-plugin-persistedstate/)
  for state that survives a page reload
- [Zod](https://zod.dev/) for runtime validation of stored/loaded data
- [Vite](https://vitejs.dev/) with [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/)
  for the offline-capable PWA build
