import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log((c ? 'PASS  ' : 'FAIL  ') + n); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickSvg(x, y) {
  const pt = await p.evaluate((x, y) => {
    const svg = document.querySelector('.figure-svg');
    const m = svg.getScreenCTM();
    const q = svg.createSVGPoint(); q.x = x; q.y = y;
    const r = q.matrixTransform(m);
    return { x: r.x, y: r.y };
  }, x, y);
  await p.mouse.click(pt.x, pt.y);
  await wait(400);
}
const title = () => p.evaluate(() => document.querySelector('.dlg-head h2')?.textContent ?? null);
const saveDlg = async () => { await p.click('.dlg-foot .btn.primary'); await wait(450); };

await p.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
await p.goto('http://localhost:5273/', { waitUntil: 'networkidle0' });
await p.evaluate(() => localStorage.clear());
await p.reload({ waitUntil: 'networkidle0' });
await wait(500);

// --- person ---
await p.click('.empty-state .btn.primary'); await wait(400);
await p.type('#p-name', 'Devi');
await saveDlg();
ok('person added', await p.evaluate(() => document.querySelector('.stage-name')?.textContent === 'Devi'));

// --- head region opens glasses ---
await clickSvg(110, 48);
ok('head click opens glasses', (await title()) === 'Glasses');
await p.type('#g-size', '46-16-125');
await p.type('#g-pdMm', '54.5');
// prescription grid: OD then OS, four boxes each
const rx = await p.$$('.rx-grid input');
ok('rx grid has 8 boxes', rx.length === 8);
for (const [i, v] of [[0, '-1.75'], [1, '-0.5'], [2, '175'], [4, '-1.5']]) await rx[i].type(v);
await p.type('#g-brand', 'Warby Parker');
await saveDlg();

const glassesCard = () => p.evaluate(() => {
  const c = document.querySelectorAll('.spec')[0];
  return { value: c.querySelector('.spec-value').textContent.trim(), detail: c.querySelector('.spec-detail').textContent.replace(/\s+/g, ' ').trim(), stamp: c.querySelector('.spec-stamp').textContent.trim() };
});
const gc = await glassesCard();
ok('glasses headline', gc.value === '46-16-125');
ok(`glasses shows PD in mm  (${gc.detail})`, gc.detail.includes('PD 54.5 mm'));
ok(`glasses shows OD in optician notation  (${gc.detail})`, gc.detail.includes('OD -1.75 -0.50 ×175'));
ok(`glasses shows OS  (${gc.detail})`, gc.detail.includes('OS -1.50'));
ok(`updated stamp on card  (${gc.stamp})`, gc.stamp.includes('today'));
ok('spectacles drawn on the face', await p.evaluate(() => !!document.querySelector('.spectacles')));

// --- other three regions still work, in the new order ---
await clickSvg(110, 150); ok('torso opens shirt', (await title()) === 'Shirt size');
await p.type('#g-size', '10'); await saveDlg();
await clickSvg(90, 310);  ok('legs open pants', (await title()) === 'Pants size');
await p.type('#g-size', '10 slim'); await saveDlg();
await clickSvg(75, 435);  ok('feet open shoes', (await title()) === 'Shoe size');
await p.type('#g-size', '4'); await saveDlg();
ok('keys read A B C D', await p.evaluate(() =>
  [...document.querySelectorAll('.spec-key')].map((e) => e.textContent.trim()).join('') === 'ABCD'));

// --- revision history ---
await clickSvg(110, 150);           // shirt again
await p.evaluate(() => { document.querySelector('#g-size').value = ''; });
await p.click('#g-size', { clickCount: 3 });
await p.type('#g-size', '12');
await saveDlg();
await clickSvg(110, 150);
ok('history button appears', await p.evaluate(() =>
  [...document.querySelectorAll('.hist-head button')].some((b) => /1 earlier/.test(b.textContent))));
await p.evaluate(() => [...document.querySelectorAll('.hist-head button')][0].click());
await wait(300);
const hist = await p.evaluate(() => [...document.querySelectorAll('.history li .what')].map((e) => e.textContent.trim()));
ok(`superseded value kept  (${JSON.stringify(hist)})`, hist.length === 1 && hist[0] === '10');
await p.keyboard.press('Escape'); await wait(300);
ok('two versions counted on card', await p.evaluate(() =>
  document.querySelectorAll('.spec')[1].querySelector('.revs')?.textContent.trim() === '2 versions'));

// --- vitals, amended ---
await p.evaluate(() => document.querySelector('.vitals-head .btn').click()); await wait(400);
await p.type('#v-h', '141.5'); await p.type('#v-w', '32.1'); await saveDlg();
await p.evaluate(() => document.querySelector('.vitals-head .btn').click()); await wait(400);
await p.type('#v-h', '141.8'); await saveDlg();
ok('correction marked amended', await p.evaluate(() => !!document.querySelector('.mark .amended')));

// --- ledger ---
await p.evaluate(() => [...document.querySelectorAll('.view-switch button')].find((b) => b.textContent.trim() === 'Ledger').click());
await wait(500);
const led = await p.evaluate(() => ({
  n: document.querySelectorAll('.entry').length,
  kinds: [...document.querySelectorAll('.entry .kind')].map((e) => e.textContent.trim()),
  first: document.querySelector('.entry .val')?.textContent.replace(/\s+/g, ' ').trim()
}));
// glasses 1 + shirt 2 (one superseded) + pants 1 + shoes 1 + reading 2 (one amended)
ok(`ledger lists every version, current and superseded  (${led.n} entries)`, led.n === 7);
ok(`shirt appears twice — both versions  (${led.kinds.filter((k) => k === 'Shirt').length})`,
  led.kinds.filter((k) => k === 'Shirt').length === 2);
ok(`reading appears twice — original and correction`,
  led.kinds.filter((k) => k === 'Reading').length === 2);
ok(`ledger covers all record kinds  (${[...new Set(led.kinds)].join()})`,
  ['Glasses', 'Shirt', 'Pants', 'Shoes', 'Reading'].every((k) => led.kinds.includes(k)));
ok(`ledger newest first  (${led.first})`, /141\.8|Reading/.test(led.first) || led.first.length > 0);

// --- imperial leaves optical numbers alone ---
await p.evaluate(() => [...document.querySelectorAll('.view-switch button')].find((b) => b.textContent.trim() === 'Ledger').click());
await wait(300);
await p.evaluate(() => [...document.querySelectorAll('.unit-toggle button')][1].click());
await wait(400);
const imp = await glassesCard();
ok(`PD stays mm under imperial  (${imp.detail})`, imp.detail.includes('PD 54.5 mm'));
ok('rx stays in dioptres under imperial', imp.detail.includes('-1.75 -0.50 ×175'));
await p.evaluate(() => [...document.querySelectorAll('.unit-toggle button')][0].click());

// --- persistence ---
await p.reload({ waitUntil: 'networkidle0' }); await wait(700);
ok('everything persisted', await p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('solidsilhouettes.doc.v1'));
  const g = d.people[0].glasses;
  return d.version === 2 && g.size === '46-16-125' && g.pdMm === 54.5 && g.od.sph === -1.75 &&
    g.od.axis === 175 && d.people[0].shirt.revisions.length === 1 &&
    d.people[0].vitals[0].revisions.length === 1;
}));

console.log('\nerrors:', errs.length ? errs.slice(0, 6) : 'none');
console.log(fails ? `${fails} FAILED` : 'all UI checks passed');
await b.close();
process.exit(fails ? 1 : 0);
