# Architecture

Shaghal is a Manifest V3 extension built with WXT, React and TypeScript. Its side
panel follows the active tab, matches it to an Unblock Syria service, and offers
votes and moderated submissions. The extension has no backend or private API key.

## Code map

| Location                                                                      | Responsibility                                                                                                 |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [background.ts](extension/src/entrypoints/background.ts)                      | Makes the toolbar action open the panel.                                                                       |
| [SidePanelApp.tsx](extension/src/entrypoints/sidepanel/SidePanelApp.tsx)      | Chooses the page card, report, correction, new-service form or Settings. Settings preserves the mounted draft. |
| [hooks](extension/src/entrypoints/sidepanel/hooks)                            | Active-tab updates, debounced matching and country checks.                                                     |
| [lib](extension/src/lib)                                                      | API contracts, verification, uploads, screenshot editing, settings and vote hints.                             |
| [FormParts.tsx](extension/src/entrypoints/sidepanel/components/FormParts.tsx) | Shared form controls and screenshot lifecycle.                                                                 |
| [editor](extension/src/entrypoints/editor)                                    | Separate screenshot editor window.                                                                             |
| [ScreenshotEditor.tsx](extension/src/components/editor/ScreenshotEditor.tsx)  | Crop, black boxes, undo/redo and discard confirmation.                                                         |
| [theme.css](extension/src/styles/theme.css)                                   | Shared styles and light/dark tokens.                                                                           |
| [e2e](extension/e2e)                                                          | Browser tests of the production bundle, with external requests stubbed.                                        |

There are no content scripts, injected page scripts, external messaging handlers,
or background polling. Page content cannot invoke votes, uploads or captures
through an extension message API. React renders API text without raw HTML.

## Following the page

`useActiveTab` reads the active tab's URL and title. Out-of-order query results are
ignored. `useServiceMatch` waits 350 ms for navigation to settle, then calls
`POST /services/match`. Navigation cancels the previous lookup; cancellation does
not guarantee that a request already received by the server stops executing.

[matchUrl](extension/src/lib/url.ts) removes credentials and fragments, excludes
unsupported/local addresses, and enforces the API's 2,048-character URL limit.
Paths and query parameters are retained for detailed matching. POST keeps the
visited address out of request **URL** logs; it does not prevent body logging or
make sensitive query parameters safe to disclose.

The in-memory cache holds at most 100 answers. Entries older than five minutes
are refreshed when revisited; the panel does not poll an unchanged page. Failures
show a retry action. Unblock Syria's own pages show an explanation instead of
triggering a lookup. Several candidate services produce a pick-list.

## API boundary

[api.ts](extension/src/lib/api.ts) sends each request once, with a 60-second network
timeout. It omits cookies and referrers, rejects redirects, and returns a typed
success/error result. Read and vote responses are validated before UI code uses
them; form submissions require a receipt ID. Malformed responses become errors.
A timeout or lost response can leave a write's outcome uncertain.
[receipts.ts](extension/src/lib/receipts.ts) keeps a timestamped random receipt key
and payload fingerprint in session storage. Matching retries reuse that key;
changed details trigger receipt lookup before another send. The paired API keeps
an atomic reservation and completed response for 24 hours. An interrupted server
write stays unconfirmed and is never automatically repeated. Older API deployments
ignore the key, so this guarantee requires the matching server changes.

A 429 exposes `retryAfterSeconds` from either numeric or HTTP-date `Retry-After`.
Forms display the wait in seconds or minutes, without a ticking countdown. Client
validation avoids wasted requests; it is never an anti-abuse boundary.

| Build       | API                            | Site links                 | Verification                      |
| ----------- | ------------------------------ | -------------------------- | --------------------------------- |
| Development | `http://localhost:8787`        | `http://localhost:3000`    | `http://localhost:8790`           |
| Production  | `https://api.unblocksyria.com` | `https://unblocksyria.com` | `https://verify.unblocksyria.com` |

`WXT_API_BASE`, `WXT_SITE_BASE` and `WXT_VERIFY_BASE` override these at build time.
Loopback APIs on `localhost` or `127.0.0.1` skip client verification. The server must
also be configured for development without a Turnstile secret. The country check
always uses `https://api.unblocksyria.com/cdn-cgi/trace`.

## Human verification

[turnstile.ts](extension/src/lib/turnstile.ts) frames
`/extension/turnstile?action=<action>&nonce=<uuid>` on the verification host.
The page returns an `unblocksyria-turnstile` message with the nonce, action and
status (`interactive`, `solved` or `error`).

The panel accepts only its own frame's messages from the exact verification
origin, with the expected nonce and action. Empty or oversized tokens are refused.
Loading has a 30-second deadline; an interactive challenge has two minutes.
Repeated messages cannot extend that deadline. Interactive verification opens a
modal with Cancel and Escape support; completion removes the frame and listener.

The API must validate the token, expected action and hostname. Cloudflare tokens
are single-use and expire after five minutes; client-side checks cannot replace
[server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
The public manifest key and stable extension ID identify the client but are not
credentials or proof that a request came from an unmodified build.

## Forms and screenshots

Votes use `POST`/`DELETE /services/:slug/vote`. The browser stores a local hint;
`ALREADY_VOTED` and `NO_VOTE_FOUND` reconcile it with the server. Storage failure
does not turn an acknowledged vote into a failed operation. Voting is closed in
the UI for available services.

Each functionality report item needs a note or screenshot. A matching recorded
level is sent only when it has evidence. Reports are limited to 30 items and 100
screenshots in total, with five screenshots per item. Corrections send multiple
changes in one submission; category changes are JSON arrays of at most ten IDs.
New-service names are capped at 200 characters and descriptions at 2,000.

The screenshot lifecycle is:

1. Capture the visible tab as JPEG. A different site needs a second click; a tab
   or URL change detected during capture discards the result. This is a best-effort
   check, not an atomic guarantee against every possible navigation race.
2. Resize large captures to fit the API's 5 MiB cap, or fail with an error.
3. Open a popup editor using a random session ID and an extension-origin
   `BroadcastChannel`. If a window cannot open, use a modal inside the panel.
   Images and edit history stay in memory; no screenshot is written to storage.
4. Saving draws the crop and solid black boxes into a new JPEG. The original stays
   available for later edits; only the current rendered blob is uploaded.
5. On Send, verify and upload each image sequentially to `POST /uploads/evidence`,
   then separately verify and submit the form. Captures and both editor modes block submission; the form is
   disabled while sending. Exiting a failed verification does not undo uploads.
6. Reuse upload claims on a later attempt for up to 55 minutes, allowing time
   before the server's one-hour expiry. Editing an image invalidates its claim.

Claims authorize attachment to a submission. The API hides unclaimed uploads
when `PUBLIC_UPLOAD_PROTECTION` is `enforced`; the `staged` compatibility phase
keeps their URLs readable. Abandoned uploads are swept on the server schedule.
Attached evidence remains public to holders of its address. Local previews use
blob URLs. The extension cannot revoke a server upload.

The editor supports pointer editing and labeled numeric crop/redaction controls.
Forms ask before Back discards changes; Settings preserves the mounted draft.
A best-effort unload guard does not guarantee persistence when the browser closes
the native panel. Draft text and screenshots are intentionally held in memory.

## Permissions and storage

- `tabs` reads the active tab's URL and title.
- `sidePanel` enables the panel, and `storage` holds email and vote hints.
- `<all_urls>` permits cross-site capture while the panel follows navigation and
  permits API requests. It is broad access. Replacing it with `activeTab` would
  require a fresh toolbar invocation when the grant expires on navigation; see
  [Chrome's permission model](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).
- `chrome.storage.local` holds `testerEmail` and independent `voteHint:<slug>`
  booleans; legacy `votedServiceSlugs` remains readable. Storage events update
  other panels without sharing a read/modify/write array. Successful submissions
  remember a nonempty email; failed or anonymous submissions preserve the saved
  address. Saving a blank email in Settings clears it. Hints cannot establish
  a vote after the user's network changes.
- `chrome.storage.session` holds uncertain receipt keys and payload fingerprints;
  these survive panel closure but not a browser restart. `localStorage` holds the
  theme. No browsing history or screenshot is persisted by this code.
- Chrome 123+ is required for the theme's `light-dark()` CSS support. Other Chromium
  browsers also need compatible side panel APIs; they are not all tested here.

## Abuse boundaries

A modified extension or a script can call the public API directly. CORS, the
extension ID, disabled buttons and local vote hints cannot prevent that. The
server must enforce verification, quotas, vote uniqueness, upload validation and
claims, and moderation on every client. The extension carries no privileged
credential that would bypass those checks.

## Validation

`npm run check` runs lint, Prettier, TypeScript, Vitest and a production build.
`npm run test:e2e` separately runs the built extension in Chromium. Unit/component
tests refuse unstubbed fetches. Browser fixtures intercept HTTP(S) requests and
fail on unknown requests. No live write is needed for either suite.

The browser harness opens the panel as an extension tab, so it does not establish
native side-panel behavior across all supported browsers. Real Turnstile solves,
production quotas, deployment configuration and manual assistive-technology checks
remain outside these tests.
