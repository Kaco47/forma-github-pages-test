import './image-runtime.mjs';
import assert from 'node:assert/strict';
// This dynamic import is unreachable while the shared safety gate is closed.
const { default: sharp } = await import('sharp');
console.log(JSON.stringify({ platform: process.platform, arch: process.arch, node: process.version, versions: sharp.versions }, null, 2));
const atLeast = (actual, minimum) => {
  assert.match(actual ?? '', /^\d+\.\d+\.\d+$/);
  const a = actual.split('.').map(Number), b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return true;
};
assert.ok(atLeast(sharp.versions.sharp, '0.35.4'), 'sharp below GHSA-rgj7-g3m4-5g8c fix');
// October 2026 upstream advisories include GHSA-3gwx-cjv4-jr74,
// GHSA-q7mw-2fmm-5q94 and GHSA-vv35-6hxg-95x8. npm audit does not
// cover all native libraries. No waiver: stop release until patched binaries.
assert.ok(atLeast(sharp.versions.heif, '1.23.6'), 'libheif < 1.23.6: upstream native advisories remain unresolved');
