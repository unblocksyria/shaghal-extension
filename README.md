# شغّال؟ — Unblock Syria Tester Extension

Internal Chrome extension for **unblocksyria.com** testers. It helps testers check whether
websites and services work from Syria and report their findings to the catalog, capturing
network logs as evidence of what works and what doesn't.

## What it does

- **Report a service** that is blocking Syria (new/pending entries), with automatic page
  metadata pre-fill
- **Test what works from Syria** per part (core use, landing page, sign-up, payment, …)
  and submit functionality reports for review
- **Service-details corrections** (URL, description, categories, support contacts)
- **Network diagnostics**: while recording, it captures redacted request logs
  (URL/method/status/error only — no headers, bodies, or cookies), checks DNS consistency
  against public DoH, warns when a VPN/proxy or non-Syria exit is detected, and scans loaded
  pages for block messages (e.g. sanctions walls served with HTTP 200)
- **Per-part suggestions**: a local classifier turns the capture into one-click "working /
  failing" suggestions per part (landing page and core use are judged independently).
  Suggestions are never auto-submitted — the tester always confirms.
- Everything is reviewed by admins before publishing; screenshots and raw logs stay local
  until the tester submits.

## Tech stack

- [WXT](https://wxt.dev) (Vite-based extension framework), Manifest V3 (Chrome) / MV2 (Firefox)
- React 19 + TypeScript (strict)
- UI: side panel only, dark theme with CSS variables (`src/styles/theme.css`)

## Getting started

```bash
cd extension
npm install
npm run dev        # load the unpacked build from .output/chrome-mv3 (Chrome)
```

For Firefox: `npm run dev:firefox`, then load `.output/firefox-mv2` via `about:debugging`.

| Command | Purpose |
| --- | --- |
| `npm run build` / `npm run zip` | Chrome build / distributable zip |
| `npm run build:firefox` / `npm run zip:firefox` | Firefox build / zip |
| `npx tsc --noEmit` | Typecheck |
| `npm run verify-classifier` | Run the verdict-logic fixtures (14 assertions) |

## Team workflow

- `main` must always build (typecheck + builds pass)
- Short-lived branches: `feat/<area>-<slug>`, `fix/<area>-<slug>`, `chore/<what>`, `docs/<topic>`
- Conventional Commits with module scope: `feat(corrections): …`, `fix(api): …`
- One logical change per commit; verify before merging to `main`
- Tag tester handouts: `git tag v0.2.0 && git push --tags`

## Privacy principles

- Network capture is observational only: URL, method, status code, error string, resource
  type, IP — no headers, bodies, or cookies; sensitive query params are redacted
- Block-page scanning stores only the matched phrase, page title, and URL — never page content
- Screenshots and raw logs stay on the tester's machine until submitted
- Never commit tokens, `.env` files, or build outputs (see `.gitignore`)
