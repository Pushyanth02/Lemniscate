# Contributing to Lemniscate

Thanks for reading the room before moving the furniture.

## Setup

```bash
git clone https://github.com/Pushyanth02/Lemniscate.git
cd Lemniscate
bun install          # Bun >= 1.1 — see README Quick Start
bun run dev          # http://localhost:3000
```

VS Code users get a prompt for the recommended extensions and an F5 debug
config on first open (see README → Development Environment).

## Ground rules

- **Local-first is the architecture.** No server, no API routes, no Prisma —
  persistence is IndexedDB, AI calls go direct browser → provider (BYOK). If
  a change seems to need a backend, it changes the product's premise: raise an
  issue first.
- **One user-visible route (`/`).** The app is an SPA view-switcher; new
  screens are new views under `src/views/`, loaded through `lazyView`, never
  new routes.
- **Honesty is a feature.** Offline results state their reason, interpretations
  are labelled as interpretations, and empty states stay empty — never
  fabricate data to fill a UI.

## Before you push

CI (`.github/workflows/ci.yml`) runs all of these on every push and PR — run
them locally first:

```bash
bun run lint         # ESLint — 0 problems
bun run typecheck    # tsc --noEmit — 0 errors
bun test             # bun:test suite
bun run build        # static export, verified to emit HTML
```

For changes touching reader / annotation / import / backup flows, also run the
browser journey — see “Deployment → End-to-end verification” in the README.

## Pull requests

Open a PR against `main` using the template in
`.github/pull_request_template.md`. Keep diffs focused: one concern per PR.

## Reporting bugs

Use the issue templates in `.github/ISSUE_TEMPLATE/`. Questions go to
Discussions, not the issue tracker.
