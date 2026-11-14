const test=require('node:test'),assert=require('node:assert/strict');
const {makeLoader}=require('./loader.cjs');
const {media}=require('./native-harness.cjs');
const load=makeLoader(),G=load('lib/pictopia/pitstops.ts');
const {orderRoundController}=load('lib/pictopia/order-round.ts');
const {memoryController,memoryGrid}=load('lib/pictopia/memory-match.ts');
const photo=(id,time)=>media(id,{created:time,modified:time});
const day=86400000;

test('ten chronology rounds use 20 distinct photos, prefer wide gaps, and randomize the earlier side',()=>{
  const rows=Array.from({length:30},(_,i)=>photo(String(i),new Date(2010,0,1).getTime()+i*90*day));
  const rounds=G.orderRounds(rows,71);assert.equal(rounds.length,10);assert.equal(new Set(rounds.flatMap(r=>r.ids)).size,20);
  const sides=new Set();for(const r of rounds){sides.add(r.ids.indexOf(r.answer));const [a,b]=r.ids.map(id=>rows.find(m=>m.id===id));assert.ok(Math.abs(a.created-b.created)>=90*day);assert.equal(r.answer,a.created<b.created?a.id:b.id);}assert.equal(sides.size,2);
});

test('short chronology games use only valid unique pairs, accept short reliable gaps and dates before 1970',()=>{
  const rows=[photo('a',new Date(1965,0,1).getTime()),photo('b',new Date(1965,0,2).getTime()),photo('same',new Date(1965,0,2).getTime()),photo('missing',0),photo('bad',NaN),photo('future',Date.now()+day)];
  const rounds=G.orderRounds(rows,3);assert.equal(rounds.length,1);assert.equal(new Set(rounds[0].ids).size,2);
  assert.equal(G.orderRounds([photo('one',100),photo('two',100)],8).length,0);
  assert.equal(G.unavailable('whichFirst',{photos:2,years:1,captureDates:true}),undefined);
});

test('tapping a result cancels automatic progression; Next submits exactly once and obsolete timer callbacks are inert',()=>{
  let id=0;const timers=new Map(),all=[],scores=[];
  const clock={set(fn,delay){all.push(fn);timers.set(++id,{fn,delay});return id;},clear(id){timers.delete(id)}};
  const c=orderRoundController(['a','b'],'a',v=>scores.push(v),clock);
  assert.equal(c.select('b'),true);assert.equal([...timers.values()][0].delay,1800);
  const stale=all.at(-1);assert.equal(c.pause(),true);assert.equal(timers.size,0);stale();assert.deepEqual(scores,[]);
  c.configure(false,true);c.configure(true,true);assert.equal(timers.size,0,'a paused result stays paused across foregrounding');
  c.advance();c.advance();c.select('a');assert.deepEqual(scores,[false]);c.dispose();stale();assert.deepEqual(scores,[false]);
});

test('automatic progression, exit, skip and all ten answer scores remain single-submission transitions',()=>{
  let score=0,total=0;for(let round=0;round<10;round++){
    let fn;const c=orderRoundController(['earlier','later'],'earlier',value=>{if(value!==undefined){total++;if(value)score++;}},{set(callback){fn=callback;return 1;},clear(){}});
    assert.equal(c.select(round<8?'earlier':'later'),true);assert.equal(c.select('earlier'),false);fn();c.advance();c.dispose();fn();
  }
  assert.deepEqual([score,total],[8,10]);
  let called=0,fn;const c=orderRoundController(['a','b'],'a',()=>called++,{set(cb){fn=cb;return 1},clear(){}});c.select('a');c.dispose();fn();assert.equal(called,0);
});

test('Memory Match counts one move per two accepted cards through mismatch, completion and replay',()=>{
  const deck=G.memoryDeck(Array.from({length:4},(_,i)=>media(`p${i}`)),3,4);let state,task;
  const c=memoryController(deck,s=>state=s,()=>{},{set(cb){task=cb;return 1},clear(){}});c.configure({active:true,ready:true,reduced:true,reader:false});
  const ids=[...new Set(deck.map(G.cardPhoto))];
  c.select(`${ids[0]}#a`);c.select(`${ids[1]}#a`);assert.equal(state.moves,0,'second rapid tap is ignored during the first reveal');task();
  c.select(`${ids[1]}#a`);assert.equal(state.moves,1);task();task();task();assert.equal(state.phase,'ready');
  for(const id of ids){c.select(`${id}#a`);task();c.select(`${id}#b`);task();task();}
  assert.equal(state.moves,5);assert.equal(state.phase,'complete');assert.equal(state.matched.length,8);c.dispose();task();
  let replay;const next=memoryController(deck,s=>replay=s,()=>{});next.configure({active:true,ready:true,reduced:false,reader:false});assert.equal(next.select(deck[0]),true);assert.equal(replay.moves,0);next.dispose();
});

test('Memory Match preserves four portrait rows and uses two rows on a normal landscape phone',()=>{
  for(const pairs of [4,6]){
    const portrait=memoryGrid(358,570,pairs);assert.equal(portrait.columns,pairs===4?2:3);assert.ok(portrait.height<=570);
    const landscape=memoryGrid(720,175,pairs);assert.equal(landscape.columns,pairs);assert.ok(landscape.height<=175);
  }
});

function preparation(sample,{failed=[],fallbackFailed=[]}={}){
  const released=[],requested=[],fallback=[],cache=[];
  const mod=makeLoader({
    'expo-image':{Image:{prefetch:async uri=>{cache.push(uri);return !uri.includes('decode-fail')}}},
    './pitstops':{pitStopStore:{sample:async()=>sample}},
    './review-media':{reviewMedia:{thumbnail:async m=>{requested.push(m.id);if(failed.includes(m.id))throw Error('unavailable');return `thumb:${m.id}`;},releaseThumbnail:uri=>released.push(uri)}},
    './photo-display':{photoDisplay:async m=>{fallback.push(m.id);if(fallbackFailed.includes(m.id))throw Error('offline');return `display:${m.id}`;}},
  })('services/pit-stop-photos.ts');
  return {...mod,released,requested,fallback,cache};
}

test('read-only preparation skips unavailable/decode failures, uses existing cloud fallback and releases only its thumbnails',async()=>{
  const rows=[media('offline'),media('decode-fail'),media('cloud'),...Array.from({length:6},(_,i)=>media(`p${i}`))];
  const before=structuredClone(rows),h=preparation(rows,{failed:['offline','cloud'],fallbackFailed:['offline']});
  const result=await h.preparePitStop('memoryMatch',1,new AbortController().signal,4);
  assert.equal(result.photos.length,4);assert.ok(!result.photos.some(m=>['offline','decode-fail'].includes(m.id)));assert.ok(result.photos.some(m=>m.id==='cloud'));
  assert.deepEqual(h.fallback,['offline','cloud']);assert.deepEqual(rows,before,'preparation never changes asset records');
  result.dispose();assert.ok(h.released.includes('thumb:p0'));assert.ok(!h.released.includes('display:cloud'),'borrowed display files are not deleted/revoked');
});

test('cancelling obsolete photo preparation publishes no result and cleans up owned thumbnails',async()=>{
  const controller=new AbortController(),released=[];let done;
  const h=makeLoader({'expo-image':{Image:{prefetch:async()=>true}},'./pitstops':{pitStopStore:{sample:async()=>[media('a')]}},'./review-media':{reviewMedia:{thumbnail:()=>new Promise(resolve=>done=resolve),releaseThumbnail:uri=>released.push(uri)}},'./photo-display':{photoDisplay:()=>assert.fail('no fallback after cancellation')}})('services/pit-stop-photos.ts');
  const running=h.preparePitStop('memoryMatch',1,controller.signal);await new Promise(resolve=>setImmediate(resolve));controller.abort();done('thumb:a');await assert.rejects(running,/cancelled/);assert.deepEqual(released,['thumb:a']);
});

test('game photos put people and places first and paperwork last, keeping order when asked',()=>{
  const {rankForGame}=load('lib/pictopia/photo-picks.ts');
  const items=['doc','beach','unknown','family','receipt'].map(id=>({id}));
  const picks={doc:{utility:true,score:-1,faces:0},beach:{utility:false,score:0.6,faces:0},family:{utility:false,score:1.8,faces:2},receipt:{utility:true,score:-0.8,faces:0}};
  assert.deepEqual(rankForGame(items,picks,true).map(m=>m.id),['family','beach','unknown','doc','receipt']);
  assert.deepEqual(rankForGame(items,picks,false).map(m=>m.id),['beach','family','unknown','doc','receipt'],'date spread order kept');
  assert.deepEqual(rankForGame(items,{},true).map(m=>m.id),items.map(m=>m.id),'no judgments leave the order unchanged');
});

test('Memory Match skips documents when enough real photos are available',async()=>{
  const rows=['doc1','doc2',...Array.from({length:6},(_,i)=>`p${i}`)].map(id=>media(id));
  const h=makeLoader({
    'expo-image':{Image:{prefetch:async()=>true}},
    './pitstops':{pitStopStore:{sample:async()=>rows}},
    './photo-picks':{assessPhotos:async ids=>Object.fromEntries(ids.map(id=>[id,{utility:id.startsWith('doc'),score:id.startsWith('doc')?-1:1,faces:0}]))},
    './review-media':{reviewMedia:{thumbnail:async m=>`thumb:${m.id}`,releaseThumbnail(){}}},
    './photo-display':{photoDisplay:async m=>`display:${m.id}`},
  })('services/pit-stop-photos.ts');
  const result=await h.preparePitStop('memoryMatch',1,new AbortController().signal,4);
  assert.equal(result.photos.length,4);assert.ok(!result.photos.some(m=>m.id.startsWith('doc')));
});

test('games never use screenshots or saved graphics, even without a screenshot flag',()=>{
  const {cameraPhoto}=load('lib/pictopia/photo-picks.ts');
  for(const name of ['IMG_0001.HEIC','IMG_0002.JPG','DSC_1.jpeg','PXL_2024.dng'])assert.equal(cameraPhoto({name,screenshot:false}),true,name);
  for(const name of ['IMG_0003.PNG','Screenshot 2024-01-01.jpg','Screenshot_20240101.jpg','meme.gif','sticker.webp'])assert.equal(cameraPhoto({name,screenshot:false}),false,name);
  assert.equal(cameraPhoto({name:'IMG_1.HEIC',screenshot:true}),false);
});
