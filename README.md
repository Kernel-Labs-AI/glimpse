# playwright-pr-review

Upload Playwright screenshots to Supabase or S3 and automatically post them to GitHub PR comments for easy visual review.

## Features

- 📸 **Automated Screenshot Upload** - Upload Playwright test screenshots to Supabase or S3
- 🧪 **Test Helpers** - Capture screenshots directly in your Playwright tests
- 💬 **GitHub PR Comments** - Automatically post screenshots as PR comments
- 🔄 **Update Existing Comments** - Updates the same comment instead of creating duplicates
- ☁️ **Multiple Storage Options** - Support for Supabase Storage and AWS S3
- 🛠️ **Flexible** - CLI tool for CI environments or programmatic API for custom workflows
- 🎯 **Framework Focused** - Designed specifically for Playwright + GitHub Actions

## Installation

```bash
npm install --save-dev playwright-pr-review
```

## Quick Start

### Capturing Screenshots in Tests

Use the provided helper functions to capture screenshots directly in your Playwright tests. This approach works with your existing test setup and custom fixtures.

#### `captureScreenshot`

The simplest way to capture screenshots. Use this when you want basic screenshot functionality without Playwright test report integration:

```typescript
import { test, expect } from '@playwright/test'
import { captureScreenshot } from 'playwright-pr-review/playwright'

test('my app', async ({ page }) => {
  await page.goto('https://example.com')

  // Capture screenshot using helper
  await captureScreenshot(page, 'homepage')

  // Continue testing
  await page.click('button#login')
  await captureScreenshot(page, 'login-dialog')

  // With options
  await captureScreenshot(page, {
    name: 'dashboard',
    fullPage: true,
    screenshotOptions: {
      animations: 'disabled'
    }
  })
})
```

**Characteristics:**
- Saved to: `test-results/pr-screenshots/` (configurable via `PR_SCREENSHOTS_DIR` env var)
- Filename is exactly as provided (i.e. `homepage.png`)
- Does NOT attach to Playwright test report

#### `captureScreenshotWithInfo`

Use this when you want better integration with Playwright's test runner and reporting:

```typescript
import { test, expect } from '@playwright/test'
import { captureScreenshotWithInfo } from 'playwright-pr-review/playwright'

test('my app', async ({ page }, testInfo) => {
  await page.goto('https://example.com')

  // Capture screenshot with test context
  await captureScreenshotWithInfo(page, testInfo, 'homepage')

  // Continue testing
  await page.click('button#login')
  await captureScreenshotWithInfo(page, testInfo, 'login-dialog')

  // With options
  await captureScreenshotWithInfo(page, testInfo, {
    name: 'dashboard',
    fullPage: true,
    screenshotOptions: {
      animations: 'disabled'
    }
  })
})
```

**Characteristics:**
- Saved to: `test-results/pr-screenshots/` (configurable via `PR_SCREENSHOTS_DIR` env var)
- Filename: `my-app-homepage.png` (prefixed with test name to avoid conflicts)
- Attaches screenshot to Playwright test report (visible in HTML reports)
- Better for test organization and debugging

**When to use which:**
- Use `captureScreenshotWithInfo` if you want screenshots in Playwright's HTML reports or need test name prefixes
- Use `captureScreenshot` if you prefer simpler filenames and don't need test report integration

Screenshots are automatically saved to `test-results/pr-screenshots/` (configurable via `PR_SCREENSHOTS_DIR` env var).

### CLI Usage (For Uploading)

#### With Supabase Storage

```bash
# Upload screenshots
npx playwright-pr-review upload \
  --directory ./test-results \
  --storage supabase \
  --pr 123

# Environment variables required:
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_PRIVATE_KEY=your-service-key
```

#### With S3 Storage

```bash
# Upload screenshots
npx playwright-pr-review upload \
  --directory ./test-results \
  --storage s3 \
  --pr 123

# Environment variables required:
# AWS_REGION=us-east-1
# S3_BUCKET=my-screenshots
# AWS_ACCESS_KEY_ID=your-access-key (optional, uses default AWS credentials)
# AWS_SECRET_ACCESS_KEY=your-secret-key (optional)
```

## GitHub Actions Integration

Run this after your tests are completed:

```yaml
name: UI Screenshots

on:
  pull_request:
    branches: [main]

jobs:
  screenshots:
    name: Generate UI Screenshots
    runs-on: ubuntu-latest

    permissions:
      contents: read
      pull-requests: write

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - name: Build app
        run: npm run build

      - name: Run tests with screenshots
        run: npm run test:e2e
        # Your tests should use the screenshot helpers to capture screenshots

      # Upload to Supabase
      - name: Upload screenshots to Supabase
        if: always()
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_PRIVATE_KEY: ${{ secrets.SUPABASE_PRIVATE_KEY }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
          RUN_ID: ${{ github.run_id }}
        run: |
          npx playwright-pr-review upload \
            --directory ./test-results \
            --storage supabase

      # Post to PR
      - name: Post screenshots to PR
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const { postToGitHub } = await import('${{ github.workspace }}/node_modules/playwright-pr-review/dist/index.js');

            const screenshots = JSON.parse(fs.readFileSync('screenshot-urls.json', 'utf8'));

            await postToGitHub({
              screenshots,
              prNumber: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              runId: context.runId,
              repositoryUrl: context.payload.repository.html_url,
              token: process.env.GITHUB_TOKEN
            }, github);
```

### Using S3 Instead of Supabase

Just replace the upload step:

```yaml
      - name: Upload screenshots to S3
        if: always()
        env:
          AWS_REGION: us-east-1
          S3_BUCKET: my-screenshots
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
          RUN_ID: ${{ github.run_id }}
        run: |
          npx playwright-pr-review upload \
            --directory ./test-results \
            --storage s3
```

## Storage Configuration

### Supabase

ENV needed:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_PRIVATE_KEY`: Your Supabase service role key
   - `SUPABASE_BUCKET`: Optional if you need a custom bucket name (default: `screenshots`)

### AWS S3

1. Create an S3 bucket
2. Configure bucket permissions for public read (or use presigned URLs)
3. Add secrets to your GitHub repository:
   - `AWS_ACCESS_KEY_ID`: Your AWS access key
   - `AWS_SECRET_ACCESS_KEY`: Your AWS secret key

Environment variables:
- `AWS_REGION` or `S3_REGION`: AWS region (required)
- `S3_BUCKET` or `AWS_BUCKET`: Bucket name (required)
- `S3_ENDPOINT`: Custom endpoint for S3-compatible services (optional)
- `S3_PUBLIC_READ`: Set to `false` to disable public read ACL (default: `true`)

### S3-Compatible Services

The library works with any S3-compatible service (MinIO, DigitalOcean Spaces, Backblaze B2, etc.):

```bash
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com \
S3_REGION=us-east-1 \
S3_BUCKET=my-screenshots \
npx playwright-pr-review upload --directory ./test-results --storage s3
```

## CLI Reference

### `upload` command

Upload screenshots to storage.

```bash
npx playwright-pr-review upload [options]
```

**Options:**
- `-d, --directory <path>` - Directory containing screenshots (required)
- `-s, --storage <type>` - Storage type: `supabase` or `s3` (required)
- `-p, --pr <number>` - PR number (optional, can use `PR_NUMBER` env var)
- `-r, --run-id <id>` - CI run ID (optional, can use `RUN_ID` env var)
- `-t, --path-template <template>` - Path template for uploaded files (default: `pr-{pr}/run-{runId}/{filename}`)
- `-o, --output <path>` - Output file for screenshot URLs (default: `screenshot-urls.json`)

### `generate-comment` command

Generate PR comment markdown from uploaded screenshots.

```bash
npx playwright-pr-review generate-comment [options]
```

**Options:**
- `-i, --input <path>` - Input file with screenshot URLs (required)
- `-p, --pr <number>` - PR number
- `-r, --run-id <id>` - CI run ID
- `--repo-url <url>` - Repository URL
- `-o, --output <path>` - Output file for comment markdown

## API Reference

Other functions you can use if you want to customize your workflow:

### `uploadScreenshots(options)`

Upload screenshots to the configured storage provider.

```typescript
interface UploadOptions {
  directory: string
  storage: StorageConfig
  pathTemplate?: string
  prNumber?: string | number
  runId?: string | number
}

const screenshots = await uploadScreenshots(options)
```

### `postToGitHub(options, githubClient)`

Post or update a GitHub PR comment with screenshots.

```typescript
interface GitHubCommentOptions {
  screenshots: UploadedScreenshot[]
  prNumber: number
  token: string
  owner: string
  repo: string
  runId?: string | number
  repositoryUrl?: string
}

await postToGitHub(options, github)
```

### `generateCommentBody(options)`

Generate markdown for a GitHub PR comment.

```typescript
const markdown = generateCommentBody(options)
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## License

MIT

## Contributing

Please open an issue before proposing a PR if you'd like to contribute. 
