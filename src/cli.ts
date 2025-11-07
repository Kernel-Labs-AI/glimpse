#!/usr/bin/env node

import { Command } from 'commander'
import fs from 'fs'
import path from 'path'
import { uploadScreenshots } from './upload.js'
import { generateCommentBody } from './github/comment.js'
import type { StorageConfig } from './storage/index.js'

const program = new Command()

program
  .name('playwright-pr-review')
  .description('Upload Playwright screenshots to Supabase/S3 and generate PR comments')
  .version('0.1.0')

program
  .command('upload')
  .description('Upload screenshots to storage')
  .requiredOption('-d, --directory <path>', 'Directory containing screenshots')
  .requiredOption('-s, --storage <type>', 'Storage type: supabase or s3')
  .option('-p, --pr <number>', 'PR number')
  .option('-r, --run-id <id>', 'CI run ID')
  .option('-t, --path-template <template>', 'Path template for uploaded files')
  .option('-o, --output <path>', 'Output file for screenshot URLs (JSON)')
  .action(async (options) => {
    try {
      const { directory, storage: storageType, pr, runId, pathTemplate, output } = options

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
      } else {
        console.error(`Error: Unknown storage type: ${storageType}`)
        console.error('Supported types: supabase, s3')
        process.exit(1)
      }

      // Upload screenshots
      const screenshots = await uploadScreenshots({
        directory,
        storage: storageConfig,
        prNumber: pr || process.env.PR_NUMBER,
        runId: runId || process.env.RUN_ID,
        pathTemplate
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
