import assert from 'node:assert/strict';
import * as module from 'node:module';

export function assertSupportedNode(version, registerHooks) {
  assert.match(version, /^24\.\d+\.\d+$/, 'FORMA CI requires Node.js 24.x (>=24.0.0 <25); use the latest supported 24.x patch');
  assert.equal(typeof registerHooks, 'function', 'Node.js module.registerHooks is required for safe image-block tests');
}
assertSupportedNode(process.versions.node, module.registerHooks);
console.log('Supported Node.js: ' + process.version + '; module.registerHooks available');
