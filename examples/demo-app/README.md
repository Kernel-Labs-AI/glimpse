# Demo app

This dependency-free dashboard demonstrates the same Playwright and Glimpse workflow used by a consuming app. Its content, dimensions, and data are deterministic so the example is easy to rerun.

```bash
npm run demo:serve
```

Open `http://127.0.0.1:4173` to try the reporting-period selector, interactive revenue bars, and report export flow.

Run the example Playwright tests with:

```bash
npx playwright install chromium
npm run demo:test
```

`tests/visual-diff.spec.ts` calls Glimpse's `captureScreenshot` helper. In a real repository, the baseline variant runs on the target branch and the current variant runs on the pull request:

```bash
DEMO_VARIANT=baseline npm run demo:test
DEMO_VARIANT=current npm run demo:test
```

Both runs capture `revenue-overview.png`, so Glimpse can match the screenshot by relative path across branches. Documentation maintainers can regenerate the two named README inputs with `DEMO_SCREENSHOT_NAME` and `DEMO_SCREENSHOTS_DIR` overrides.

`tests/replay.spec.ts` records a native Playwright video containing several real interactions. Glimpse discovers and uploads that replay with the same command used in CI:

```bash
npx glimpse upload-replays \
  --directory ./docs/demo/playwright \
  --storage s3 \
  --allow-empty
```
