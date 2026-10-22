import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const pkg=JSON.parse(fs.readFileSync(path.join(dir,'package.json')));
assert.deepEqual(pkg.scripts,{build:'node assemble.mjs',verify:'node verify.mjs',security:'node check-dependencies.mjs',negative:'node negative-tests.mjs'},'CI scripts allowlist changed');
assert.deepEqual(pkg.dependencies,{parse5:'8.0.0'},'CI dependency allowlist changed');
for(const field of ['devDependencies','optionalDependencies','peerDependencies','bundledDependencies','overrides']) assert.ok(!pkg[field],field+' not allowed');
const lock=JSON.parse(fs.readFileSync(path.join(dir,'package-lock.json')));
assert.deepEqual(Object.keys(lock.packages).sort(),['','node_modules/entities','node_modules/parse5'],'Unexpected lockfile package');
assert.deepEqual(lock.packages[''].dependencies,pkg.dependencies);
for(const [name,version] of [['parse5','8.0.0'],['entities','6.0.1']]) {
 const p=lock.packages['node_modules/'+name];
 assert.equal(p.version,version);
 assert.ok(!p.hasInstallScript && !p.link);
 assert.equal(p.resolved,`https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`);
 assert.equal(p.integrity,{"parse5":"sha512-9m4m5GSgXjL4AjumKzq1Fgfp3Z8rsvjRNbnkVwfu2ImRqE5D0LnY2QfDen18FSY9C573YU5XxSapdHZTZ2WolA==","entities":"sha512-aN97NXWF6AWBTahfVOIrB/NShkzi5H7F9r1s9mD3cDj4Ko5f2qhhVoYMibXF7GlLveb/D2ioWay8lxI97Ven3g=="}[name]);
}
if(!process.argv.includes('--preflight')) {
 const modules=path.join(dir,'node_modules');
 assert.deepEqual(fs.readdirSync(modules).sort(),['.package-lock.json','entities','parse5']);
 function inspect(p) {
  for(const e of fs.readdirSync(p,{withFileTypes:true})) {
   const f=path.join(p,e.name); assert.ok(!e.isSymbolicLink(),'Unexpected symlink');
   if(e.isDirectory()) inspect(f);
   else assert.ok(!/\.(node|dll|so(?:\.\d+)*|dylib|exe)$/i.test(e.name),'Native binary '+f);
  }
 }
 inspect(modules);
 const require=createRequire(import.meta.url);
 for(const name of ['sharp','@img/sharp-linux-x64','@img/sharp-libvips-linux-x64']) assert.throws(()=>require.resolve(name),{code:'MODULE_NOT_FOUND'});
}
console.log('Pure JavaScript CI dependency allowlist and native exclusion: PASS');
