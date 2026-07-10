import { UploadedReplay, UploadedScreenshot } from '../storage/index.js'

export interface GitHubCommentOptions {
  /** Uploaded screenshots to display */
  screenshots: UploadedScreenshot[]
  /** Uploaded Playwright replay videos to display */
  replays?: UploadedReplay[]
  /** PR number */
  prNumber: number
  /** GitHub token for authentication */
  token: string
  /** Repository owner */
  owner: string
  /** Repository name */
  repo: string
  /** Run ID for linking to the workflow */
  runId?: string | number
  /** Repository HTML URL */
  repositoryUrl?: string
}

/**
 * Format a screenshot filename into a human-readable display name
 */
function formatDisplayName(name: string): string {
  return name
    .replace('.diff.png', '')
    .replace('.png', '')
    .replace(/\.(webm|mp4|mov|m4v)$/i, '')
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\|/g, '&#124;')
    .replace(/[\r\n]+/g, ' ')
}

function formatDiffPercentage(percentage: number): string {
  const precision = percentage < 1 ? 2 : 1
  return `${percentage.toFixed(precision).replace(/\.0$/, '')}%`
}

function formatDiffMetadata(screenshot: UploadedScreenshot): string | undefined {
  if (!screenshot.diff) return undefined

  if (screenshot.diff.reason === 'pixel-diff' && screenshot.diff.percentage !== undefined) {
    return `${formatDiffPercentage(screenshot.diff.percentage)} diff`
  }

  if (screenshot.diff.reason === 'layout-diff') {
    return 'layout changed'
  }

  return 'new screenshot'
}

function formatItemCount(count: number, hasDiffMetadata: boolean): string {
  const noun = hasDiffMetadata ? 'change' : 'screenshot'
  return `${count} ${noun}${count !== 1 ? 's' : ''}`
}

/**
 * Generate a thumbnail grid table for a set of screenshots
 * Uses 3-column layout with clickable thumbnails
 */
function generateThumbnailGrid(screenshots: UploadedScreenshot[]): string {
  if (screenshots.length === 0) return ''

  let grid = '| | | |\n'
  grid += '|---|---|---|\n'

  for (let i = 0; i < screenshots.length; i += 3) {
    const row = screenshots.slice(i, i + 3)
    const cells = row.map(s => {
      const displayName = escapeHtml(formatDisplayName(s.displayName || s.sourceName || s.name))
      const url = escapeHtml(s.url)
      const diffMetadata = formatDiffMetadata(s)
      const caption = diffMetadata
        ? `${displayName}<br><sub>${diffMetadata}</sub>`
        : displayName
      return `<a href="${url}"><img src="${url}" width="280"><br>${caption}</a>`
    })
    // Pad with empty cells if needed
    while (cells.length < 3) {
      cells.push('')
    }
    grid += `| ${cells.join(' | ')} |\n`
  }

  return grid
}

/**
 * Generate a video grid table for uploaded Playwright replays.
 */
function generateReplayGrid(replays: UploadedReplay[]): string {
  if (replays.length === 0) return ''

  let grid = '| | |\n'
  grid += '|---|---|\n'

  for (let i = 0; i < replays.length; i += 2) {
    const row = replays.slice(i, i + 2)
    const cells = row.map(replay => {
      const displayName = escapeHtml(formatDisplayName(replay.displayName || replay.relativePath || replay.name))
      const url = escapeHtml(replay.url)
      return `<a href="${url}">▶ ${displayName}</a>`
    })
    while (cells.length < 2) {
      cells.push('')
    }
    grid += `| ${cells.join(' | ')} |\n`
  }

  return grid
}

/**
 * Generate markdown comment body for GitHub PR
 * Groups screenshots by category and renders them as a thumbnail grid
 */
export function generateCommentBody(options: GitHubCommentOptions): string {
  const { screenshots, replays = [], runId, repositoryUrl } = options

  let commentBody = '## 📸 UI Screenshots\n\n'
  const hasDiffMetadata = screenshots.some(s => s.diff)

  if (screenshots.length === 0 && replays.length === 0) {
    commentBody += 'No screenshots or diffs were selected for this run.\n'
  } else if (screenshots.length === 0) {
    commentBody += 'No screenshots or diffs were selected for this run.\n\n'
  } else if (hasDiffMetadata) {
    commentBody += 'Showing the highest-signal visual changes from the latest build:\n\n'
  } else {
    commentBody += 'Automated screenshots from the latest build:\n\n'
  }

  const hasGroups = screenshots.some(s => s.group)

  if (screenshots.length === 0) {
    // Keep the comment compact when all screenshots were filtered out.
  } else if (hasGroups) {
    // Group screenshots by their group field
    const groups = new Map<string, UploadedScreenshot[]>()
    for (const screenshot of screenshots) {
      const group = screenshot.group || 'Other'
      if (!groups.has(group)) {
        groups.set(group, [])
      }
      groups.get(group)!.push(screenshot)
    }

    for (const [group, groupScreenshots] of groups) {
      const count = groupScreenshots.length
      const groupHasDiffMetadata = groupScreenshots.some(s => s.diff)
      commentBody += `<details>\n`
      commentBody += `<summary><strong>${escapeHtml(group)}</strong> (${formatItemCount(count, groupHasDiffMetadata)})</summary>\n\n`
      commentBody += generateThumbnailGrid(groupScreenshots)
      commentBody += '\n</details>\n\n'
    }
  } else {
    // No groups - just show the grid directly
    commentBody += generateThumbnailGrid(screenshots)
  }

  if (replays.length > 0) {
    commentBody += screenshots.length > 0 ? '\n' : ''
    commentBody += '## 🎥 Playwright Replays\n\n'
    commentBody += 'Recorded browser sessions from the latest build:\n\n'
    commentBody += generateReplayGrid(replays)
  }

  commentBody += '\n---\n'

  if (runId && repositoryUrl) {
    commentBody += `🤖 Generated by [GitHub Actions](${repositoryUrl}/actions/runs/${runId})`
  } else {
    commentBody += '🤖 Generated by automated screenshot workflow'
  }

  return commentBody
}

/**
 * Post or update a GitHub PR comment with screenshots and replay videos
 * Note: This function is designed to be called from a GitHub Actions workflow
 * using actions/github-script@v7, as it requires the GitHub API client.
 *
 * For a complete example, see the README.
 */
export async function postToGitHub(
  options: GitHubCommentOptions,
  githubClient: any
): Promise<void> {
  const { screenshots, replays = [], prNumber, owner, repo } = options

  // Find existing comment
  const listParams = {
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  }
  const comments = githubClient.paginate
    ? await githubClient.paginate(githubClient.rest.issues.listComments, listParams)
    : (await githubClient.rest.issues.listComments(listParams)).data

  const botComment = comments.find((comment: any) =>
    comment.user?.type === 'Bot' &&
    comment.body?.includes('📸 UI Screenshots')
  )

  if (screenshots.length === 0 && replays.length === 0 && !botComment) {
    console.log('✓ No screenshots selected; skipping PR comment')
    return
  }

  const commentBody = generateCommentBody(options)

  // Update or create comment
  if (botComment) {
    await githubClient.rest.issues.updateComment({
      owner,
      repo,
      comment_id: botComment.id,
      body: commentBody
    })
    console.log('✓ Updated existing PR comment')
  } else {
    await githubClient.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: commentBody
    })
    console.log('✓ Created new PR comment')
  }
}
