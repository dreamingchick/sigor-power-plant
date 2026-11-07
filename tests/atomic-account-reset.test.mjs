import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const schema=(await readFile('drizzle/0000_organic_gabe_jones.sql','utf8'))+(await readFile('drizzle/0001_village_guestbook.sql','utf8')).replaceAll('--> statement-breakpoint','')+(await readFile('drizzle/0002_green_sugar_man.sql','utf8'));
globalThis.__atomicEnv={DB:null};
const source=(await readFile('app/api/ranking/route.ts','utf8')).replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__atomicEnv;');
const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {DELETE,PATCH}=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));
const a={player:crypto.randomUUID(),secret:crypto.randomUUID()},b={player:crypto.randomUUID(),secret:crypto.randomUUID()};
const req=(method,body)=>new Request('https://unit.test/api/ranking',{method,body:JSON.stringify(body)});
const tables=['runs','guestbook_posts','guestbook_likes','guestbook_rate','guestbook_players'];
async function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(schema);
 let failAt=-1,mutations=0,batches=0;
 for(const [id,who,mode] of [['own-current',a,'20261106-01:speed'],['own-old',a,'speed'],['other',b,'20261106-01:speed']])sql.prepare('INSERT INTO runs VALUES(?,?,?,?,?,?,?)').run(id,who.player,who.secret,'선수',mode,70,10);
 for(const who of [a,b]){const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(who.secret))).toString('hex');sql.prepare('INSERT INTO guestbook_players VALUES(?,?,?)').run(who.player,hash,1);sql.prepare('INSERT INTO guestbook_rate VALUES(?,?)').run(who.player,1);sql.prepare('INSERT INTO guestbook_posts(player,name,body,created_at) VALUES(?,?,?,?)').run(who.player,'선수','안녕',1)}
 sql.prepare('INSERT INTO guestbook_likes(post_id,player) VALUES(?,?)').run(1,b.player);sql.prepare('INSERT INTO guestbook_likes(post_id,player) VALUES(?,?)').run(2,a.player);
 const db={prepare(query){let args=[];return{bind(...values){args=values;return this},async first(){return sql.prepare(query).get(...args)||null},async run(){if(mutations++===failAt)throw Error('Injected failure');return sql.prepare(query).run(...args)}}},async batch(queries){batches++;sql.exec('BEGIN');try{const result=[];for(const q of queries)result.push(await q.run());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}};
 const snapshot=()=>Object.fromEntries(tables.map(t=>[t,sql.prepare('SELECT * FROM '+t+' ORDER BY 1,2').all()]));
 return {sql,db,snapshot,fail(i){failAt=i;mutations=0},get batches(){return batches}};
}
const oldError=console.error;console.error=()=>{};
try{
 for(let failure=0;failure<5;failure++){
  const f=await fixture();globalThis.__atomicEnv.DB=f.db;const before=f.snapshot();f.fail(failure);
  const response=await DELETE(req('DELETE',{...a,epoch:'20261106-01',scope:'account'}));assert.equal(response.status,503);assert.equal(f.batches,1);assert.deepEqual(f.snapshot(),before);f.sql.close();
 }
 console.log('PASS: failure injected at each of 5 full-reset statements restores all ranking, post, like, rate and identity rows');
 const f=await fixture();globalThis.__atomicEnv.DB=f.db;const before=f.snapshot();
 assert.equal((await DELETE(req('DELETE',{...a,secret:b.secret,epoch:'20261106-01',scope:'account'}))).status,403);assert.deepEqual(f.snapshot(),before);
 assert.equal((await DELETE(req('DELETE',{...a,epoch:'20261106-01',scope:'unexpected'}))).status,400);
 assert.equal((await DELETE(req('DELETE',{...a,epoch:'20261106-01',scope:'account'}))).status,200);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM runs WHERE player=?').get(a.player).n,0);
 for(const t of ['guestbook_posts','guestbook_players','guestbook_rate'])assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM '+t+' WHERE player=?').get(a.player).n,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM guestbook_likes').get().n,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM runs WHERE player=?').get(b.player).n,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM guestbook_posts WHERE player=?').get(b.player).n,1);
 assert.equal((await DELETE(req('DELETE',{...a,epoch:'20261106-01',scope:'account'}))).status,200);
 f.sql.close();console.log('PASS: authorized full reset clears only own records across epochs; cross-player isolation and retry idempotency');
 const renamed=await fixture();globalThis.__atomicEnv.DB=renamed.db;const renameBefore=renamed.snapshot();renamed.fail(1);
 assert.equal((await PATCH(req('PATCH',{...a,name:'새 이름'}))).status,503);assert.deepEqual(renamed.snapshot(),renameBefore);renamed.sql.close();console.log('PASS: failed rename rolls back ranking and guestbook names together');
}finally{console.error=oldError}
