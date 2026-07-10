import { test, expect } from '@playwright/test'

test.use({ video: { mode: 'on', size: { width: 1200, height: 720 } } })

test('records a real multi-interaction dashboard flow', async ({ page }) => {
  await page.goto('/?variant=current')
  await expect(page.getByRole('heading', { name: 'Revenue overview' })).toBeVisible()
  await page.waitForTimeout(500)

  await page.getByLabel('Reporting period').selectOption('30d')
  await expect(page.getByText('$18,420')).toBeVisible()
  await page.waitForTimeout(700)

  await page.getByRole('button', { name: 'May revenue, $18,420' }).click()
  await expect(page.getByText('May: $18,420')).toBeVisible()
  await page.waitForTimeout(700)

  await page.getByRole('button', { name: 'Export report' }).click()
  await expect(page.getByRole('heading', { name: 'Export revenue report' })).toBeVisible()
  await page.waitForTimeout(700)

  await page.getByRole('button', { name: 'Download CSV' }).click()
  await expect(page.getByRole('status')).toHaveText('Report downloaded successfully')
  await page.waitForTimeout(900)
})
