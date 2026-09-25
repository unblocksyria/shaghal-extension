# شغّال (Shaghal): Unblock Syria for your browser

A side panel that shows whether the site you're on works from Syria. From the panel
you can:

- vote for the services you need;
- report which parts of a service work;
- suggest a correction to a listing;
- report a service that isn't tracked yet.

Everything goes to the same review queues as the forms on
[unblocksyria.com](https://unblocksyria.com).

[ARCHITECTURE.md](ARCHITECTURE.md) explains how it works and where abuse is stopped.

## What it does

- **Knows the page.** It asks Unblock Syria which tracked service the open page belongs
  to and shows its status from Syria: Available, Usable, Blocked or Unknown. Sites that
  host several services (such as apple.com) offer a pick-list.
- **I need this:** vote for a service. Voting closes once the service is available.
- **Report what works:** mark each part as working or failing. A part that contradicts
  the record needs a note or a screenshot.
- **Suggest Correction:** fix a listing's website, description, categories or support
  contacts.
- **Report a Service:** send in an untracked site, with its address and name filled in.

Both report forms warn you to turn off your VPN when your connection seems to come from
outside Syria. Screenshots capture the visible page and stay in the panel until you send
the form.

## Getting started

Chromium browsers only (Chrome, Edge, Brave, Opera), Chrome 123 or later. Built with
[WXT](https://wxt.dev), React 19 and TypeScript.

```bash
cd extension
npm install
npm run dev     # then load .output/chrome-mv3-dev as an unpacked extension
npm test        # unit tests
npm run format  # Prettier
npm run check   # what CI runs: lint, format check, typecheck, tests, build
```

To load the build, open `chrome://extensions`, turn on Developer mode, choose **Load
unpacked**, and pick `extension/.output/chrome-mv3-dev`. The store key in
`wxt.config.ts` gives every build the store's ID, `epmjhaoobmgfclbkelhkiakijjocjgfm`.
Development builds can show the panel for any address in a tab:
`chrome-extension://epmjhaoobmgfclbkelhkiakijjocjgfm/sidepanel.html?preview=<url>`.

### Which API it talks to

`npm run dev` talks to a **local API** at `http://localhost:8787`, so testing
never reaches the live review queues. `npm run build` talks to
`https://api.unblocksyria.com`. `WXT_API_BASE`, `WXT_SITE_BASE` and `WXT_VERIFY_BASE`
override the hosts.

The local API should run without human verification, so votes and reports work without
a Turnstile token.

The live API asks for a Turnstile token on every vote and form. To try that flow, build
against the live hosts. This writes to production.

```bash
WXT_API_BASE=https://api.unblocksyria.com WXT_VERIFY_BASE=https://verify.unblocksyria.com npm run dev
```

## Team workflow

- `main` must pass `npm run check`, and CI enforces it on every pull request.
- Use short-lived branches (`feat/<area>-<slug>`, `fix/<area>-<slug>`, `chore/<what>`,
  `docs/<topic>`) and Conventional Commits with a scope, such as
  `feat(corrections): …`.
- Make one logical change per commit, and tag tester handouts (`git tag v0.2.0`).
- Never commit tokens, `.env` files or build output.

## Privacy

- The panel sends only the open page's address, and only while the panel is open.
- Screenshots leave your machine only when you send their form.
- Your email is optional, stays in this browser, and goes only with forms you send.
