export interface PathTemplateValues {
  filename: string
  relativePath?: string
  prNumber?: string | number
  runId?: string | number
  commitSha?: string | number
  branch?: string
}

const generatedRunId = String(Date.now())

/**
 * Generate a storage path from a template.
 *
 * Supported variables: {pr}, {runId}, {filename}, {relativePath}, {commit}, {branch}
 */
export function generatePathFromTemplate(
  template: string,
  values: PathTemplateValues
): string {
  const replacements: Record<string, string> = {
    pr: String(values.prNumber ?? 'unknown'),
    runId: String(values.runId ?? generatedRunId),
    filename: values.filename,
    relativePath: values.relativePath ?? values.filename,
    commit: String(values.commitSha ?? 'unknown'),
    branch: String(values.branch ?? 'unknown'),
  }

  return template.replace(/\{(pr|runId|filename|relativePath|commit|branch)\}/g, (_match, key: string) => {
    return replacements[key] ?? _match
  })
}
