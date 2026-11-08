const test=require('node:test');
const assert=require('node:assert/strict');
const {makeLoader}=require('./loader.cjs');
const {homeSpacing}=makeLoader()('lib/pictopia/home-spacing.ts');

test('Home uses roomy spacing when content and deletion pill fit',()=>{
  const s=homeSpacing(900,662,true,true);
  assert.equal(s.stats,24);assert.equal(s.note,40);assert.equal(s.pending,32);
  assert.ok(662+s.total<=900);
});

test('a near-fitting iPhone layout tightens gaps enough to reveal the whole pending pill',()=>{
  const s=homeSpacing(802,662,true,true);
  assert.ok(662+s.total<=802);
  assert.ok(s.note>=24);assert.ok(s.pending>=16);assert.ok(s.bottom>=16);
  assert.ok(s.note<40);
});

test('small viewports and large text keep minimum separation and overflow for scrolling',()=>{
  const s=homeSpacing(550,750,true,true);
  assert.equal(s.note,24);assert.equal(s.pending,16);assert.equal(s.bottom,16);
  assert.ok(750+s.total>550,'content stays naturally sized instead of being clipped or shrunk');
});

test('spacing responds to resizing, optional Resume/pending items, and measured message changes',()=>{
  const wide=homeSpacing(900,662,true,true),tight=homeSpacing(802,662,true,true),long=homeSpacing(802,702,true,true);
  assert.ok(wide.total>tight.total);assert.ok(long.total<=tight.total);
  assert.equal(homeSpacing(900,662,false,false).total,wide.total-wide.resume-wide.pending);
  for(const value of Object.values(tight))assert.equal(value%4,0);
  assert.equal(homeSpacing(0,0,true,true).total,wide.total,'initial measurement starts with the existing roomy rhythm');
});
