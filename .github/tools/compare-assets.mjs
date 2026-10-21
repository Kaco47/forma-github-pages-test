import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { ROOT, BASE } from './optimize.mjs';

// Asset comparison only. This is not a browser screenshot or a layout test.
const width = 1000, rowHeight = 380;
const rows = ['auto', 'power', 'tws'];
const overlays = [];
const label = (text, w = 1000, h = 40) => Buffer.from(`<svg width="${w}" height="${h}"><rect width="100%" height="100%" fill="#151719"/><text x="16" y="27" fill="#f2eee7" font-family="Arial" font-size="17">${text}</text></svg>`);
overlays.push({ input: label('FORMA v1.1 — asset comparison (NOT browser screenshots)'), left: 0, top: 0 });
overlays.push({ input: label('Reference resized from v1.0', 320), left: 0, top: 40 });
overlays.push({ input: label('Decoded lossless WebP', 320), left: 340, top: 40 });
overlays.push({ input: label('Visible codec difference', 320), left: 680, top: 40 });
for (let i = 0; i < rows.length; i++) {
  const key = rows[i];
  const original = execFileSync('git', ['show', `${BASE}:hero/layers/${key}.webp`], { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 });
  const before = await sharp(original).resize(240).png().toBuffer();
  const after = await sharp(await fs.readFile(path.join(ROOT, `media/v1.1/${key}-240.webp`))).png().toBuffer();
  overlays.push({ input: label(key.toUpperCase(), 320), left: 0, top: 80 + i * rowHeight });
  overlays.push({ input: before, left: 40, top: 120 + i * rowHeight });
  overlays.push({ input: after, left: 380, top: 120 + i * rowHeight });
  overlays.push({ input: label('max visible delta: 0', 320), left: 680, top: 210 + i * rowHeight });
}
await sharp({ create: { width, height: 80 + rows.length * rowHeight, channels: 4, background: '#080a0b' } })
  .composite(overlays).png().toFile(path.join(ROOT, '.github/reports/asset-comparison.png'));
console.log('Created .github/reports/asset-comparison.png (asset comparison, not a browser screenshot)');
