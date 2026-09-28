# Contributing

Bug reports, translations and code are welcome.

## Before you start

- Search [existing issues](https://github.com/unblocksyria/shaghal-extension/issues)
  first. For a larger change, open an issue to agree on the approach.
- Report security problems privately; see [SECURITY.md](SECURITY.md).
- For a wrong listing or status, use **Suggest a correction** in the extension or
  on [unblocksyria.com](https://unblocksyria.com), not an issue here.

## Making a change

Set up the extension as described in the [README](README.md#development), and
read [ARCHITECTURE.md](ARCHITECTURE.md) before changing how it works.

Before opening a pull request, run from `extension/`:

```bash
npm run check
npm run build && npm run test:e2e
```

The tests stub all network access, so you need no API server or account. Add or
update tests for any behavior you change.

## Pull requests

- Keep each pull request to one change.
- Use [Conventional Commits](https://www.conventionalcommits.org) with a scope,
  for example `fix(evidence): keep the crop when a capture is resized`.
- Update the docs and comments that your change makes wrong. Comments describe
  how the code works now, not how it got there.
- Add every new string in English and Arabic, in `extension/src/locales/` (panel)
  or `extension/public/_locales/` (store listing). If you can't write the Arabic,
  say so in the pull request.
- Don't commit credentials, `.env` files or build output.

Contributions are licensed under the [MIT License](LICENSE).
