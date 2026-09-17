// Browser-only fixtures: no fake records or keys are sent to the production API.
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, "..");
const origin = process.env.MASTER_TEST_ORIGIN || "https://xavierfenaux.com";
const day = new Intl.DateTimeFormat("en-CA", { timeZone:"Europe/Paris", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
const offset = n => { const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0,10); };
(async () => {
  const browser = await chromium.launch({ headless:true });
  try {
    const context = await browser.newContext({ storageState:path.join(root,".deploy/master-browser-state.json"), viewport:{width:1440,height:1000} });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    for (const file of ["cockpit.js","cockpit.css","metrics.js"]) await page.route(`**/master/${file}*`, route => route.fulfill({ path:path.join(root,"www/master",file), contentType:file.endsWith("css") ? "text/css" : "application/javascript" }));
    await page.goto(origin + "/master/#social");
    await page.waitForFunction(() => document.querySelectorAll('.network-tabs a').length === 7);
    assert.equal(await page.locator('#main #provider-id').count(), 0);
    assert.equal(await page.locator('.social-kpi').count(), 6);
    await page.screenshot({path:path.join(root,".deploy/social-workspace-empty-desktop.png"),fullPage:true});
    await page.locator('.network-tabs a[href="#social/instagram-ivt"]').click();
    await page.waitForURL('**/#social/instagram-ivt');
    await page.waitForFunction(() => document.querySelector('.social-identity h2')?.textContent === 'Instagram');
    await page.locator('[data-days="7"]').click();
    assert.equal(await page.locator('[data-days="7"]').getAttribute('aria-pressed'), 'true');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.social-identity h2')?.textContent === 'Instagram');
    await page.locator('.network-tabs a[href="#social"]').click();
    await page.locator('#owner-filter').selectOption('IVT');
    assert.equal(await page.locator('.network-summary').count(), 3);
    await page.locator('.network-tabs a[href="#social/instagram-ivt"]').click();
    await page.locator('.social-period [data-connect]').click();
    assert.equal(await page.locator('#provider-secret').count(), 0);
    await page.locator('#data-dialog [data-close]').first().click();
    // Record the real account directory, but replace data only inside this test context.
    const live = await page.evaluate(async () => (await fetch('/master/social.php')).json());
    const records = live.accounts.flatMap((a, i) => Array.from({length:14}, (_, j) => ({account:a.id,date:offset(j-13),followers:1000*(i+1)+j,posts:1,reactions:5,views:20,comments:2,shares:1,source:'Browser test fixture'})));
    const fixture = {...live, records, details:{'instagram-ivt':{postsComplete:false,postsUpdatedAt:new Date().toISOString(),posts:[{id:'test-1',account:'instagram-ivt',title:'Un sujet de marché <sans HTML>',url:'https://www.instagram.com/p/test/',publishedAt:day+'T09:00:00Z',updatedAt:new Date().toISOString(),basis:'lifetime',reactions:4321,comments:17}]},'tiktok-ivt':{postsComplete:false,postsUpdatedAt:new Date().toISOString(),posts:[{id:'test-2',account:'tiktok-ivt',title:'Test vidéo TikTok',url:'https://www.tiktok.com/@interactivtrading/video/123',publishedAt:day+'T08:00:00Z',updatedAt:new Date().toISOString(),basis:'lifetime',views:98765,reactions:6543,comments:22,shares:8}]}},connections:{...live.connections, 'instagram-ivt':{...live.connections['instagram-ivt'], active:true, configured:true, connectedAt:new Date().toISOString()}}};
    await page.route('**/master/social.php', route => route.fulfill({json:fixture}));
    await page.goto(origin + '/master/#social');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#social-chart'));
    await page.locator('[data-days="7"]').click();
    assert.equal(await page.locator('.social-kpi').first().locator('strong').innerText(), '21\u202f078');
    assert.equal(await page.locator('.social-connection-row').count(),6,'connection directory per network');
    assert.equal(await page.locator('.social-posts tbody tr').count(),2,'native publication metrics appear');
    assert.match(await page.locator('.social-posts').innerText(),/98\s?765/,'TikTok cumulative views');
    assert.equal(await page.locator('.social-kpi').nth(3).locator('strong').innerText(),'700','cumulative posts do not inflate daily totals');
    const pixels = await page.locator('#social-chart').evaluate(canvas => {
      const data = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let ink=0; for(let i=3;i<data.length;i+=4) if(data[i]>0) ink++; return ink;
    });
    assert.ok(pixels > 1000, 'populated chart paints real canvas pixels');
    await page.locator('[data-chart-mode="networks"]').click();
    assert.equal(await page.locator('[data-chart-mode="networks"]').getAttribute('aria-pressed'), 'true');
    await page.screenshot({path:path.join(root,'.deploy/social-workspace-fixture-desktop.png'),fullPage:true});
    for (const width of [390,768,1440]) {
      await page.setViewportSize({width,height:900});
      for (const hash of ['#social','#social/instagram-ivt','#social/tiktok-ivt','#social/youtube-ivt','#social/spotify-xavier','#accounts']) {
        await page.goto(origin+'/master/'+hash);
        await page.waitForFunction(() => document.querySelector('#main .account-card, #main .social-kpi'));
        const overflow = await page.evaluate(() => ({ width:innerWidth, scroll:document.documentElement.scrollWidth, elements:[...document.querySelectorAll('#main *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && e.getBoundingClientRect().width > 0).slice(0,8).map(e => ({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right})) }));
        assert.ok(overflow.scroll <= width, `${width} ${hash} no page overflow: ${JSON.stringify(overflow)}`);
      }
    }
    await page.setViewportSize({width:390,height:844});
    await page.goto(origin+'/master/#social/instagram-ivt');
    await page.waitForFunction(() => document.querySelector('.social-identity h2')?.textContent === 'Instagram');
    assert.equal(await page.locator('.social-period [data-connect]').count(),0,'connect button disappears when active');
    assert.match(await page.locator('.social-period').innerText(), /Connecté/);
    await page.screenshot({path:path.join(root,'.deploy/social-workspace-fixture-mobile.png'),fullPage:true});
    assert.deepEqual(errors, []);
    console.log('Social workspace: routing, filters, period, native connection modal, active state, chart pixels and responsive layouts passed');
    await context.close();
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
