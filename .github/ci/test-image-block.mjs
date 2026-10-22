import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
// Only this instrumentation executes in children before the safety gate.
// A dependency resolution or image read is a distinct failure, never a pass.
const monitor=`
import {registerHooks,syncBuiltinESMExports} from 'node:module';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
const deny=p=>{if(/\\.(png|webp|avif|heic|heif|jpe?g|ico)$/i.test(String(p)))throw Error('FORBIDDEN_IMAGE_READ');};
const read=fs.readFileSync;fs.readFileSync=function(p,...a){deny(p);return read.call(this,p,...a)};
const readAsync=fsp.readFile;fsp.readFile=async function(p,...a){deny(p);return readAsync.call(this,p,...a)};
syncBuiltinESMExports();
registerHooks({resolve(s,c,next){if(s==='sharp'||s.startsWith('@img/')||/\\.node$/.test(s))throw Error('FORBIDDEN_NATIVE_RESOLUTION');return next(s,c)}});
`;
const preload='data:text/javascript,'+encodeURIComponent(monitor);
const tools=JSON.parse(fs.readFileSync(path.join(root,'.github/tools/package.json')));
assert.deepEqual(tools.scripts,{build:'node image-runtime.mjs',verify:'node image-runtime.mjs'},'Legacy tool scripts changed');
const entries=['image-runtime.mjs','optimize.mjs','verify.mjs','compare-assets.mjs','check-native.mjs'];
for(const entry of entries){
 const r=spawnSync(process.execPath,['--import',preload,'.github/tools/'+entry],{cwd:root,encoding:'utf8'});
 assert.equal(r.status,1,entry+' must fail');
 assert.match(r.stderr,/FORMA_IMAGE_PROCESSING_BLOCKED/,entry+' missed gate');
 assert.doesNotMatch(r.stderr,/FORBIDDEN_NATIVE_RESOLUTION|FORBIDDEN_IMAGE_READ|ERR_MODULE_NOT_FOUND/,entry+' accessed forbidden resources');
 console.log('PASS: '+entry+' blocked before native resolution and image read');
}
const workflow=fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8');
assert.doesNotMatch(workflow,/npm\s+run\b/,'Workflow must not execute npm lifecycle scripts');
assert.match(workflow,/npm ci --prefix \.github\/ci --ignore-scripts/);
console.log('PASS: workflow invokes Node directly; installation scripts disabled');
