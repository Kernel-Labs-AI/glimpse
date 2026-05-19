# Glimpse

Glimpse uploads Playwright screenshots to Supabase Storage, S3, or Vercel Blob and posts them to a GitHub pull request comment.

It can post either captured screenshots or generated visual diffs. Diff filtering is meant to keep PR comments small: screenshots below a configured change threshold are not uploaded or posted.

## Install

```bash
npm install --save-dev @kernel-labs/glimpse
```

Glimpse expects Node 20 or newer.

## Capture Screenshots

Use the Playwright helpers in tests that should produce PR screenshots.

```typescript
import { test } from '@playwright/test'
import { captureScreenshotWithInfo } from '@kernel-labs/glimpse/playwright'

test('dashboard', async ({ page }, testInfo) => {
  await page.goto('/dashboard')
  await captureScreenshotWithInfo(page, testInfo, 'dashboard')
})
```

By default screenshots are written to `test-results/pr-screenshots`. Set `PR_SCREENSHOTS_DIR` to change that location.

There are two helpers:

- `captureScreenshot(page, options)` writes `name.png`.
- `captureScreenshotWithInfo(page, testInfo, options)` prefixes the filename with the test title, attaches the image to the Playwright report, and uses the test file as the default group in the GitHub comment.

Both helpers accept:

```typescript
{
  name: string
  outputDir?: string
  fullPage?: boolean
  screenshotOptions?: Parameters<Page['screenshot']>[0]
  group?: string
}
```

## Upload Screenshots

Upload captured screenshots after your Playwright run.

Supabase:

```bash
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_PRIVATE_KEY=your-service-role-key \
npx glimpse upload \
  --directory ./test-results/pr-screenshots \
  --storage supabase \
  --pr 123
```

S3:

```bash
AWS_REGION=us-east-1 \
S3_BUCKET=my-screenshots \
npx glimpse upload \
  --directory ./test-results/pr-screenshots \
  --storage s3 \
  --pr 123
```

Vercel Blob:

```bash
VERCEL_BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... \
npx glimpse upload \
  --directory ./test-results/pr-screenshots \
  --storage vercel-blob \
  --pr 123
```

The upload command writes `screenshot-urls.json` by default. That JSON is the input for the GitHub comment step.

## Post a GitHub Comment

Use `postToGitHub` from a GitHub Actions step after upload.

```yaml
permissions:
  contents: read
  issues: write
  pull-requests: read

steps:
  - uses: actions/checkout@v4

  - uses: actions/setup-node@v4
    with:
      node-version: '20.x'

  - run: npm ci
  - run: npx playwright install --with-deps chromium
  - run: npm run build

  - name: Run screenshot tests
    run: npm run test:e2e

  - name: Upload screenshots
    if: always()
    env:
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_PRIVATE_KEY: ${{ secrets.SUPABASE_PRIVATE_KEY }}
      PR_NUMBER: ${{ github.event.pull_request.number }}
      RUN_ID: ${{ github.run_id }}
    run: |
      npx glimpse upload \
        --directory ./test-results/pr-screenshots \
        --storage supabase

  - name: Post screenshot comment
    if: always()
    uses: actions/github-script@v7
    with:
      script: |
        const fs = require('fs')
        const { postToGitHub } = await import('${{ github.workspace }}/node_modules/@kernel-labs/glimpse/dist/index.js')

        const screenshots = JSON.parse(fs.readFileSync('screenshot-urls.json', 'utf8'))

        await postToGitHub({
          screenshots,
          prNumber: context.issue.number,
          owner: context.repo.owner,
          repo: context.repo.repo,
          runId: context.runId,
          repositoryUrl: context.payload.repository.html_url,
          token: process.env.GITHUB_TOKEN
        }, github)
```

For S3, replace the upload step environment and storage type:

```yaml
env:
  AWS_REGION: us-east-1
  S3_BUCKET: my-screenshots
  AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
  AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  PR_NUMBER: ${{ github.event.pull_request.number }}
  RUN_ID: ${{ github.run_id }}
run: |
  npx glimpse upload \
    --directory ./test-results/pr-screenshots \
    --storage s3
```

## Diff Against a Local Baseline

Pass a baseline directory to compare current screenshots against previous screenshots with the same relative path.

```bash
npx glimpse upload \
  --directory ./test-results/pr-screenshots \
  --storage s3 \
  --diff-base-directory ./test-results/baseline-screenshots \
  --diff-mode diffs \
  --min-diff-percentage 1
```

Important details:

- Keep `--diff-base-directory` outside `--directory`; Glimpse recursively uploads PNG files from `--directory`.
- `--diff-mode diffs` uploads generated diff images.
- `--diff-mode screenshots` uploads the current screenshot, but only when it differs from the baseline.
- `--min-diff-percentage` controls posting. Pixel diffs below that odiff `diffPercentage` are skipped.
- Layout changes and screenshots with no matching baseline are always included because they are usually high-signal.
- `--odiff-threshold` controls odiff pixel sensitivity. It is not the same as `--min-diff-percentage`.

If every screenshot is below the threshold, `upload` writes an empty JSON array. `postToGitHub` will skip creating a new comment in that case.

## Diff Against the Target Branch

Storage-backed diffs require baseline screenshots to already exist in storage. In CI, those screenshots usually are not in the repository, so you need a separate workflow that runs on the target branch and uploads screenshots for each commit.

The PR workflow then downloads the screenshots for the pull request's base commit and compares the current PR screenshots against them. If this baseline upload workflow is not set up, Glimpse has nothing to diff against and will treat screenshots as new images instead of failing the CI job.

A push workflow for the target branch should upload screenshots using a commit-addressed path:

```bash
VERCEL_BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... \
npx glimpse upload \
  --directory ./test-results/pr-screenshots \
  --storage vercel-blob \
  --path-template 'glimpse-screenshots/commit-{commit}/{relativePath}'
```

On `pull_request` workflows, Glimpse reads `GITHUB_EVENT_PATH` and uses:

- `pull_request.head.sha` for `{commit}` in the current upload path
- `pull_request.base.sha` for `{commit}` in the baseline path
- `pull_request.head.ref` and `pull_request.base.ref` for `{branch}` when needed

Use storage-backed baselines in the PR workflow:

```bash
VERCEL_BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... \
npx glimpse upload \
  --directory ./test-results/pr-screenshots \
  --storage vercel-blob \
  --path-template 'glimpse-screenshots/pr-{pr}/run-{runId}/{relativePath}' \
  --diff-base-from-storage \
  --diff-base-path-template 'glimpse-screenshots/commit-{commit}/{relativePath}' \
  --diff-mode diffs \
  --min-diff-percentage 1
```

This downloads each baseline image from the rendered baseline path, runs odiff locally in CI, and uploads only selected screenshots or generated diff images.

If the target branch has no stored screenshot for a path, Glimpse treats the current screenshot as a new high-signal image and includes it. The same fallback applies when diff mode is enabled without a usable baseline source: Glimpse skips odiff and uploads the current screenshots, marked as missing baselines.

## Storage Configuration

Supabase environment variables:

- `SUPABASE_URL`: required
- `SUPABASE_PRIVATE_KEY` or `SUPABASE_KEY`: required
- `SUPABASE_BUCKET`: optional, defaults to `screenshots`

S3 environment variables:

- `AWS_REGION` or `S3_REGION`: required
- `S3_BUCKET` or `AWS_BUCKET`: required
- `AWS_ACCESS_KEY_ID`: optional when the default AWS credential chain is available
- `AWS_SECRET_ACCESS_KEY`: optional when the default AWS credential chain is available
- `S3_ENDPOINT`: optional for S3-compatible providers
- `S3_PUBLIC_READ`: set to `false` to avoid public-read ACLs

Vercel Blob environment variables:

- `VERCEL_BLOB_READ_WRITE_TOKEN` or `BLOB_READ_WRITE_TOKEN`: required
- `VERCEL_BLOB_ACCESS`: optional, `public` or `private`; defaults to `public`

For S3-compatible services:

```bash
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com \
S3_REGION=us-east-1 \
S3_BUCKET=my-screenshots \
npx glimpse upload --directory ./test-results/pr-screenshots --storage s3
```

## CLI Reference

### `glimpse upload`

```bash
npx glimpse upload --directory <path> --storage <supabase|s3|vercel-blob> [options]
```

Options:

- `-d, --directory <path>`: directory containing PNG screenshots
- `-s, --storage <type>`: `supabase`, `s3`, or `vercel-blob`
- `-p, --pr <number>`: PR number; can also use `PR_NUMBER`
- `-r, --run-id <id>`: CI run ID; can also use `RUN_ID`
- `--commit <sha>`: commit SHA for path templates; defaults to the pull request head SHA or `GITHUB_SHA`
- `--branch <name>`: branch name for path templates; defaults to the pull request head ref or GitHub branch env vars
- `-t, --path-template <template>`: upload path template; default is `pr-{pr}/run-{runId}/{filename}`
- `-o, --output <path>`: output JSON path; default is `screenshot-urls.json`
- `--diff-base-directory <path>`: baseline screenshot directory
- `--diff-base-from-storage`: download baseline screenshots from storage
- `--diff-base-path-template <template>`: storage path template for baseline screenshots
- `--diff-base-pr <number>`: PR number for baseline path templates
- `--diff-base-run-id <id>`: run ID for baseline path templates
- `--diff-base-commit <sha>`: commit SHA for baseline path templates; defaults to the pull request base SHA
- `--diff-base-branch <name>`: branch name for baseline path templates; defaults to the pull request base ref
- `--diff-mode <screenshots|diffs>`: upload changed screenshots or generated diffs
- `--post-diffs`: shortcut for `--diff-mode diffs`
- `--min-diff-percentage <number>`: skip pixel diffs below this odiff `diffPercentage`
- `--odiff-threshold <number>`: odiff color threshold from `0` to `1`; lower is more sensitive
- `--diff-output-directory <path>`: write generated diff images to a specific directory

Path templates support:

- `{pr}`
- `{runId}`
- `{commit}`
- `{branch}`
- `{filename}`
- `{relativePath}`

Diff options can also be set with:

- `DIFF_BASE_DIRECTORY`
- `DIFF_BASE_FROM_STORAGE=true`
- `DIFF_BASE_PATH_TEMPLATE`
- `DIFF_BASE_PR`
- `DIFF_BASE_RUN_ID`
- `GLIMPSE_DIFF_BASE_COMMIT`
- `GLIMPSE_DIFF_BASE_BRANCH`
- `DIFF_MODE`
- `POST_DIFFS=true`
- `MIN_DIFF_PERCENTAGE`
- `ODIFF_THRESHOLD`
- `DIFF_OUTPUT_DIRECTORY`

### `glimpse generate-comment`

```bash
npx glimpse generate-comment --input screenshot-urls.json [options]
```

Options:

- `-i, --input <path>`: JSON file generated by `glimpse upload`
- `-p, --pr <number>`: PR number
- `-r, --run-id <id>`: CI run ID
- `--repo-url <url>`: repository URL
- `-o, --output <path>`: output markdown path; default is `pr-comment.md`

## Programmatic API

```typescript
import { uploadScreenshots, postToGitHub } from '@kernel-labs/glimpse'

const screenshots = await uploadScreenshots({
  directory: 'test-results/pr-screenshots',
  storage: {
    type: 'vercel-blob',
    token: process.env.VERCEL_BLOB_READ_WRITE_TOKEN
  },
  pathTemplate: 'glimpse-screenshots/pr-{pr}/run-{runId}/{relativePath}',
  prNumber: 123,
  runId: process.env.GITHUB_RUN_ID,
  diff: {
    baselineStorage: {
      pathTemplate: 'glimpse-screenshots/commit-{commit}/{relativePath}',
      commitSha: process.env.GITHUB_BASE_SHA
    },
    uploadMode: 'diffs',
    minDiffPercentage: 1
  }
})

await postToGitHub({
  screenshots,
  prNumber: 123,
  owner: 'owner',
  repo: 'repo',
  token: process.env.GITHUB_TOKEN!,
  runId: process.env.GITHUB_RUN_ID,
  repositoryUrl: 'https://github.com/owner/repo'
}, github)
```

Useful exported types:

- `UploadOptions`
- `UploadedScreenshot`
- `ScreenshotDiffOptions`
- `ScreenshotBaselineStorageOptions`
- `GitHubCommentOptions`
- `StorageConfig`

## Development

```bash
npm install
npm run build
npm run test
```

## License

MIT
