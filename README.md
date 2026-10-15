# Shaghal (شغّال)

[![CI](https://github.com/unblocksyria/shaghal-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/unblocksyria/shaghal-extension/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/unblocksyria/shaghal-extension/graph/badge.svg)](https://codecov.io/gh/unblocksyria/shaghal-extension)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A browser extension from [Unblock Syria](https://unblocksyria.com) that shows
whether the site you're on works from Syria, and lets you help keep that record
accurate.

**[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/shaghal/epmjhaoobmgfclbkelhkiakijjocjgfm)**
· **[Install from Firefox Add-ons](https://addons.mozilla.org/firefox/addon/shaghal/)**
· [Learn more](https://unblocksyria.com/shaghal)

## Features

Shaghal opens in the browser's side panel, next to the page, from its toolbar
button or with Ctrl+Shift+U (Cmd+Shift+U on macOS). You can change the shortcut at
`chrome://extensions/shortcuts`, or in Firefox under **Manage Extension Shortcuts**
on the add-ons page. From the panel you can:

- **Vote** for services you need.
- **Report what works**, with a note or screenshot for each part you tested.
- **Suggest a correction** to a service's details.
- **Report a service** that isn't tracked yet.

Reports and corrections go to Unblock Syria's review queue; they don't change
public listings directly. The panel is available in English and Arabic.

## Privacy

- **Page addresses.** While the panel is open, it sends the active page's URL,
  including path and query, to the Unblock Syria API to find the matching service.
  Credentials and fragments are removed, and browser and local pages are skipped.
  Close the panel to stop lookups.
- **Screenshots.** Taken only when you ask, kept in memory, and uploaded only when
  you press Send. While a form is unfinished they are also held in the browser's
  memory only session storage, so closing the panel does not lose them; sending
  the form, discarding the draft or restarting the browser clears them. The
  editor crops and covers details with solid black boxes; the upload is a new
  image without the removed pixels. Anyone with a submitted screenshot's address
  can open it, so remove personal details first.
- **Email.** Optional. It's saved in the browser for later forms and can be
  changed or cleared in Settings.
- **Other requests.** Report forms check your connection's country to warn when
  you appear to be outside Syria; the warning never blocks a report. Sends are
  verified with Cloudflare Turnstile.

See Unblock Syria's [privacy policy](https://unblocksyria.com/privacy) and, for the
details, [ARCHITECTURE.md](ARCHITECTURE.md).

## Development

You need Node.js 24 and npm, and Chrome 123 or later or Firefox 140 or later.
Other Chromium browsers with the side panel API should work but aren't tested.

```bash
cd extension
npm ci
npm run dev
```

Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**,
and select `extension/.output/chrome-mv3-dev`. Click Shaghal's toolbar button to
open the panel.

For Firefox, `npm run dev:firefox` builds to `extension/.output/firefox-mv3-dev`
and opens a Firefox with it loaded. To use your own Firefox instead, open
`about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and
select that folder's `manifest.json`.

### API

Development builds expect the Unblock Syria API at `http://localhost:8787`, which
isn't part of this repository. Without it the panel shows a connection error. To
use the live service instead:

```bash
WXT_API_BASE=https://api.unblocksyria.com \
WXT_SITE_BASE=https://unblocksyria.com \
WXT_VERIFY_BASE=https://verify.unblocksyria.com \
npm run dev
```

**Votes and submissions from this build are real**, so browse freely but don't
send test submissions. The tests need neither API; they use a fake one.

### Mock API

You don't need the private API repo to click through your change. From `extension/`:

```bash
npm run dev:mock
```

That starts a zero dependency mock API on `http://localhost:8787` and the
development build in one command; Ctrl+C stops both. The panel already points at
`localhost:8787` in dev builds, and a local API skips Turnstile verification, so
nothing real is ever sent: every answer is a fake from the same fixtures the
tests use. Repeat a form send freely; to see the receipt check end to end,
change the receipt key to end in `-completed` (sent), `-unconfirmed` (still
pending), or anything else (expired). Votes keep a count in memory that moves
when you vote and unvote, and resets when the mock restarts.

The mock picks the card state from the page you open in the test tab:

| Open a page on           | Card you get                               |
| ------------------------ | ------------------------------------------ |
| `netflix.com` (and subs) | One matched service, usable, vote count 13 |
| `google.com` (and subs)  | A pick list of tracked services            |
| anything else            | Not tracked, with the suggest form         |

So try your change: open `netflix.com` for the matched card and the vote and
report forms, `google.com` for the pick list and correction flow, and any other
site for the not tracked state. The service you pick keeps its own name and
identity in the forms; the rest of its record comes from one shared placeholder
fixture. Unknown routes answer 404 and malformed bodies answer 400, so the
error paths behave like the real API.

### Tests

Run from `extension/`:

```bash
npm run check                    # lint, format check, types, unit tests, builds, add-on lint
npx playwright install chromium  # once
npm run test:e2e                 # browser tests against the last build
```

`npm test` runs the unit tests alone, `npm run test:coverage` adds a coverage
report in `extension/coverage/`, and `npm run format` formats the code and the
Markdown files at the root. CI runs `check` with coverage, uploads it to Codecov,
and runs the browser tests.

### Builds

`npm run build` writes a production build to `extension/.output/chrome-mv3`, and
`npm run zip` packages it for the Chrome Web Store. `npm run build:firefox` and
`npm run zip:firefox` do the same for Firefox in `extension/.output/firefox-mv3`,
and `npm run lint:firefox` runs Mozilla's add-on linter on that build. Production
builds use the live service. `WXT_API_BASE`, `WXT_SITE_BASE` and
`WXT_VERIFY_BASE` override the hosts at build time.

The manifest's public key gives unpacked Chrome builds the store's extension ID,
`epmjhaoobmgfclbkelhkiakijjocjgfm`; the Firefox build carries the add-on ID
`shaghal@unblocksyria.com` instead. In a development build you can open the panel
as a tab for a given page:
`chrome-extension://epmjhaoobmgfclbkelhkiakijjocjgfm/sidepanel.html?preview=<encoded-url>`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), and [ARCHITECTURE.md](ARCHITECTURE.md) for
how the extension works. Report security problems privately, as described in
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Unblock Syria
