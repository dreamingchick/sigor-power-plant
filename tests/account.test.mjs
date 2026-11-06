import assert from 'node:assert/strict';
import {cleanName,resetVillage,resetPersonalRecords,freshPlayer} from '../public/account.mjs';
assert.equal(cleanName('  새 이장  '),'새 이장');assert.equal(cleanName('   '),null);assert.equal(cleanName('1234567890123'),null);assert.equal(cleanName('a\nb'),null);
const baseline={player:'identity',secret:'secret',name:'이장',energy:40000,best:{speed:{taps:70}},queue:[{id:'pending'}],settings:{sound:false},rankingEpoch:'epoch',legacySurvivalBest:{duration:40},previousRankingBest:{speed:{taps:50}}};
const village=structuredClone(baseline);resetVillage(village);assert.equal(village.energy,0);assert.deepEqual(village.best,baseline.best);assert.equal(village.player,baseline.player);assert.equal(village.name,baseline.name);
const records=structuredClone(baseline);resetPersonalRecords(records);assert.equal(records.energy,40000);assert.equal(records.name,baseline.name);assert.equal(records.secret,baseline.secret);assert.deepEqual(records.best,{});assert.deepEqual(records.queue,[]);assert.equal(records.legacySurvivalBest,undefined);
const fresh=freshPlayer('new-id','new-secret','epoch');assert.equal(fresh.name,'');assert.equal(fresh.energy,0);assert.equal(fresh.player,'new-id');assert.equal(fresh.rankingEpoch,'epoch');assert.deepEqual(fresh.best,{});
console.log('PASS: name validation, village-only/records-only/full reset boundaries');
