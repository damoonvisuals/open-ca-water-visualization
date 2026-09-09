import { test, expect } from '@playwright/test';

test('loads bundled maps without external services; city search, original images, and data work', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Where does your water come from?' })).toBeVisible();
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  await expect(page.getByText('Drawing the watershed map…')).not.toBeVisible();
  await page.getByRole('textbox', { name: 'Search cities' }).fill('Anaheim');
  await expect(page.locator('.city-row')).toHaveCount(1);
  await page.locator('.city-row').click();
  await expect(page.locator('.selection-detail h2')).toHaveText('Metropolitan Water District cities');
  await expect(page.locator('.group-members')).toContainText('Santa Ana');
  await expect(page).toHaveURL(/#map=mwd$/);
  await page.getByRole('button', { name: /View original map/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.original-image')).toHaveJSProperty('naturalWidth', 1980);
  await expect(page.getByRole('link', { name: 'Open PDF' })).toHaveAttribute('href', /report.pdf#page=22$/);
  await page.getByRole('button', { name: 'Methodology', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trace water upstream' })).toBeVisible();
  await page.getByRole('button', { name: 'Download data', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: /Watershed footprints/ }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('watersheds.geojson');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await page.getByRole('combobox', { name: 'Filter by region' }).selectOption('Bay Area');
  await expect(page.locator('.city-row')).toHaveCount(4);
  await page.getByRole('textbox', { name: 'Search cities' }).fill('unknown');
  await expect(page.getByRole('heading', { name: 'No matching maps' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.locator('.city-row')).toHaveCount(18);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('deep links, comparison, map markers and tile fallback work', async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/**', route => route.abort());
  await page.goto('/#map=oakland');
  await expect(page.locator('.selection-detail h2')).toHaveText('Oakland');
  await expect(page.getByText('Drawing the watershed map…')).not.toBeVisible();
  await page.getByRole('checkbox', { name: 'Compare footprints' }).check();
  await expect(page.getByText('Other footprints', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fit selected watershed' }).click();
  await page.getByRole('button', { name: 'Explore Oakland', exact: true }).click();
  await page.getByRole('button', { name: 'Detailed', exact: true }).click();
  await expect(page.getByText(/Detailed tiles are unavailable/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simple', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-watersheds-visible', 'true');
  await page.screenshot({ path: `test-results/${test.info().project.name}-atlas.png`, fullPage: true });
});

test('data errors offer a recovery action', async ({ page }) => {
  await page.route('**/data/catalog.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The data couldn’t load.' })).toBeVisible();
  await page.unroute('**/data/catalog.json');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.selection-detail h2')).toHaveText('California overview');
});

test('the original legend controls thematic regions and red aqueduct routes', async ({ page }) => {
  await page.goto('/#map=oakland');
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-layers-page','23');
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-watersheds-visible','true');
  for (const label of ['High level of protection','Some protection','No known protection','Agricultural','Developed','Water Provider Service Area','Aqueducts']) {
    await expect(page.getByRole('checkbox', { name: `Show ${label}`, exact: true })).toBeChecked();
  }
  await expect(page.getByTestId('map-canvas')).not.toHaveAttribute('data-rendered-routes','0');
  await page.getByRole('checkbox', { name: 'Show Aqueducts', exact: true }).uncheck();
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-rendered-routes','0');
  await expect(page.getByRole('checkbox', { name: 'Show Aqueducts', exact: true })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Show High level of protection', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Show Aqueducts', exact: true }).check();
  await expect(page.getByTestId('map-canvas')).not.toHaveAttribute('data-rendered-routes','0');
  await page.getByRole('checkbox', { name: 'Show High level of protection', exact: true }).check();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download these map layers' }).click();
  expect((await download).suggestedFilename()).toBe('page-23.geojson');
  await page.screenshot({ path: `test-results/${test.info().project.name}-thematic-oakland.png`, fullPage: true });
});

test('thematic data failure is recoverable without losing city selection', async ({ page }) => {
  await page.route('**/data/maps/page-23.geojson', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/#map=oakland');
  await expect(page.getByText(/Map detail couldn’t load/)).toBeVisible();
  await expect(page.locator('.selection-detail h2')).toHaveText('Oakland');
  await page.unroute('**/data/maps/page-23.geojson');
  await page.getByRole('button', { name: 'Retry layers' }).click();
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-layers-page','23');
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-watersheds-visible','true');
});
