import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const markerDir=fs.mkdtempSync(path.join(os.tmpdir(),'forma-hooks-'));
const marker=path.join(markerDir,'executed');
const results=[];
function probe(name,file,mutate,script,expected,args=[]) {
 const target=path.join(root,file), previous=fs.existsSync(target)?fs.readFileSync(target):null;
 try {
  mutate(target,previous);
  const r=spawnSync(process.execPath,[script,...args],{cwd:root,encoding:'utf8',env:{...process.env,FORMA_HOOK_PROBE:marker}});
  assert.ok(!fs.existsSync(marker),name+': forbidden hook executed');
  assert.equal(r.status,1,name+': expected exit 1');
  assert.match(r.stderr,expected,name+': unexpected failure');
  results.push({name,status:'passed',rejectedExit:r.status});
 } finally {if(previous===null) fs.unlinkSync(target); else fs.writeFileSync(target,previous);}
}
probe('corrupt image','media/v1.1/auto-240.webp',(p,b)=>{const c=Buffer.from(b);c[c.length-1]^=1;fs.writeFileSync(p,c)},'.github/ci/check-artifacts.mjs',/Artifact hash changed/);
probe('remove resource','favicon.ico',p=>fs.unlinkSync(p),'.github/ci/check-artifacts.mjs',/Artifact inventory changed/);
probe('extra file','ci-unapproved-probe.txt',p=>fs.writeFileSync(p,'probe'),'.github/ci/check-artifacts.mjs',/Artifact inventory changed/);
probe('change manifest','.github/ci/approved-artifacts.json',(p,b)=>{const m=JSON.parse(b);m.files['media/v1.1/auto-240.webp'].sha256='0'.repeat(64);fs.writeFileSync(p,JSON.stringify(m))},'.github/ci/check-artifacts.mjs',/Manifest differs from approved Git snapshot/);
probe('restore sharp dependency','.github/ci/package.json',(p,b)=>{const m=JSON.parse(b);m.dependencies.sharp='0.35.5';fs.writeFileSync(p,JSON.stringify(m))},'.github/ci/check-dependencies.mjs',/CI dependency allowlist changed/,['--preflight']);
for(const hook of ['preverify','postverify','prebuild','postbuild','preinstall','install','postinstall','prepare','prepublish','prepublishOnly','prepack','postpack']) {
 probe('reject hook '+hook,'.github/ci/package.json',(p,b)=>{const m=JSON.parse(b);m.scripts[hook]=`node -e "require('node:fs').writeFileSync(process.env.FORMA_HOOK_PROBE,'executed')"`;fs.writeFileSync(p,JSON.stringify(m))},'.github/ci/check-dependencies.mjs',/CI scripts allowlist changed/,['--preflight']);
}
await import('./test-image-block.mjs');
fs.rmdirSync(markerDir);
console.log(JSON.stringify(results,null,2));
