import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const records=new Map();
globalThis.__testEnv={DB:{prepare(sql){let args=[];return {bind(...v){args=v;return this},async first(){return [...records.values()].find(x=>x.player===args[0])||null},async run(){if(sql.startsWith('INSERT')){if(!records.has(args[0]))records.set(args[0],Object.fromEntries(['id','player','secret','name','mode','taps','duration'].map((k,i)=>[k,args[i]])))}else if(sql.startsWith('UPDATE')){for(const x of records.values())if(x.player===args[1]&&x.secret===args[2])x.name=args[0]}else if(sql.startsWith('DELETE')){for(const [key,x] of records)if(x.player===args[0]&&x.secret===args[1]&&x.mode.startsWith(args[2].slice(0,-1)))records.delete(key)}return {success:true}}}}}};
const source=(await fs.readFile('app/api/ranking/route.ts','utf8')).replace("import {env} from 'cloudflare:workers';","const env=globalThis.__testEnv;");
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {POST,PATCH,DELETE}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const r={id:crypto.randomUUID(),player:crypto.randomUUID(),secret:crypto.randomUUID(),name:'검수일꾼',epoch:'20261106-01',mode:'speed',duration:10,taps:70,times:Array.from({length:70},(_,i)=>i/7)};
const send=x=>POST(new Request('http://unit.test/api/ranking',{method:'POST',body:JSON.stringify(x)}));
assert.equal((await send(r)).status,200);assert.equal((await send(r)).status,200);assert.equal(records.size,1);
assert.equal((await send({...r,id:crypto.randomUUID(),secret:crypto.randomUUID()})).status,403);
assert.equal((await send({...r,id:crypto.randomUUID(),taps:71})).status,400);
assert.equal((await send({...r,id:crypto.randomUUID(),times:r.times.toReversed()})).status,400);
assert.equal((await send({...r,id:crypto.randomUUID(),mode:'survival',duration:90})).status,400);
assert.equal((await send({...r,id:crypto.randomUUID(),mode:'survival',duration:40,taps:160,times:Array.from({length:160},(_,i)=>i/4)})).status,200);
console.log('PASS: API validation, ownership, replay idempotency, survival recalculation (isolated DB adapter)');

const hard={...r,id:crypto.randomUUID(),rules:2,mode:'survival',duration:35,taps:140,times:Array.from({length:140},(_,i)=>i/4)};
assert.equal((await send(hard)).status,200);
assert.equal(records.get(hard.id).mode,'20261106-01:survival-v2');
assert.equal((await send({...hard,id:crypto.randomUUID(),duration:40,taps:160,times:Array.from({length:160},(_,i)=>i/4)})).status,400);
assert.equal((await send({...hard,id:crypto.randomUUID(),rules:7})).status,400);
console.log('PASS: strengthened rules 35s, legacy rules retained, version-isolated storage');

const before=records.size;const expired=await send({...r,id:crypto.randomUUID(),epoch:undefined});assert.equal((await expired.json()).expired,true);assert.equal(records.size,before);console.log('PASS: pre-reset offline replay excluded from new ranking');

const profileRequest=(method,body)=>new Request('http://unit.test/api/ranking',{method,body:JSON.stringify(body)});
const original=JSON.parse(JSON.stringify(records.get(r.id)));
assert.equal((await PATCH(profileRequest('PATCH',{player:r.player,secret:'forged-secret-value-is-long-enough',name:'가짜'}))).status,403);
assert.equal((await PATCH(profileRequest('PATCH',{player:r.player,secret:r.secret,name:'   '}))).status,400);
assert.equal((await PATCH(profileRequest('PATCH',{player:r.player,secret:r.secret,name:'새 일꾼'}))).status,200);
assert.equal(records.get(r.id).name,'새 일꾼');assert.equal(records.get(r.id).taps,original.taps);assert.equal(records.get(r.id).duration,original.duration);
records.set('archive',{...original,id:'archive',mode:'speed'});
records.set('other-player',{...original,id:'other-player',player:crypto.randomUUID()});
assert.equal((await DELETE(profileRequest('DELETE',{player:r.player,secret:'forged-secret-value-is-long-enough',epoch:r.epoch}))).status,403);
assert.equal((await DELETE(profileRequest('DELETE',{player:r.player,secret:r.secret,epoch:r.epoch}))).status,200);
assert.ok(records.has('other-player'));assert.ok(records.has('archive'));assert.ok(!records.has(r.id));
console.log('PASS: authenticated rename preserves scores; personal deletion retains other players and archived epochs');
