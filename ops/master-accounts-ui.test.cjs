// Fixtures stay in this browser context; no credentials or authorizations are saved.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const origin = process.env.MASTER_TEST_ORIGIN || 'https://xavierfenaux.com';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: path.join(root, '.deploy/master-browser-state.json'), viewport: { width: 1440, height: 1000 } });
    const response = await context.request.get(origin + '/master/social.php');
    assert.ok(response.ok(), 'authenticated account directory');
    const live = await response.json();
    const fixture = { accounts: live.accounts, records: [], sync: {}, connections: Object.fromEntries(live.accounts.map(a => [a.id, { ...live.connections[a.id], active: false, configured: false, needsReconnect: false }])) };
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (!process.env.MASTER_TEST_LIVE) {
      for (const file of ['cockpit.js', 'cockpit.css']) await page.route(`**/master/${file}*`, route => route.fulfill({ path: path.join(root, 'www/master', file), contentType: file.endsWith('.css') ? 'text/css' : 'application/javascript' }));
      await page.route(url => url.pathname === '/master/', async route => {
        const response = await route.fetch();
        const html = await response.text();
        const body = html.replace(/(<script id="boot" type="application\/json">)(.*?)(<\/script>)/s, (_, start, json, end) => start + JSON.stringify({ ...JSON.parse(json), social: fixture }).replace(/</g, '\\u003c') + end);
        await route.fulfill({ response, body });
      });
    }
    let release;
    let gate = new Promise(resolve => { release = resolve; });
    let failSocial = false;
    await page.route('**/master/social.php', async route => {
      await gate;
      await route.fulfill(failSocial ? { status: 503, json: { error: 'Test indisponibilite' } } : { json: fixture });
    });
    // Keep unrelated services pending to verify they cannot delay account rendering.
    let releaseServices;
    const serviceGate = new Promise(resolve => { releaseServices = resolve; });
    await page.route('**/master/status.php', async route => { await serviceGate; await route.fulfill({ json: { services: [] } }); });
    await page.route('**/master/analytics-data.php', async route => { await serviceGate; await route.fulfill({ status: 503, json: { error: 'Test indisponibilite' } }); });
    await page.goto(origin + '/master/#accounts', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.account-card');
    assert.equal(await page.locator('.account-card').count(), 6, 'six accounts before any API response');
    assert.equal(await page.locator('.account-card [data-connect]').count(), 6, 'six immediately visible connection buttons');
    assert.ok((await page.locator('.account-card [data-connect]').first().boundingBox()).y < 500, 'connection action above the fold');
    for (const account of fixture.accounts) {
      await page.locator(`.account-card [data-connect="${account.id}"]`).click();
      assert.ok(await page.locator('#data-dialog').isVisible());
      assert.equal(await page.locator('#data-dialog a[target="_blank"]').first().getAttribute('href'), account.analytics);
      assert.match(await page.locator('#data-dialog').innerText(), /pas de synchronisation|Synchronisation non activée/);
      if (fixture.connections[account.id].setup.mode === 'oauth') {
        await page.locator(`#data-dialog [data-provider="${account.id}"]`).click();
        await page.locator('#data-dialog .provider-setup summary').click();
        assert.ok(await page.locator('#provider-id').isVisible(), 'missing application configuration is reachable');
        assert.ok(await page.locator('#provider-secret').isVisible());
      }
      await page.locator('#data-dialog [data-close]').first().click();
    }
    await page.screenshot({ path: path.join(root, '.deploy/accounts-desktop.png'), fullPage: true });
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: no horizontal overflow`);
      for (const button of await page.locator('.account-card [data-connect]').all()) {
        assert.ok(await button.isVisible());
        assert.ok(await button.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'button label fits');
      }
      if (width === 390) await page.screenshot({ path: path.join(root, '.deploy/accounts-mobile.png'), fullPage: true });
    }
    // A successful social response renders even while analytics and health are pending.
    fixture.connections['instagram-xavier'].active = true;
    fixture.connections['instagram-xavier'].configured = true;
    release();
    await page.waitForFunction(() => !document.querySelector('.account-card [data-connect="instagram-xavier"]'));
    assert.equal(await page.locator('[data-disconnect="instagram-xavier"]').count(), 1);
    releaseServices();
    await page.waitForFunction(() => !document.getElementById('refresh').disabled);
    // Other configured networks submit real OAuth initiation forms, with CSRF.
    fixture.connections['tiktok-ivt'].configured = true;
    await page.locator('#refresh').click();
    await page.waitForSelector('.account-actions form');
    let submitted;
    await page.route('**/master/connect.php', async route => {
      submitted = new URLSearchParams(route.request().postData());
      await route.fulfill({ contentType: 'text/html', body: '<p>OAuth initiation intercepted by test</p>' });
    });
    await page.getByRole('button', { name: 'Connecter TikTok', exact: true }).click();
    await page.waitForURL('**/master/connect.php');
    assert.equal(submitted.get('account'), 'tiktok-ivt');
    assert.ok(submitted.get('csrf'), 'OAuth form includes CSRF token');
    failSocial = true;
    await page.goto(origin + '/master/#accounts');
    await page.waitForSelector('.error-banner');
    assert.equal(await page.locator('.account-card').count(), 6, 'directory survives social API failure');
    assert.equal(await page.locator('.account-actions button, .account-actions .chip.ok').count(), 6, 'each account retains a connection action or connected status');
    assert.deepEqual(errors, []);
    console.log('Accounts: immediate six buttons, slow/failed APIs, every modal, setup access, OAuth form/CSRF, active state and responsive layouts passed');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
