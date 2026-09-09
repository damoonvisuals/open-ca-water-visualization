import { test, expect } from '@playwright/test';
test('all appendix footprints render in the production build', async ({ page }) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const maps = await (await page.request.get('/data/catalog.json')).json();
  for (const map of maps.maps) {
    await page.evaluate(id => { location.hash = `map=${id}`; }, map.id);
    await expect(page.locator('.selection-detail h2')).toHaveText(map.name);
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-layers-page', String(map.page));
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-watersheds-visible','true');
  }
  await page.goto('/');
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-watersheds-visible','true');
  await page.screenshot({ path: `test-results/${test.info().project.name}-overview.png`, fullPage: true });
});
