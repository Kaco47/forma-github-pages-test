import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const approved='52dbd9191ca3bab73d952de868c466eec0f73dac';
const manifest=JSON.parse(fs.readFileSync(path.join(root,'.github/ci/approved-artifacts.json'),'utf8'));
assert.equal(manifest.approvedCommit,approved,'Approval baseline changed');
const names=execFileSync('git',['ls-tree','-r','--name-only',approved],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(n=>!n.startsWith('.github/'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const expected={approvedCommit:approved,files:Object.fromEntries(names.map(n=>{const b=execFileSync('git',['show',`${approved}:${n}`],{cwd:root,maxBuffer:30*1024*1024});return [n,{bytes:b.length,sha256:hash(b)}]}))};
// Compare against immutable Git objects, never regenerate approval from working files.
assert.deepEqual(manifest,expected,'Manifest differs from approved Git snapshot');
function walk(dir='') {
 return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>{
  if(!dir && ['.git','.github'].includes(e.name)) return [];
  const p=path.posix.join(dir,e.name);
  assert.ok(!e.isSymbolicLink(),'Unexpected symlink '+p);
  return e.isDirectory()?walk(p):[p];
 });
}
assert.deepEqual(walk().sort(),names.sort(),'Artifact inventory changed');
for(const [n,entry] of Object.entries(manifest.files)) {
 const bytes=fs.readFileSync(path.join(root,n));
 assert.equal(bytes.length,entry.bytes,'Artifact size changed: '+n);
 assert.equal(hash(bytes),entry.sha256,'Artifact hash changed: '+n);
}
// Pin preparation evidence too, including AVIF candidates, without decoding.
const evidence=execFileSync('git',['ls-tree','-r','--name-only',approved,'.github/reports'],{cwd:root,encoding:'utf8'}).trim().split('\n');
for(const n of evidence.filter(n=>/\.(png|webp|avif)$/.test(n)||n.endsWith('image-metrics.json'))) {
 assert.equal(hash(fs.readFileSync(path.join(root,n))),hash(execFileSync('git',['show',`${approved}:${n}`],{cwd:root,maxBuffer:30*1024*1024})),'Preparation evidence changed: '+n);
}
console.log('Approved manifest, complete export and preparation evidence: PASS');
