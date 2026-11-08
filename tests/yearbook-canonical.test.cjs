const test=require('node:test');
const assert=require('node:assert/strict');
const {makeLoader}=require('./loader.cjs');
const {DatabaseSync,media,platform,boot}=require('./native-harness.cjs');
const load=makeLoader(),{createExplore}=load('lib/pictopia/explore.ts'),{emptyIndex}=load('lib/pictopia/adventures.ts');
async function fixture(mapping) {
  const db=new DatabaseSync(':memory:');
  const rows=Array.from({length:20},(_,i)=>media(`p${i}`,{created:new Date(2023,0,i+1,12).getTime(),month:'2023-01',day:`01-${String(i+1).padStart(2,'0')}`,...(i<2?{decision:'delete'}:{})}));
  const p=platform({library:rows.map(row=>row.id)}),app=await boot(db,p);
  const ids=rows.slice(0,18).map(row=>row.id);
  const meta=(id,openedAt)=>({version:1,id,kind:'year',source:'year:2023',hint:{title:'The Yearbook',detail:'2023'},count:18,createdAt:1,startedAt:10,openedAt,chosen:true});
  const session=(position,mark)=>({...createExplore(ids,1),review:true,activeId:ids[position],revision:15,records:Object.fromEntries(ids.slice(0,position).map(id=>[id,{encountered:true,discarded:id===mark,queued:id===mark,unavailable:false,changedAt:20}])),history:[{id:mark,direction:'left'}]});
  await app.storage.put(rows,{
    'adventures:v1':{...emptyIndex(),started:['older-13','recent-11'],parked:['older-13','recent-11']},
    'adventure:older-13':meta('older-13',100),'adventure:older-13:explore':session(12,'p0'),
    'adventure:recent-11':meta('recent-11',200),'adventure:recent-11:explore':session(10,'p1'),
    'activity:adventure:older-13:explore':100,'activity:adventure:recent-11:explore':200,
    ...(mapping?{'yearbookActive:v1':mapping}:{}),
  });
  const services=makeLoader({...p.mocks,'./repository':app,'./media':{mediaService:app.mediaService}});
  return {db,p,app,services,store:services('services/adventures.ts').adventureStore};
}

test('two saved 2023 journeys resolve to one canonical Continue at the most recently used cursor, not the furthest',async()=>{
  const f=await fixture();
  try {
    const keys=['adventure:older-13','adventure:older-13:explore','adventure:recent-11','adventure:recent-11:explore','adventures:v1'];
    const before=await Promise.all(keys.map(key=>f.app.storage.getValue(key)));
    const mediaBefore=await Promise.all(['p0','p1'].map(id=>f.app.storage.get(id)));
    const selected=await f.store.yearbooks();
    assert.equal(selected.length,1);assert.equal(selected[0].adventure.id,'recent-11');
    assert.equal(selected[0].session.ids.indexOf(selected[0].session.activeId)+1,11);
    assert.deepEqual(await f.app.storage.getValue('yearbookActive:v1'),{'2023':'recent-11'});
    const [a,b]=await Promise.all([f.store.choose({kind:'year',year:'2023'},1),f.store.choose({kind:'year',year:'2023'},77)]);
    assert.equal(a.id,'recent-11');assert.equal(b.id,a.id);
    assert.deepEqual(await Promise.all(keys.map(key=>f.app.storage.getValue(key))),before,'original snapshots, history and indexes stay intact');
    assert.deepEqual(await Promise.all(['p0','p1'].map(id=>f.app.storage.get(id))),mediaBefore,'pending marks and encounter timestamps are untouched');
    assert.equal((await f.app.storage.stats()).pending,2);assert.deepEqual(f.p.requests,[]);
  } finally {f.db.close();}
});

test('Home and Explore use the same single canonical year, while hidden snapshots remain stored and restorable',async()=>{
  const f=await fixture();
  try {
    assert.deepEqual((await f.store.resumable()).map(row=>row.adventure.id),['recent-11']);
    assert.deepEqual((await f.store.unfinished()).map(row=>row.adventure.id),['recent-11']);
    assert.deepEqual((await f.app.storage.getValue('adventures:v1')).parked,['older-13','recent-11']);
    const explorer=f.services('services/explore.ts').exploreStoreFor('adventure:older-13:explore');
    await explorer.change({type:'restore',id:'p0'});
    assert.equal((await f.app.storage.get('p0')).decision,undefined);assert.equal((await f.app.storage.get('p1')).decision,'delete');
    assert.equal((await f.store.yearbooks())[0].adventure.id,'recent-11','restoration never changes the selected journey');assert.deepEqual(f.p.requests,[]);
  } finally {f.db.close();}
});

test('an existing valid canonical choice remains stable even if another old snapshot has newer activity',async()=>{
  const f=await fixture({'2023':'older-13'});
  try {
    assert.equal((await f.store.yearbooks())[0].adventure.id,'older-13');
    assert.equal((await f.store.choose({kind:'year',year:'2023'},4)).id,'older-13');
    assert.equal((await f.store.resumable()).length,1);
  } finally {f.db.close();}
});

test('a missing canonical target is repaired from saved snapshots without creating another journey',async()=>{
  const f=await fixture({'2023':'missing'});
  try {
    assert.equal((await f.store.choose({kind:'year',year:'2023'},9)).id,'recent-11');
    assert.deepEqual(await f.app.storage.getValue('yearbookActive:v1'),{'2023':'recent-11'});
    assert.equal((await f.store.yearbooks()).length,1);
    assert.equal((await f.app.storage.getValue('adventures:v1')).parked.length,2);
  } finally {f.db.close();}
});

test('a failed canonical-index repair cannot silently start a fresh year',async()=>{
  const f=await fixture();
  try {
    const storage={...f.app.storage,setValue:async(key,value)=>{if(key==='yearbookActive:v1')throw Error('write failed');return f.app.storage.setValue(key,value);}};
    const services=makeLoader({...f.p.mocks,'./repository':{...f.app,storage},'./media':{mediaService:f.app.mediaService}});
    await assert.rejects(services('services/adventures.ts').adventureStore.choose({kind:'year',year:'2023'},8),/write failed/);
    assert.equal(await f.app.storage.getValue('yearbookActive:v1'),undefined);
    assert.equal((await f.app.storage.getValue('adventures:v1')).parked.length,2);assert.deepEqual(f.p.requests,[]);
  } finally {f.db.close();}
});
