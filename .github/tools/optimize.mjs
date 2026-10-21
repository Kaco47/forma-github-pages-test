import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

// Deterministic adapter for the committed static export. No access to the
// original application, live hosting, credentials, DNS, or GitHub settings.
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const BASE = 'c123bedd0e67973ea9ace44747fb0e162fc62d0f';
const original = (name) => execFileSync('git', ['show', `${BASE}:${name}`], { cwd: ROOT, maxBuffer: 20 * 1024 * 1024 });
const tracked = execFileSync('git', ['ls-tree', '-r', '--name-only', BASE], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
export const assetSpecs = [
  { key: 'auto', source: 'hero/layers/auto.webp', widths: [240, 360, 480, 720], kind: 'card' },
  { key: 'power', source: 'hero/layers/power.webp', widths: [240, 360, 480, 720], kind: 'card' },
  { key: 'tws', source: 'hero/layers/tws.webp', widths: [240, 360, 480, 720, 960], kind: 'card' },
  { key: 'logo', source: 'brand/forma-logo-transparent.png', widths: [64, 96, 160, 240, 320, 480], kind: 'logo' },
  { key: 'rock-desktop', source: 'hero/backgrounds/rock-background-desktop.png', widths: [1672], kind: 'background' },
  { key: 'rock-mobile', source: 'hero/backgrounds/rock-background-mobile.png', widths: [417], kind: 'background' },
];
export const cardSizes = {
  auto: '(max-width: 767px) 27.588vw, (max-width: 899px) 205px, (max-width: 1100px) calc(12.06975vw - 7.000455px), (max-width: 1599px) calc(12.50865vw - 14.510034px), 173px',
  power: '(max-width: 767px) 27.588vw, (max-width: 899px) 205px, (max-width: 1100px) calc(12.06975vw - 7.000455px), (max-width: 1599px) calc(12.50865vw - 14.510034px), 173px',
  tws: '(max-width: 767px) 35.2vw, (max-width: 899px) 262px, (max-width: 1100px) calc(15.4vw - 8.932px), (max-width: 1599px) calc(15.96vw - 18.5136px), 220px',
};
const specBySource = new Map(assetSpecs.map(s => ['/' + s.source, s]));
const webpUrl = (spec, width) => `/media/v1.1/${spec.key}-${width}.webp`;
export const srcset = spec => spec.widths.map(w => `${webpUrl(spec, w)} ${w}w`).join(', ');
const fillStyle = { position: 'absolute', height: '100%', width: '100%', left: 0, top: 0, right: 0, bottom: 0, color: 'transparent' };
const MAIN_CTA = 'Смотреть дизайн-концепты';

export function imageProps(props, context = '') {
  const spec = specBySource.get(props.src);
  if (!spec || spec.kind === 'background') return props;
  let sizes = cardSizes[spec.key] || props.sizes || '32px';
  if (context.includes('brand-icon')) sizes = '32px';
  if (context.includes('about-sign')) sizes = '(max-width: 767px) 64px, (max-width: 1023px) 75px, 100px';
  const loading = props.loading || (props.preload ? 'eager' : 'lazy');
  const { fill, preload, unoptimized, src, ...rest } = props;
  return { ...rest, src: webpUrl(spec, spec.kind === 'card' ? 480 : 160), srcSet: srcset(spec), sizes,
    loading, decoding: props.decoding || 'async', 'data-nimg': 'fill',
    style: { ...fillStyle, ...(props.style || {}) } };
}

function adaptTree(value, context = '') {
  if (!Array.isArray(value)) {
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, adaptTree(v, context)]));
    return value;
  }
  if (value[0] === '$' && value[3] && typeof value[3] === 'object' && !Array.isArray(value[3])) {
    const [symbol, tag, key, props, ...extra] = value;
    const nextContext = `${context} ${props.className || ''}`;
    let next = { ...props };
    if (props.href === '#portfolio' && JSON.stringify(props.children).includes('Смотреть работы')) {
      next.href = '#concepts';
      next.children = JSON.parse(JSON.stringify(props.children).replaceAll('Смотреть работы', MAIN_CTA));
    }
    if (props.className === 'product-scene') next.id = 'concepts';
    if (specBySource.has(props.src) && specBySource.get(props.src).kind !== 'background') {
      next = imageProps(next, nextContext);
      return [symbol, 'img', key, next, ...extra];
    }
    return [symbol, tag, key, Object.fromEntries(Object.entries(next).map(([k, v]) => [k, adaptTree(v, nextContext)])), ...extra];
  }
  return value.map(v => adaptTree(v, context));
}

export function adaptFlight(text) {
  return text.split('\n').map(line => {
    const match = line.match(/^([0-9a-f]*:)([A-Z]*)(.*)$/s);
    if (!match || !match[3]) return line;
    try {
      const value = JSON.parse(match[3]);
      return match[1] + match[2] + JSON.stringify(adaptTree(value));
    } catch { return line; } // Non-JSON Flight control records stay byte-for-byte intact.
  }).join('\n');
}

const escapeAttribute = s => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
function attrsOf(tag) {
  const attrs = {};
  for (const m of tag.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) {
    if (m[1] === 'img') continue;
    attrs[m[1].toLowerCase()] = (m[2] ?? '').replaceAll('&amp;', '&').replaceAll('&quot;', '"');
  }
  return attrs;
}
function adaptHtml(text) {
  text = text.replace(/<img\b[^>]*\/?\s*>/g, (tag, index) => {
    const attrs = attrsOf(tag);
    if (!specBySource.has(attrs.src)) return tag;
    const context = text.slice(Math.max(0, index - 260), index);
    const props = imageProps({ src: attrs.src, alt: attrs.alt || '', loading: attrs.loading || 'eager',
      ...(attrs.fetchpriority ? { fetchPriority: attrs.fetchpriority } : {}),
      sizes: context.includes('about-sign') ? '(max-width: 767px) 64px, (max-width: 1023px) 75px, 100px' : context.includes('scene-sign') ? '(max-width: 767px) 17vw, 130px' : undefined }, context);
    attrs.src = props.src; attrs.srcset = props.srcSet; attrs.sizes = props.sizes;
    attrs.loading = props.loading;
    // Preserve the original SSR style, loading, alt, and priority attributes.
    return '<img ' + Object.entries(attrs).map(([k, v]) => `${k}="${escapeAttribute(v)}"`).join(' ') + '/>';
  });
  text = text.replace(/<link\b[^>]*rel="preload"[^>]*as="image"[^>]*\/?\s*>/g, tag => {
    const href = tag.match(/href="([^"]+)"/)?.[1];
    const spec = specBySource.get(href);
    if (!spec) return tag;
    const sizes = cardSizes[spec.key] || '32px';
    // Keep the existing early-fetch policy: AVIF is NOT introduced into the LCP
    // path without browser timings. A responsive WebP preload matches its img.
    return `<link rel="preload" as="image" imagesrcset="${srcset(spec)}" imagesizes="${sizes}" type="image/webp"${spec.kind === 'logo' ? ' fetchPriority="high"' : ''}/>`;
  });
  text = text.replace(/<a([^>]*href=")#portfolio("[^>]*)>Смотреть работы/g, `<a$1#concepts$2>${MAIN_CTA}`);
  text = text.replace('class="product-scene"', 'class="product-scene" id="concepts"');
  text = text.replace(/self\.__next_f\.push\((\[1,"(?:\\.|[^"\\])*"\])\)/g, (all, encoded) => {
    const payload = JSON.parse(encoded); payload[1] = adaptFlight(payload[1]);
    return 'self.__next_f.push(' + JSON.stringify(payload).replaceAll('<', '\\u003c') + ')';
  });
  return text;
}

function adaptBrandClient(text) {
  const needle = '(0,t.jsx)(r.Image,{src:"/brand/forma-logo-transparent.png"';
  const start = text.indexOf(needle);
  if (start < 0 || text.indexOf(needle, start + 1) >= 0) throw new Error('Brand component shape changed; refuse unsafe bundle patch');
  let depth = 0, end = -1, quote = null;
  const open = text.indexOf('(', start + '(0,t.jsx)'.length);
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote && text[i - 1] !== '\\') quote = null; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) { end = i + 1; break; }
  }
  if (end < 0) throw new Error('Unclosed Brand image call');
  const props = imageProps({ src: '/brand/forma-logo-transparent.png', alt: '', sizes: '32px', loading: 'eager', fetchPriority: 'high' }, 'brand-icon');
  return text.slice(0, start) + `(0,t.jsx)("img",${JSON.stringify(props)})` + text.slice(end);
}

async function generate() {
  const output = path.join(ROOT, 'media/v1.1');
  const candidates = path.join(ROOT, '.github/reports/avif-candidates');
  await fs.mkdir(output, { recursive: true }); await fs.mkdir(candidates, { recursive: true });
  const records = [];
  for (const spec of assetSpecs) {
    const input = original(spec.source);
    for (const width of spec.widths) {
      const reference = await sharp(input).resize({ width, withoutEnlargement: true, kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (const format of ['webp', 'avif']) {
        const pipeline = sharp(input).resize({ width, withoutEnlargement: true, kernel: 'lanczos3' });
        const bytes = format === 'webp' ? await pipeline.webp({ lossless: true, effort: 6 }).toBuffer()
          : await pipeline.avif({ lossless: true, effort: 4, chromaSubsampling: '4:4:4' }).toBuffer();
        const file = format === 'webp' ? `media/v1.1/${spec.key}-${width}.webp` : `.github/reports/avif-candidates/${spec.key}-${width}.avif`;
        await fs.writeFile(path.join(ROOT, file), bytes);
        const decoded = await sharp(bytes).ensureAlpha().raw().toBuffer();
        let maxVisibleDelta = 0, maxAlphaDelta = 0;
        for (let i = 0; i < decoded.length; i += 4) {
          maxAlphaDelta = Math.max(maxAlphaDelta, Math.abs(decoded[i + 3] - reference.data[i + 3]));
          for (let c = 0; c < 3; c++) maxVisibleDelta = Math.max(maxVisibleDelta,
            Math.abs(decoded[i + c] * decoded[i + 3] - reference.data[i + c] * reference.data[i + 3]) / 255);
        }
        if (maxAlphaDelta || maxVisibleDelta > 0.01) throw new Error(`Unexpected visible codec difference: ${file} ${maxVisibleDelta}`);
        records.push({ file, source: spec.source, width: reference.info.width, height: reference.info.height, format, bytes: bytes.length, maxVisibleDelta, maxAlphaDelta });
      }
    }
  }
  return records;
}

async function build() {
  const records = await generate();
  for (const name of tracked.filter(n => /\.(html|txt|css|js)$/.test(n))) {
    let text = original(name).toString('utf8');
    if (name.endsWith('.html')) text = adaptHtml(text);
    else if (name.endsWith('.txt')) text = adaptFlight(text);
    if (name === '_next/static/chunks/03p6cvmvy57p0.js') text = adaptBrandClient(text);
    if (name.endsWith('.css')) {
      text = text.replaceAll('url(/hero/backgrounds/rock-background-desktop.png)', 'url(/media/v1.1/rock-desktop-1672.webp)')
        .replaceAll('url(/hero/backgrounds/rock-background-mobile.png)', 'url(/media/v1.1/rock-mobile-417.webp)');
      text += '\n/* FORMA v1.1: readability only; scene geometry and effects are unchanged. */\n@media (max-width:767px){.directed-hero .platforms{font-size:11px}.directed-hero .approved-art figcaption{font-size:11px;flex-wrap:wrap;row-gap:4px}}\n#concepts{scroll-margin-top:24px}\n';
    }
    await fs.writeFile(path.join(ROOT, name), text);
  }
  const unused = ['file.svg', 'globe.svg', 'next.svg', 'vercel.svg', 'window.svg'];
  for (const name of unused) {
    for (const other of tracked.filter(n => /\.(html|txt|css|js)$/.test(n))) {
      if ((await fs.readFile(path.join(ROOT, other), 'utf8')).includes(name)) throw new Error(`Unexpected reference to ${name}`);
    }
  }
  for (const name of unused) await fs.rm(path.join(ROOT, name), { force: true });
  for (const spec of assetSpecs) await fs.writeFile(path.join(ROOT, spec.source), original(spec.source));
  // Existing browsers can cache immutable-looking chunk URLs. New filenames
  // prevent a cached old Brand/CSS bundle from requesting removed image URLs.
  const renamed = [];
  for (const name of ['_next/static/chunks/03p6cvmvy57p0.js', '_next/static/chunks/3vnxegmc6nkun.css']) {
    const content = await fs.readFile(path.join(ROOT, name));
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 12);
    const destination = `_next/static/chunks/forma-v1_1-${hash}${path.extname(name)}`;
    await fs.writeFile(path.join(ROOT, destination), content);
    renamed.push({ from: name, to: destination });
  }
  for (const name of tracked.filter(n => /\.(html|txt|css|js)$/.test(n))) {
    let text;
    try { text = await fs.readFile(path.join(ROOT, name), 'utf8'); } catch { continue; }
    for (const item of renamed) text = text.replaceAll(item.from, item.to);
    await fs.writeFile(path.join(ROOT, name), text);
  }
  // Retain the baseline URLs and assets for pages already cached by visitors.
  // Only the new HTML/Flight payloads point at the fingerprinted v1.1 chunks.
  for (const item of renamed) await fs.writeFile(path.join(ROOT, item.from), original(item.from));
  // The three full-size PNG card targets are deliberately retained unchanged.
  await fs.writeFile(path.join(ROOT, '.github/reports/image-metrics.json'), JSON.stringify({ base: BASE, sharp: sharp.versions.sharp, renamed, variants: records }, null, 2) + '\n');
  console.log(JSON.stringify({ generatedWebp: records.filter(r => r.format === 'webp').length, avifCandidates: records.filter(r => r.format === 'avif').length, removedTemplateAssets: unused, base: BASE }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
