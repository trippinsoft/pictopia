const test=require('node:test');
const assert=require('node:assert/strict');
const {makeLoader}=require('./loader.cjs');
const {homeSpacing}=makeLoader()('lib/pictopia/home-spacing.ts');

test('Home uses roomy spacing when content and deletion pill fit',()=>{
  const s=homeSpacing(900,580,false,true);
  assert.equal(s.stats,20);assert.equal(s.note,32);assert.equal(s.pending,28);
  assert.ok(580+s.total<=900);
});

test('a near-fitting iPhone layout tightens gaps enough to reveal the whole pending pill',()=>{
  const s=homeSpacing(760,620,false,true);
  assert.ok(620+s.total<=760);
  assert.ok(s.note>=20);assert.ok(s.pending>=16);assert.ok(s.bottom>=16);
  assert.ok(s.note<32);
});

test('small viewports and large text keep minimum separation and overflow for scrolling',()=>{
  const s=homeSpacing(550,750,false,true);
  assert.equal(s.note,20);assert.equal(s.pending,16);assert.equal(s.bottom,16);
  assert.ok(750+s.total>550,'content stays naturally sized instead of being clipped or shrunk');
});

test('spacing responds to resizing, optional pending items, and measured message changes',()=>{
  const wide=homeSpacing(900,580,false,true),tight=homeSpacing(760,620,false,true),long=homeSpacing(760,660,false,true);
  assert.ok(wide.total>tight.total);assert.ok(long.total<=tight.total);
  assert.equal(homeSpacing(900,580,false,false).total,wide.total-wide.pending);
  for(const value of Object.values(tight))assert.equal(value%4,0);
  assert.equal(homeSpacing(0,0,false,true).total,wide.total,'initial measurement starts with the existing roomy rhythm');
});
