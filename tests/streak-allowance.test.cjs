const test = require('node:test');
const assert = require('node:assert/strict');
const { makeLoader } = require('./loader.cjs');
const d = makeLoader()('lib/pictopia/daily.ts');
const at = day => new Date(2026, 10, day, 12).getTime();
const qualify = (state, day) => d.recordActivity(state, [{type:'deleted', count:1}], at(day));
test('completed days establish 100/125/150/175/200, capped; today cannot advance its tier', () => {
  let a;
  for(let day=1;day<=8;day++) {
    assert.equal(d.streakAllowance(a, [], at(day)), 100 + Math.min(4, day-1)*25);
    a=qualify(a,day);
    assert.equal(d.streakAllowance(a, [], at(day)), 100 + Math.min(4, day-1)*25);
  }
  assert.equal(d.streakAllowance(a, [], at(10)),100,'missed day resets');
});
test('existing streaks qualify immediately and restores bridge a missed day', () => {
  let a; for(const day of [1,2,3]) a=qualify(a,day);
  assert.equal(d.streakAllowance(a,[],at(4)),175);
  assert.equal(d.streakAllowance(a,[],at(5)),100);
  const restores=d.applyRestore(a,[],at(5));
  assert.equal(d.streakAllowance(a,restores,at(5)),200);
  assert.equal(d.streakAllowance(a,restores,at(6)),100,'restore never qualifies today automatically');
});
test('mixed photo/video views qualify and repeated views cannot increase tier',()=>{
  let a=d.recordActivity(undefined, Array.from({length:10},(_,i)=>({type:'view',id:String(i),video:i%2===0,firstTime:true})),at(1));
  assert.equal(d.streakAllowance(a,[],at(2)),125);
  a=d.recordActivity(a,[{type:'view',id:'0',video:true,firstTime:false}],at(1));
  assert.equal(d.streakAllowance(a,[],at(1)),100);
  assert.equal(d.streakAllowance(a,[],at(2)),125);
});
