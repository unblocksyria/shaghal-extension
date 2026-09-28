# Shaghal (شغّال)

[![CI](https://github.com/unblocksyria/shaghal-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/unblocksyria/shaghal-extension/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A browser extension from [Unblock Syria](https://unblocksyria.com) that shows
whether the site you're on works from Syria, and lets you help keep that record
accurate.

**[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/shaghal/epmjhaoobmgfclbkelhkiakijjocjgfm)**
· [Learn more](https://unblocksyria.com/shaghal)

## Features

Shaghal opens in the browser's side panel, next to the page. From there you can:

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
  you press Send. The editor crops and covers details with solid black boxes; the
  upload is a new image without the removed pixels. Anyone with a submitted
  screenshot's address can open it, so remove personal details first.
- **Email.** Optional. It's saved in the browser for later forms and can be
  changed or cleared in Settings.
- **Other requests.** Report forms check your connection's country to warn when
  you appear to be outside Syria; the warning never blocks a report. Sends are
  verified with Cloudflare Turnstile.

See Unblock Syria's [privacy policy](https://unblocksyria.com/privacy) and, for the
details, [ARCHITECTURE.md](ARCHITECTURE.md).

## Development

You need Node.js 24 and npm, and Chrome 123 or later. Other Chromium browsers
with the side panel API should work but aren't tested.

```bash
cd extension
npm ci
npm run dev
```

Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**,
and select `extension/.output/chrome-mv3-dev`. Click Shaghal's toolbar button to
open the panel.

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

### Tests

Run from `extension/`:

```bash
npm run check                    # lint, format check, types, unit tests, build
npx playwright install chromium  # once
npm run test:e2e                 # browser tests against the last build
```

`npm test` runs the unit tests alone, and `npm run format` formats the code. CI
runs both `check` and the browser tests.

### Builds

`npm run build` writes a production build to `extension/.output/chrome-mv3`, and
`npm run zip` packages it for the store. Production builds use the live service.
`WXT_API_BASE`, `WXT_SITE_BASE` and `WXT_VERIFY_BASE` override the hosts at build
time.

The manifest's public key gives unpacked builds the store's extension ID,
`epmjhaoobmgfclbkelhkiakijjocjgfm`. In a development build you can open the panel
as a tab for a given page:
`chrome-extension://epmjhaoobmgfclbkelhkiakijjocjgfm/sidepanel.html?preview=<encoded-url>`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), and [ARCHITECTURE.md](ARCHITECTURE.md) for
how the extension works. Report security problems privately, as described in
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Unblock Syria
