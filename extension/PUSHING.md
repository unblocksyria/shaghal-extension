# Publishing this repo to the unblocksyria GitHub org

Do this once GitHub org access is granted (remote does not exist yet).

1. Create the repo in the org (empty, no README — this repo already has history):
   suggested name: `unblocksyria-tester-extension`
2. Then from the project root:

```
git remote add origin git@github.com:unblocksyria/unblocksyria-tester-extension.git
git push -u origin main
```

3. From then on, follow the team workflow (Conventional Commits + short-lived branches):

```
git checkout -b feat/correction-form      # feat|fix|chore|docs + /area-slug
# ...work, verify: npx tsc --noEmit && npm run build && npm run build:firefox
git add <files>
git commit -m "feat(corrections): add service details correction form"
git push -u origin feat/correction-form
# open a PR into main, squash-merge
```

- `main` must always build; tag every tester handout (`git tag v0.2.0 && git push --tags`)
- Never commit `node_modules`, `.output`, `.wxt`, or `AI_CONTEXT` (ignored)
- Never commit tokens or Turnstile tokens (they live in `chrome.storage.local` only)
