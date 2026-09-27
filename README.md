# شغّال (Shaghal): Unblock Syria for your browser

See whether the site you're visiting works from Syria, and help keep the record
accurate. Shaghal opens beside your page and lets you:

- **Vote** for services you need.
- **Report what works** with a note or screenshot for each part you tested.
- **Suggest a correction** to a service's details.
- **Report a service** that isn't tracked yet.

Reports and corrections go to Unblock Syria's review queues. They do not change
public listings automatically. The panel interface is in English; the extension's
name and store description also have Arabic translations.

## Try it locally

Use Node.js 24 and npm. The extension targets Chrome 123+ and Chromium browsers
with the side panel API; automated browser tests run in Chromium.

```bash
cd extension
npm ci
npm run dev
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**,
and select `extension/.output/chrome-mv3-dev`. Click Shaghal's toolbar icon to open
the panel.

Development uses an API at `http://localhost:8787`. Start the Unblock Syria API
separately with `ENVIRONMENT=development` and no Turnstile secret for local writes.
This repository does not include that server. Without it, the panel shows a
connection error; the automated tests still work with their own fake API.

For a production build, run `npm run build` and load `extension/.output/chrome-mv3`.
**Production builds send votes and forms to the live service.** `npm run zip`
creates the distribution archive.

## Screenshots and privacy

A screenshot captures the visible page. It opens in an editor where you can crop
it and cover private details with solid black boxes. Click a thumbnail to edit it
again. Review every screenshot before sending: cancelling an edit keeps the
previous image, including the original capture if you have not saved any edits.

- While the panel is open, lookups send the active page's URL to the API, including
  its **path and query parameters**. Credentials and fragments are removed. This
  preserves matching for services that share a domain, but paths and queries can
  still contain private information. Close the panel when you do not want lookups.
- Browser pages, IP addresses, single-label hosts and common local domains are
  excluded. This is not a complete detector for private sites on public domains.
- Screenshots are held in memory and uploaded only after you press Send. Uploads
  require verification, followed by separate verification for the form. A failed
  or cancelled send can leave an unclaimed upload. The API expires abandoned
  uploads and hides unclaimed files once upload protection is enforced. During
  the compatibility rollout, unclaimed URLs remain readable. Submitted evidence
  remains accessible to anyone with its address; remove personal details first.
- Edited images are flattened into new JPEGs; cropped-out pixels and pixels fully
  covered by black boxes are absent from the upload. Originals remain in memory
  while the draft is open. Cover the entire sensitive area, including its edges.
- Email is optional. A successful submission remembers the email locally for
  future forms; Settings can change or clear it. Leaving a form blank sends it
  anonymously without erasing the saved address. Back asks before discarding an
  edited draft. Keep the panel open: closing it can still lose unsent text and
  screenshots.
- Report forms check your connection's country on the live API host, even in
  development. Verification uses Cloudflare Turnstile through our verification
  page. Service logos may load from their supplied image hosts.

The report forms warn when the connection appears to be outside Syria. This is a
hint, not proof that a VPN is on or off, and it does not block a report.

If a send is not confirmed, keep the original details and try again to check its
receipt. The panel does not automatically repeat writes. Receipt protection needs
server receipt support on submissions, corrections and functionality reports.
The editor's **Precise crop and redaction** controls also work with a keyboard.

## Development and checks

```bash
npm test                    # unit and component tests; network is stubbed
npm run check               # lint, formatting, TypeScript, tests, production build
npx playwright install chromium
npm run test:e2e             # built extension in Chromium; HTTP(S) requests stubbed
npm run format              # format extension files
```

Run `npm run build` before browser tests. CI runs `check`'s stages and a separate
browser test job; `npm run check` alone does not run the browser tests.

Build-time overrides are `WXT_API_BASE`, `WXT_SITE_BASE` and `WXT_VERIFY_BASE`.
Defaults and verification details are in [ARCHITECTURE.md](ARCHITECTURE.md).
Overriding development to use the live API makes writes real, too.

The public manifest key fixes unpacked builds to the store ID
`epmjhaoobmgfclbkelhkiakijjocjgfm`. Development builds support a panel preview:
`chrome-extension://epmjhaoobmgfclbkelhkiakijjocjgfm/sidepanel.html?preview=<encoded-url>`.
The preview captures its own tab, not the page named in the parameter.

Use focused branches and scoped Conventional Commits. Keep credentials, `.env`
files and build output out of Git. See [ARCHITECTURE.md](ARCHITECTURE.md) for the
code map and client/server boundaries.
