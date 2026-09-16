const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const output = process.env.CLIPS_SCREENSHOTS || path.resolve('.deploy/clips-imports');
  fs.mkdirSync(output, { recursive: true });
  const root = path.resolve(__dirname, '../static');
  const browser = await (process.env.CLIPS_BROWSER === 'webkit' ? webkit : chromium).launch({ headless: true });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const episode = { id: 'test', title: 'Clarity Act, Fed, BOJ : la vraie actu des investisseurs du 16 septembre',
        published: '2026-09-16', state: 'waiting_video', clips: [], audio_url: '', transcript_reused: true };
      let imported;
      await page.route('https://clips.test/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/dashboard') return route.fulfill({ json: { episodes: [episode],
          services: { descriptions: true }, disk: { max_upload_bytes: 1048576000, free_bytes: 10737418240 }, settings: {} } });
        if (url.pathname.endsWith('/icloud')) {
          imported = route.request().postDataJSON();
          episode.state = 'icloud_queued';
          return route.fulfill({ status: 202, json: { ok: true, queued: true } });
        }
        if (url.pathname.endsWith('/video')) {
          assert.equal(route.request().headers()['x-file-name'], 'video.zip');
          episode.state = 'zip_queued';
          return route.fulfill({ status: 202, json: { ok: true, queued: true } });
        }
        const file = url.pathname === '/' ? 'index.html' : url.pathname.replace('/static/', '');
        const contentTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
        if (!['index.html', 'app.js', 'style.css'].includes(file)) return route.abort();
        return route.fulfill({ body: fs.readFileSync(path.join(root, file)), contentType: contentTypes[path.extname(file)] });
      });
      await page.goto('https://clips.test/');
      await page.locator('#icloud-url').waitFor();
      assert.match(await page.locator('#video-files').getAttribute('accept'), /\.zip/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(output, `import-${width}.png`), fullPage: true });
      const share = 'https://share.icloud.com/photos/0abcdefghijklmnopqrstuvwx';
      await page.locator('#icloud-url').fill(share);
      await page.locator('#icloud-form button').click();
      await page.locator('.status-card h3').filter({ hasText: 'Import iCloud prévu' }).waitFor();
      assert.equal(imported.url, share);
      episode.state = 'icloud_downloading';
      episode.import_progress = { received: 52428800, total: 104857600 };
      await page.evaluate(() => { lastRender = ''; return load(); });
      await page.locator('.import-meter').waitFor();
      assert.equal(await page.locator('.import-meter').getAttribute('value'), '50');
      await page.screenshot({ path: path.join(output, `progress-${width}.png`), fullPage: true });
      episode.state = 'waiting_video';
      episode.error = 'Lien iCloud expire. Cree un nouveau lien.';
      await page.evaluate(() => { lastRender = ''; return load(); });
      await page.locator('#video-files').setInputFiles({ name: 'video.zip', mimeType: 'application/zip', buffer: Buffer.from('PK-test-video') });
      await page.locator('.status-card h3').filter({ hasText: 'ZIP reçu' }).waitFor();
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS ${process.env.CLIPS_BROWSER || 'chromium'} ${width}px: layout, iCloud submission/progress, ZIP upload`);
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
