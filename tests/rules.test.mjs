import assert from 'node:assert/strict';
import {target,gauge,score,better,TouchGate,RANKING_EPOCH,resetRankingState} from '../public/core.mjs';
assert.deepEqual([0,1,2,3,5,6].map(target),[20,20,20,24,24,28]);
assert.equal(gauge(100,20,16),76);assert.equal(gauge(80,20,25),85);assert.equal(gauge(100,20,30),100);assert.equal(gauge(20,20,0),0);
assert.equal(score({speed:{taps:70},endurance:{taps:360},survival:{duration:90}}),3000);assert.equal(score({speed:{taps:70}}),1000);
assert.equal(better('survival',{duration:90,taps:500},{duration:90,taps:499}),true);assert.equal(better('survival',{duration:85,taps:600},{duration:90,taps:499}),false);
const gate=new TouchGate();assert.equal(gate.down(1),true);assert.equal(gate.down(2),false);gate.up(2);assert.equal(gate.down(3),false);gate.up(1);gate.up(3);assert.equal(gate.down(4),true);gate.clear();assert.equal(gate.ids.size,0);
let g=100;const history=[];for(let i=0;g>0;i++){g=gauge(g,target(i),20);history.push(g);assert.ok(i<100)}assert.deepEqual(history,[100,100,100,76,52,28,0]);
console.log('PASS: 터치 재무장, 구간 목표, 게이지, 종합 점수, 생존 동점, 35초 생존 시뮬레이션');

const old={name:'일꾼',player:'same-player',secret:'same-secret',energy:2530,best:{speed:{taps:70}},queue:[{id:'old'}]};assert.equal(resetRankingState(old),true);assert.equal(old.energy,2530);assert.equal(old.player,'same-player');assert.equal(old.secret,'same-secret');assert.deepEqual(old.best,{});assert.deepEqual(old.queue,[]);assert.equal(old.previousRankingBest.speed.taps,70);old.best.speed={taps:12};assert.equal(resetRankingState(old),false);assert.equal(old.best.speed.taps,12);console.log('PASS: ranking reset preserves village and identity, runs only once');
