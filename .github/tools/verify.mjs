import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parse } from 'parse5';
import sharp from 'sharp';
import { ROOT, BASE, assetSpecs, imageProps, cardSizes } from './optimize.mjs';

const read = n => fs.readFile(path.join(ROOT, n));
const base = n => execFileSync('git', ['show', `${BASE}:${n}`], { cwd: ROOT, maxBuffer: 20 * 1024 * 1024 });
const baselineFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', BASE], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
const metrics = JSON.parse(await read('.github/reports/image-metrics.json'));
const hash = b => createHash('sha256').update(b).digest('hex');
const renamed = Object.fromEntries(metrics.renamed.map(x => [path.extname(x.from), x.to]));
const html = (await read('index.html')).toString('utf8');
const nodes = [];
function walk(node) { nodes.push(node); for (const n of node.childNodes || []) walk(n); }
walk(parse(html));
const attrs = node => Object.fromEntries((node.attrs || []).map(a => [a.name, a.value]));
const byTag = tag => nodes.filter(n => n.tagName === tag);
const texts = node => (node.nodeName === '#text' ? node.value : '') + (node.childNodes || []).map(texts).join('');
const images = byTag('img').map(attrs);
const ids = nodes.filter(n => n.attrs).map(attrs).filter(a => a.id).map(a => a.id);
assert.equal(new Set(ids).size, ids.length, 'Duplicate HTML ids');
assert.equal(ids.filter(id => id === 'concepts').length, 1);
assert.equal(images.length, 7);
for (const img of images) {
  assert.ok(img.src.startsWith('/media/v1.1/'));
  assert.ok(img.srcset && img.sizes && img.alt !== undefined);
}
assert.equal(byTag('h1').length, 1);
assert.ok(!html.includes('Смотреть работы'));
const cta = byTag('a').find(n => texts(n).includes('Смотреть дизайн-концепты'));
assert.equal(attrs(cta).href, '#concepts');
for (const node of byTag('a')) {
  const a = attrs(node);
  if (a.href?.startsWith('#')) assert.ok(ids.includes(a.href.slice(1)), `Broken anchor: ${a.href}`);
  if (a.target === '_blank') assert.ok(a.rel?.includes('noopener'));
}
for (const n of ['CNAME', 'robots.txt', 'sitemap.xml']) assert.equal((await read(n)).toString('utf8').replaceAll('\r\n', '\n'), base(n).toString('utf8').replaceAll('\r\n', '\n'), `${n} changed`);
assert.equal(hash(await read('favicon.ico')), hash(base('favicon.ico')));
for (const name of ['auto', 'power', 'tws']) assert.equal(hash(await read(`hero/layers/${name}.png`)), hash(base(`hero/layers/${name}.png`)));

// The only CSS changes permitted by this PR are resource URLs, the two mobile
// font sizes/wrapping, and the new anchor's scroll margin. Geometry is invariant.
const css = (await read(renamed['.css'])).toString('utf8');
const originalCss = base('_next/static/chunks/3vnxegmc6nkun.css').toString('utf8');
const expectedCssPrefix = originalCss.replaceAll('url(/hero/backgrounds/rock-background-desktop.png)', 'url(/media/v1.1/rock-desktop-1672.webp)')
  .replaceAll('url(/hero/backgrounds/rock-background-mobile.png)', 'url(/media/v1.1/rock-mobile-417.webp)');
assert.ok(css.startsWith(expectedCssPrefix));
assert.match(css.slice(expectedCssPrefix.length), /^\n\/\* FORMA v1\.1:[\s\S]*?font-size:11px[\s\S]*?font-size:11px[\s\S]*?#concepts\{scroll-margin-top:24px\}\n$/);
for (const item of metrics.renamed) {
  assert.ok(hash(await read(item.to)).startsWith(path.basename(item.to).match(/v1_1-([0-9a-f]+)/)[1]));
  assert.equal(hash(await read(item.from)), hash(base(item.from)), 'Cached baseline chunk must remain available');
}
for (const spec of assetSpecs) assert.equal(hash(await read(spec.source)), hash(base(spec.source)), 'Baseline compatibility asset changed');

const flightImages = [];
function inspectTree(v) {
  if (Array.isArray(v) && v[0] === '$' && v[1] === 'img' && v[3]?.src?.startsWith('/media/v1.1/')) flightImages.push(v[3]);
  if (v && typeof v === 'object') for (const child of Object.values(v)) inspectTree(child);
}
function inspectFlight(payload) {
  for (const line of payload.split('\n')) {
    const m = line.match(/^([0-9a-f]*:)([A-Z]*)(.*)$/s);
    if (!m || !m[3]) continue;
    let v; try { v = JSON.parse(m[3]); } catch { continue; }
    inspectTree(v);
  }
}
for (const m of html.matchAll(/self\.__next_f\.push\((\[1,"(?:\\.|[^"\\])*"\])\)/g)) inspectFlight(JSON.parse(m[1])[1]);
assert.equal(flightImages.length, 5, 'Expected three cards, scene sign and about sign in inline Flight');
const matchingFields = ['src', 'srcset', 'sizes', 'alt', 'loading'];
for (const img of flightImages) {
  const expected = { ...img, srcset: img.srcSet };
  assert.ok(images.some(a => matchingFields.every(k => a[k] === String(expected[k]))), `SSR/Flight image mismatch: ${img.src}`);
}
const client = (await read(renamed['.js'])).toString('utf8');
const headerProps = imageProps({ src: '/brand/forma-logo-transparent.png', alt: '', sizes: '32px', loading: 'eager', fetchPriority: 'high' }, 'brand-icon');
assert.ok(client.includes(`(0,t.jsx)("img",${JSON.stringify(headerProps)})`), 'Brand hydration markup must match SSR');
const preloads = byTag('link').map(attrs).filter(a => a.rel === 'preload' && a.as === 'image');
assert.equal(preloads.length, 4, 'Preserve baseline early-loading slots without unmeasured LCP changes');
for (const preload of preloads) {
  assert.equal(preload.href, undefined, 'Do not preload a full-resolution fallback as well');
  assert.ok(images.some(a => a.srcset === preload.imagesrcset && a.sizes === preload.imagesizes), 'Preload must match the eventual img selection');
}

async function list(dir = '') {
  const all = [];
  for (const item of await fs.readdir(path.join(ROOT, dir), { withFileTypes: true })) {
    if (!dir && ['.git', '.github'].includes(item.name)) continue;
    const name = path.posix.join(dir, item.name);
    if (item.isDirectory()) all.push(...await list(name)); else all.push(name);
  }
  return all;
}
const artifactFiles = await list();
assert.equal(artifactFiles.some(n => n.startsWith('.github/')), false);
const removed = ['file.svg', 'globe.svg', 'next.svg', 'vercel.svg', 'window.svg'];
for (const name of removed) assert.ok(!artifactFiles.includes(name));
const references = new Set();
const internalUrl = value => {
  if (!value || value.startsWith('data:') || value.startsWith('#')) return;
  const url = new URL(value, 'https://forma-cards.ru/');
  if (url.origin !== 'https://forma-cards.ru') return;
  references.add(decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html');
};
for (const file of artifactFiles) {
  if (file.endsWith('.html')) {
    const doc = parse((await read(file)).toString('utf8'));
    function inspect(n) {
      const a = attrs(n);
      for (const k of ['href', 'src']) if (a[k]) internalUrl(a[k]);
      for (const k of ['srcset', 'imagesrcset']) if (a[k]) for (const part of a[k].split(',')) internalUrl(part.trim().split(/\s+/)[0]);
      if (n.tagName === 'meta' && ['og:image', 'twitter:image'].includes(a.property || a.name)) internalUrl(a.content);
      for (const c of n.childNodes || []) inspect(c);
    }
    inspect(doc);
  }
  if (/\.(css|txt|html)$/.test(file)) {
    const text = (await read(file)).toString('utf8');
    for (const m of text.matchAll(/\/(?:media\/v1\.1|_next\/static|hero|brand)\/[a-zA-Z0-9_./-]+\.(?:webp|png|css|js|ico)/g)) internalUrl(m[0]);
    for (const name of removed) assert.ok(!text.includes(name), `${file} still references ${name}`);
  }
  if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', path.join(ROOT, file)]);
}
for (const ref of references) assert.ok(artifactFiles.includes(ref), `Missing resource ${ref}`);

// Compare codec output to the exact same Lanczos reference at each native
// variant size. RGB under fully transparent pixels is visually irrelevant.
for (const row of metrics.variants) {
  assert.equal((await read(row.file)).length, row.bytes);
  const reference = await sharp(base(row.source)).resize({ width: row.width, kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer();
  const decoded = await sharp(await read(row.file)).ensureAlpha().raw().toBuffer();
  assert.equal(decoded.length, reference.length);
  for (let i = 0; i < decoded.length; i += 4) {
    assert.equal(decoded[i + 3], reference[i + 3]);
    for (let c = 0; c < 3; c++) assert.equal(decoded[i + c] * decoded[i + 3], reference[i + c] * reference[i + 3], `Visible codec difference: ${row.file}`);
  }
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain', '.xml': 'application/xml' };
const server = http.createServer(async (req, res) => {
  let file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, '') || 'index.html';
  if (!artifactFiles.includes(file)) { res.writeHead(404); res.end(); return; }
  const bytes = await read(file); res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Length': bytes.length }); res.end(bytes);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const localOrigin = `http://127.0.0.1:${server.address().port}`;
let passedHttp = 0;
try {
  for (const file of artifactFiles) {
    const r = await fetch(localOrigin + '/' + (file === 'index.html' ? '' : file));
    assert.equal(r.status, 200); assert.equal(hash(Buffer.from(await r.arrayBuffer())), hash(await read(file))); passedHttp++;
  }
  for (const file of removed) assert.equal((await fetch(localOrigin + '/' + file)).status, 404);
  assert.equal((await fetch(localOrigin + '/.github/tools/optimize.mjs')).status, 404, 'Tooling is not part of the public artifact');
} finally { await new Promise(resolve => server.close(resolve)); }

const budgets = [];
const sizeOfVariant = (key, wanted) => {
  const spec = assetSpecs.find(s => s.key === key);
  const width = spec.widths.find(w => w >= wanted) || spec.widths.at(-1);
  return metrics.variants.find(v => v.format === 'webp' && v.file === `media/v1.1/${key}-${width}.webp`);
};
const baselineHero = assetSpecs.filter(s => s.kind !== 'background').reduce((sum, s) => sum + base(s.source).length, 0);
for (const viewport of [375, 390, 768, 1440, 1920]) for (const dpr of [1, 2, 3]) {
  let cardWidth, twsWidth;
  if (viewport <= 767) { cardWidth = viewport * 0.27588; twsWidth = viewport * 0.352; }
  else if (viewport <= 899) { cardWidth = 205; twsWidth = 262; }
  else if (viewport <= 1100) { cardWidth = viewport * 0.1206975 - 7.000455; twsWidth = viewport * 0.154 - 8.932; }
  else if (viewport <= 1599) { cardWidth = viewport * 0.1250865 - 14.510034; twsWidth = viewport * 0.1596 - 18.5136; }
  else { cardWidth = 173; twsWidth = 220; }
  const selected = [sizeOfVariant('logo', 32 * dpr), sizeOfVariant('auto', cardWidth * dpr), sizeOfVariant('power', cardWidth * dpr), sizeOfVariant('tws', twsWidth * dpr), sizeOfVariant(viewport <= 767 ? 'rock-mobile' : 'rock-desktop', 1)];
  const before = baselineHero + base(viewport <= 767 ? 'hero/backgrounds/rock-background-mobile.png' : 'hero/backgrounds/rock-background-desktop.png').length;
  const after = selected.reduce((sum, v) => sum + v.bytes, 0);
  budgets.push({ viewport, dpr, beforeBytes: before, afterBytes: after, reductionPercent: +(100 * (1 - after / before)).toFixed(2), selected: selected.map(v => v.file) });
}
const artifactBytes = (await Promise.all(artifactFiles.map(async f => (await read(f)).length))).reduce((a, b) => a + b, 0);
const beforeArtifactBytes = baselineFiles.reduce((sum, f) => sum + base(f).length, 0);
const report = {
  base: BASE, status: 'passed', artifactFiles: artifactFiles.length, httpPassed: passedHttp, checkedResourcePaths: references.size,
  nativeImageCount: images.length, inlineFlightImageCount: flightImages.length, codecVariantsVerified: metrics.variants.length,
  fullSizePngCardsUnchanged: true, sceneGeometryCssUnchanged: true, baselineCompatibilityUrlsRetained: true,
  oldArtifactBytes: beforeArtifactBytes, newArtifactBytes: artifactBytes, budgets,
  browserChecks: { available: false, pending: ['375/390/768/1440/1920 screenshots', 'horizontal overflow / scrollWidth', 'Tab / Shift+Tab / Enter / Space / Escape interactions', 'mobile menu after hydration', '200% text zoom and wrapping', 'LCP / CLS / INP / Lighthouse before vs after'] },
  note: 'Byte budgets follow srcset/sizes at the stated DPR; they are not measured browser transfers or LCP timings. Lossless matches the reference resized with Lanczos, not a browser screenshot.'
};
await fs.writeFile(path.join(ROOT, '.github/reports/verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, artifactFiles: report.artifactFiles, httpPassed: passedHttp, checkedResourcePaths: references.size, codecVariantsVerified: report.codecVariantsVerified, oldArtifactBytes: beforeArtifactBytes, newArtifactBytes: artifactBytes, browserAvailable: false }, null, 2));
