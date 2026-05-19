#!/usr/bin/env node

import { Command } from 'commander'
import fs from 'fs'
import { uploadScreenshots } from './upload.js'
import { generateCommentBody } from './github/comment.js'
import type { StorageConfig } from './storage/index.js'
import type { ODiffOptions } from 'odiff-bin'

const program = new Command()

function parseNumberOption(value: string | undefined, name: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be a number between ${min} and ${max}`)
  }
  return parsed
}

function readBooleanEnv(name: string): boolean {
  return process.env[name] === 'true' || process.env[name] === '1'
}

function readGitHubEvent(): any | undefined {
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath || !fs.existsSync(eventPath)) return undefined

  try {
    return JSON.parse(fs.readFileSync(eventPath, 'utf8'))
  } catch {
    return undefined
  }
}

function resolveBlobAccess(value: string | undefined): 'public' | 'private' {
  if (!value) return 'public'
  if (value === 'public' || value === 'private') return value
  throw new Error('VERCEL_BLOB_ACCESS must be either "public" or "private"')
}

program
  .name('glimpse')
  .description('Upload Playwright screenshots to storage and generate PR comments')
  .version('0.1.0')

program
  .command('upload')
  .description('Upload screenshots to storage')
  .requiredOption('-d, --directory <path>', 'Directory containing screenshots')
  .requiredOption('-s, --storage <type>', 'Storage type: supabase, s3, or vercel-blob')
  .option('-p, --pr <number>', 'PR number')
  .option('-r, --run-id <id>', 'CI run ID')
  .option('--commit <sha>', 'Commit SHA for upload path templates')
  .option('--branch <name>', 'Branch name for upload path templates')
  .option('-t, --path-template <template>', 'Path template for uploaded files')
  .option('-o, --output <path>', 'Output file for screenshot URLs (JSON)')
  .option('--diff-base-directory <path>', 'Baseline screenshot directory for visual diff comparisons')
  .option('--diff-base-from-storage', 'Download baseline screenshots from storage')
  .option('--diff-base-path-template <template>', 'Storage path template for baseline screenshots')
  .option('--diff-base-pr <number>', 'PR number for baseline storage path templates')
  .option('--diff-base-run-id <id>', 'Run ID for baseline storage path templates')
  .option('--diff-base-commit <sha>', 'Commit SHA for baseline storage path templates')
  .option('--diff-base-branch <name>', 'Branch name for baseline storage path templates')
  .option('--diff-mode <mode>', 'When diffing, upload changed screenshots or generated diffs: screenshots or diffs')
  .option('--post-diffs', 'Shortcut for --diff-mode diffs')
  .option('--min-diff-percentage <percentage>', 'Only upload pixel diffs at or above this odiff diffPercentage (0-100)')
  .option('--odiff-threshold <threshold>', 'Color-difference threshold passed to odiff (0-1, lower is more precise)')
  .option('--diff-output-directory <path>', 'Directory where generated diff images should be written')
  .action(async (options) => {
    try {
      const { directory, storage: storageType, pr, runId, pathTemplate, output } = options
      const githubEvent = readGitHubEvent()

      // Build storage config from environment variables
      let storageConfig: StorageConfig

      if (storageType === 'supabase') {
        const url = process.env.SUPABASE_URL
        const key = process.env.SUPABASE_PRIVATE_KEY || process.env.SUPABASE_KEY

        if (!url || !key) {
          console.error('Error: SUPABASE_URL and SUPABASE_PRIVATE_KEY environment variables are required')
          process.exit(1)
        }

        storageConfig = {
          type: 'supabase',
          url,
          key,
          bucket: process.env.SUPABASE_BUCKET
        }
      } else if (storageType === 's3') {
        const region = process.env.AWS_REGION || process.env.S3_REGION
        const bucket = process.env.S3_BUCKET || process.env.AWS_BUCKET

        if (!region || !bucket) {
          console.error('Error: AWS_REGION (or S3_REGION) and S3_BUCKET (or AWS_BUCKET) environment variables are required')
          process.exit(1)
        }

        storageConfig = {
          type: 's3',
          region,
          bucket,
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          endpoint: process.env.S3_ENDPOINT,
          publicRead: process.env.S3_PUBLIC_READ !== 'false'
        }
      } else if (storageType === 'vercel-blob') {
        const token = process.env.VERCEL_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN

        if (!token) {
          console.error('Error: VERCEL_BLOB_READ_WRITE_TOKEN (or BLOB_READ_WRITE_TOKEN) environment variable is required')
          process.exit(1)
        }

        storageConfig = {
          type: 'vercel-blob',
          token,
          access: resolveBlobAccess(process.env.VERCEL_BLOB_ACCESS)
        }
      } else {
        console.error(`Error: Unknown storage type: ${storageType}`)
        console.error('Supported types: supabase, s3, vercel-blob')
        process.exit(1)
      }

      const prNumber = pr || process.env.PR_NUMBER
      const resolvedRunId = runId || process.env.RUN_ID || process.env.GITHUB_RUN_ID
      const commitSha = options.commit ||
        process.env.GLIMPSE_COMMIT_SHA ||
        githubEvent?.pull_request?.head?.sha ||
        process.env.GITHUB_SHA
      const branch = options.branch ||
        process.env.GLIMPSE_BRANCH ||
        githubEvent?.pull_request?.head?.ref ||
        process.env.GITHUB_HEAD_REF ||
        process.env.GITHUB_REF_NAME
      const diffBaseDirectory = options.diffBaseDirectory || process.env.DIFF_BASE_DIRECTORY
      const diffBaseFromStorage = options.diffBaseFromStorage || readBooleanEnv('DIFF_BASE_FROM_STORAGE')
      const diffBasePathTemplate = options.diffBasePathTemplate ||
        process.env.DIFF_BASE_PATH_TEMPLATE ||
        pathTemplate ||
        'pr-{pr}/run-{runId}/{filename}'
      const diffBaseCommit = options.diffBaseCommit ||
        process.env.GLIMPSE_DIFF_BASE_COMMIT ||
        githubEvent?.pull_request?.base?.sha ||
        process.env.GITHUB_BASE_SHA
      const diffBaseBranch = options.diffBaseBranch ||
        process.env.GLIMPSE_DIFF_BASE_BRANCH ||
        githubEvent?.pull_request?.base?.ref ||
        process.env.GITHUB_BASE_REF
      const diffBasePr = options.diffBasePr || process.env.DIFF_BASE_PR || prNumber
      const diffBaseRunId = options.diffBaseRunId || process.env.DIFF_BASE_RUN_ID
      const minDiffPercentage = parseNumberOption(
        options.minDiffPercentage || process.env.MIN_DIFF_PERCENTAGE,
        'minDiffPercentage',
        0,
        100
      )
      const odiffThreshold = parseNumberOption(
        options.odiffThreshold || process.env.ODIFF_THRESHOLD,
        'odiffThreshold',
        0,
        1
      )
      const postDiffs = options.postDiffs || readBooleanEnv('POST_DIFFS')
      const diffMode = postDiffs
        ? 'diffs'
        : options.diffMode || process.env.DIFF_MODE
      const hasDiffOptions = Boolean(
        diffBaseDirectory ||
        diffBaseFromStorage ||
        diffMode ||
        minDiffPercentage !== undefined ||
        odiffThreshold !== undefined
      )

      if (!diffBaseDirectory && !diffBaseFromStorage && hasDiffOptions) {
        throw new Error('Diff options require --diff-base-directory or --diff-base-from-storage')
      }

      if (diffBaseDirectory && diffBaseFromStorage) {
        throw new Error('Use either --diff-base-directory or --diff-base-from-storage, not both')
      }

      if (diffMode && diffMode !== 'screenshots' && diffMode !== 'diffs') {
        throw new Error('diffMode must be either "screenshots" or "diffs"')
      }

      const odiffOptions: ODiffOptions = {}
      if (odiffThreshold !== undefined) {
        odiffOptions.threshold = odiffThreshold
      }

      // Upload screenshots
      const screenshots = await uploadScreenshots({
        directory,
        storage: storageConfig,
        prNumber,
        runId: resolvedRunId,
        commitSha,
        branch,
        pathTemplate,
        ...(hasDiffOptions
          ? {
              diff: {
                ...(diffBaseDirectory ? { baselineDirectory: diffBaseDirectory } : {}),
                ...(diffBaseFromStorage
                  ? {
                      baselineStorage: {
                        pathTemplate: diffBasePathTemplate,
                        prNumber: diffBasePr,
                        ...(diffBaseRunId ? { runId: diffBaseRunId } : {}),
                        ...(diffBaseCommit ? { commitSha: diffBaseCommit } : {}),
                        ...(diffBaseBranch ? { branch: diffBaseBranch } : {}),
                      },
                    }
                  : {}),
                uploadMode: diffMode || 'screenshots',
                ...(minDiffPercentage !== undefined ? { minDiffPercentage } : {}),
                ...(options.diffOutputDirectory || process.env.DIFF_OUTPUT_DIRECTORY
                  ? { diffOutputDirectory: options.diffOutputDirectory || process.env.DIFF_OUTPUT_DIRECTORY }
                  : {}),
                ...(Object.keys(odiffOptions).length > 0 ? { odiffOptions } : {}),
              },
            }
          : {})
      })

      // Write output file if specified
      const outputPath = output || process.env.OUTPUT_FILE || 'screenshot-urls.json'
      fs.writeFileSync(
        outputPath,
        JSON.stringify(screenshots, null, 2)
      )
      console.log(`\n✓ Saved URLs to ${outputPath}`)

      // Also output for GitHub Actions
      if (process.env.GITHUB_OUTPUT) {
        const outputLine = `urls=${JSON.stringify(screenshots)}\n`
        fs.appendFileSync(process.env.GITHUB_OUTPUT, outputLine)
      }

    } catch (error: any) {
      console.error('Error:', error.message)
      process.exit(1)
    }
  })

program
  .command('generate-comment')
  .description('Generate GitHub PR comment markdown from screenshot URLs')
  .requiredOption('-i, --input <path>', 'Input file with screenshot URLs (JSON)')
  .option('-p, --pr <number>', 'PR number')
  .option('-r, --run-id <id>', 'CI run ID')
  .option('--repo-url <url>', 'Repository URL')
  .option('-o, --output <path>', 'Output file for comment markdown')
  .action(async (options) => {
    try {
      const { input, pr, runId, repoUrl, output } = options

      // Read screenshots from input file
      const screenshots = JSON.parse(fs.readFileSync(input, 'utf8'))

      // Get values from options or environment
      const prNumber = Number(pr || process.env.PR_NUMBER)
      const owner = process.env.GITHUB_REPOSITORY_OWNER || 'owner'
      const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'repo'
      const repositoryUrl = repoUrl || process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`
        : undefined

      // Generate comment body
      const commentBody = generateCommentBody({
        screenshots,
        prNumber,
        owner,
        repo,
        runId: runId || process.env.RUN_ID,
        repositoryUrl,
        token: '' // Not needed for generating comment
      })

      // Write output file
      const outputPath = output || 'pr-comment.md'
      fs.writeFileSync(outputPath, commentBody)
      console.log(`✓ Generated comment saved to ${outputPath}`)

      // Also print to stdout
      console.log('\n--- Comment Preview ---\n')
      console.log(commentBody)

    } catch (error: any) {
      console.error('Error:', error.message)
      process.exit(1)
    }
  })

program.parse()
