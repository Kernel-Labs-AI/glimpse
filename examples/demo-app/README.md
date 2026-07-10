# Demo app

This dependency-free dashboard is the source for Glimpse's README screenshots and demo recording. Its content, dimensions, and data are deterministic so documentation assets can be regenerated instead of edited by hand.

```bash
npm run demo:serve
```

Open `http://127.0.0.1:4173?demo=1` to switch between the baseline, proposed change, and highlighted-diff states.

Regenerate `docs/images/visual-diff-*.png`, `docs/demo/glimpse-demo.mp4`, and `docs/demo/glimpse-demo.gif` with:

```bash
npx playwright install chromium
npm run demo:assets
```

The asset script requires `ffmpeg` for the MP4 and inline GIF.
