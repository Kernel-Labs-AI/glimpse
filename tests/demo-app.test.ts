import { test, expect } from '@playwright/test'
import { startDemoServer } from '../examples/demo-app/server.mjs'

test.describe('README demo app', () => {
  let demo: Awaited<ReturnType<typeof startDemoServer>>

  test.beforeAll(async () => {
    demo = await startDemoServer()
  })

  test.afterAll(async () => {
    await demo.close()
  })

  test('switches between deterministic baseline, current, and diff states', async ({ page }) => {
    await page.goto(`${demo.url}?demo=1&capture=1`)

    await expect(page.getByText('$84,240')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Baseline' })).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: 'Show proposed change' }).click()
    await expect(page.getByText('$91,320')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show proposed change' })).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: 'Highlight diff' }).click()
    await expect(page.getByRole('button', { name: 'Highlight diff' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('body')).toHaveClass(/state-diff/)
  })
})
