const test = require('node:test');
const assert = require('node:assert/strict');
const { makeLoader } = require('./loader.cjs');
const { DatabaseSync, media, platform, boot } = require('./native-harness.cjs');
const load = makeLoader();
const X = load('lib/pictopia/explore.ts');
const { ExploreFeedController } = load('lib/pictopia/explore-feed-controller.ts');
const { journeyMilestone, permittedHistoryDate } = load('lib/pictopia/journey-progress.ts');
const { localDate, addDays, presentAsset } = load('lib/pictopia/daily.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));

async function fixture(count = 25) {
  const db = new DatabaseSync(':memory:');
  const rows = Array.from({length:count}, (_,i) => { const created = new Date(2020,0,1+i,12).getTime(); return media(`p${i}`,{created,modified:created,month:'2020-01',day:`01-${String(1+i).padStart(2,'0')}`}); });
  const p = platform({library:rows.map(m=>m.id)}), app = await boot(db,p);
  await app.storage.put(rows);
  const service = makeLoader({...p.mocks, './repository':app, './media':{mediaService:app.mediaService}});
  const { adventureStore, adventureSessionKey } = service('services/adventures.ts');
  return {db,rows,app,p,adventureStore,adventureSessionKey,explore:service('services/explore.ts')};
}
async function completeSegment(store) {
  let s = await store.load();
  for (const id of s.ids) await store.change({type:'seen',id,displayedAt:Date.now()});
  s = await store.load();
  return store.change({type:'finish',expectedRevision:s.revision,endId:s.ids.at(-1)});
}

test('25-photo Yearbook continues as 18 + 7 without repeats, retains its ID, and awards milestones once', async () => {
  const f = await fixture();
  try {
    const a = await f.adventureStore.choose({kind:'year',year:'2020'},11);
    await f.adventureStore.open(a.id);
    const store = f.explore.exploreStoreFor(f.adventureSessionKey(a.id));
    const first = await completeSegment(store);
    assert.equal(first.ids.length,18);
    let status = await f.adventureStore.segmentStatus(a.id);
    assert.deepEqual([status.explored,status.total,status.nextCount,status.milestone,status.complete],[18,25,7,50,false]);
    await f.adventureStore.finish(a.id);
    assert.equal((await f.adventureStore.segmentStatus(a.id)).milestone,undefined);
    assert.equal((await f.adventureStore.get(a.id)).finishedAt,undefined);
    // Returning to a completed segment opens the next one in the same context.
    const next = await f.adventureStore.choose({kind:'year',year:'2020'},99);
    assert.equal(next.id,a.id);
    const second = await store.load();
    assert.equal(second.ids.length,7);
    assert.ok(second.ids.every(id=>!first.ids.includes(id)));
    assert.deepEqual((await f.app.storage.getValue(next.segmentKeys[0])).ids,first.ids);
    await completeSegment(store);
    status = await f.adventureStore.segmentStatus(a.id);
    assert.deepEqual([status.explored,status.total,status.nextCount,status.milestone,status.complete],[25,25,0,100,true]);
    await f.adventureStore.finish(a.id); await f.adventureStore.finish(a.id);
    assert.ok((await f.adventureStore.get(a.id)).finishedAt);
    assert.equal((await f.app.storage.getValue('adventures:v1')).finished,1);
    assert.deepEqual(f.p.requests,[]);
  } finally { f.db.close(); }
});

test('unavailable final segment items prevent false whole-Adventure completion and are not marked or credited', async () => {
  const f = await fixture(9);
  try {
    const a = await f.adventureStore.choose({kind:'year',year:'2020'},1);
    const store = f.explore.exploreStoreFor(f.adventureSessionKey(a.id));
    let s = await store.load();
    await store.change({type:'seen',id:s.ids.at(-1),displayedAt:Date.now()});
    s = await store.load(); await store.change({type:'finish',expectedRevision:s.revision,endId:s.ids.at(-1)});
    await f.adventureStore.finish(a.id);
    const status = await f.adventureStore.segmentStatus(a.id);
    assert.equal(status.complete,false); assert.equal(status.explored,1);
    assert.equal((await f.adventureStore.get(a.id)).finishedAt,undefined);
    assert.equal((await f.app.storage.stats()).pending,0);
  } finally {f.db.close();}
});

test('exit/background flush persists 15 then backtracked 8 in serialized order despite slow older writes', async () => {
  const ids = Array.from({length:18},(_,i)=>`p${i+1}`);
  let s = {...X.createExplore(ids),review:true}, release;
  let tail = new Promise(resolve=>{release=resolve});
  const c = new ExploreFeedController({read:()=>s,pages:()=>[...ids,'end'],completionPage:true,
    save:action=>{const work=tail.then(()=>s=X.reduceExplore(s,typeof action==='function'?action(s):action));tail=work;return work;},
    scrollTo(){},onPage(){},onBusy(){},onError(){assert.fail('save failure')},onFeed(){},prepare:async()=>{}
  },s.activeId);
  c.flushPosition(14,ids); assert.equal(c.activeId,'p15');
  c.flushPosition(7,ids); assert.equal(c.activeId,'p8');
  release(); await tick(); await tail;
  assert.equal(s.activeId,'p8'); assert.equal(s.highestPosition,14);
  assert.equal(X.exploreCounts(s).explored,14,'reaching photo 15 scrolled past 14; going back counts nothing new');
});

test('marks keep their slot in the feed; Restore un-fades the photo in place without moving review', () => {
  let s = {...X.createExplore(Array.from({length:18},(_,i)=>`p${i+1}`)),review:true};
  s=X.reduceExplore(s,{type:'discard',id:'p8',revision:s.revision,direction:'right'});
  assert.equal(s.activeId,'p9');assert.equal(s.ids[7],'p8');assert.equal(s.ids.length,18);
  assert.equal(X.exploreFeed(s)[7],'p8');assert.equal(s.records.p8.queued,true);
  const explored=X.exploreCounts(s).explored;
  s=X.reduceExplore(s,{type:'restore',id:'p8'});
  assert.equal(X.exploreFeed(s)[7],'p8');assert.equal(s.activeId,'p9');assert.equal(X.exploreCounts(s).explored,explored);
  assert.equal(X.reduceExplore(s,{type:'restore',id:'p8'}),s,'second restore is inert');
});

test('milestones use distinct counts, select the highest newly crossed threshold, and never revoke recognition', () => {
  assert.deepEqual(journeyMilestone(61,120,[]),{crossed:[25,50],highest:50});
  assert.deepEqual(journeyMilestone(61,120,[25,50]),{crossed:[],highest:undefined});
  assert.deepEqual(journeyMilestone(61,300,[25,50]),{crossed:[],highest:undefined});
  assert.equal(journeyMilestone(9,9,[]).highest,undefined);
});

test('history gate includes today plus precisely seven past local calendar dates, never future dates', () => {
  for (const today of ['2026-01-01','2024-03-01','2026-11-06']) {
    assert.equal(permittedHistoryDate(today,today,false),true);
    for(let back=1;back<=7;back++) {assert.equal(permittedHistoryDate(addDays(today,-back),today,false),false);assert.equal(permittedHistoryDate(addDays(today,-back),today,true),true);}
    assert.equal(permittedHistoryDate(addDays(today,-8),today,true),false);
    assert.equal(permittedHistoryDate(addDays(today,1),today,true),false);
  }
});

test('exact-date curation never substitutes February 28 for February 29', () => {
  const {curate}=load('lib/pictopia/curation.ts');
  const rows=[media('leap',{created:new Date(2020,1,29,12).getTime(),day:'02-29',month:'2020-02'}),media('near',{created:new Date(2021,1,28,12).getTime(),day:'02-28',month:'2021-02'})];
  const context={now:new Date(2024,1,29,12).getTime(),seed:1,explored:new Set()};
  assert.deepEqual(curate({kind:'day',source:'day:02-29',pool:rows},context).ids,['leap']);
  assert.equal(curate({kind:'day',source:'day:02-29',pool:rows.slice(1)},context),undefined);
});

test('150 distinct daily items are shared across any scope, revisits are free, and local midnight resets', () => {
  const now = new Date(2026,10,6,23,59).getTime();let state;
  for(let i=0;i<150;i++) {const r=presentAsset(state,`scope-independent-${i}`,150,false,now);assert.equal(r.allowed,true);state=r.state;}
  assert.equal(presentAsset(state,'scope-independent-8',150,false,now).allowed,true);
  assert.equal(presentAsset(state,'on-this-day-extra',150,false,now).allowed,false);
  assert.equal(presentAsset(state,'video-extra',150,false,now).allowed,false);
  assert.equal(presentAsset(state,'pro-extra',150,true,now).allowed,true);
  const next=presentAsset(state,'tomorrow',150,false,new Date(2026,10,7,0,0).getTime());
  assert.equal(next.allowed,true);assert.equal(next.state.counted.length,1);assert.notEqual(localDate(now),next.state.date);
});

test('archived segment marks remain in the canonical queue and can be restored after continuing', async () => {
  const f=await fixture();
  try {
    const a=await f.adventureStore.choose({kind:'year',year:'2020'},7);await f.adventureStore.open(a.id);
    const store=f.explore.exploreStoreFor(f.adventureSessionKey(a.id));let s=await store.load();const marked=s.ids[0];
    await store.change(c=>({type:'discard',id:marked,revision:c.revision,direction:'left'}));
    await completeSegment(store);await f.adventureStore.finish(a.id);
    await f.adventureStore.continue(a.id);
    const entries=await f.adventureStore.setAside(),entry=entries.find(row=>row.id===marked);
    assert.ok(entry);assert.ok(entry.keys.some(key=>key.includes(':segment:')));
    await f.adventureStore.restore(entry);
    assert.equal((await f.app.storage.get(marked)).decision,undefined);
    assert.equal((await f.adventureStore.setAside()).some(row=>row.id===marked),false);
    assert.equal((await f.adventureStore.progress()).setAside,0);
    assert.deepEqual(f.p.requests,[]);
  } finally {f.db.close();}
});

test('history service refuses Free history and future dates even when called without the date navigator', async () => {
  const f=await fixture(1);
  try {
    const today=localDate(Date.now());
    await assert.rejects(f.adventureStore.choose({kind:'day',date:addDays(today,-1)},1,false),/Pictopia\+/);
    await assert.rejects(f.adventureStore.choose({kind:'day',date:addDays(today,1)},1,true),/seven days/);
    await f.app.storage.put([],{'adventure:past':{version:1,id:'past',kind:'day',source:'day:01-01',historyPro:true},'adventure:past:explore':{...X.createExplore(['p0']),review:true}});
    await assert.rejects(f.adventureStore.open('past',false),/Pictopia\+/);
    assert.equal(await f.adventureStore.validPhotoOffer('past',false),false);
    assert.equal(await f.adventureStore.validPhotoOffer('past',true),true);
  } finally {f.db.close();}
});
