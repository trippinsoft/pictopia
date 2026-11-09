const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {makeLoader}=require('./loader.cjs');
const {hooks,textOf}=require('./hook-harness.cjs');
const {DatabaseSync,media,platform,boot}=require('./native-harness.cjs');
const load=makeLoader(), X=load('lib/pictopia/explore.ts');
const {ReviewState}=load('lib/pictopia/review-state.ts');
const {ExploreFeedController}=load('lib/pictopia/explore-feed-controller.ts');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const base=()=>({...X.createExplore(['a','b','c']),review:true});
const mark=id=>s=>({type:'discard',id,revision:s.revision,direction:'left'});
function findAll(node,type){if(!node||typeof node!=='object')return[];return[node.type===type?node:null,...[node.props?.children].flat(Infinity).flatMap(child=>findAll(child,type))].filter(Boolean);}

test('marks project immediately; late earlier acknowledgements never erase later marks or move the cursor',()=>{
  const state=new ReviewState(),s=base();state.load(s);
  const one=state.enqueue(mark('a'));assert.equal(state.value.records.a.queued,true);
  const two=state.enqueue(mark('b'));assert.equal(state.value.records.b.queued,true);
  const first=X.reduceExplore(s,mark('a')(s)),second=X.reduceExplore(first,mark('b')(first));
  state.settle(two,second);state.settle(one,first);
  assert.equal(state.value.activeId,'c');assert.equal(state.value.records.a.queued,true);assert.equal(state.value.records.b.queued,true);
  assert.deepEqual(state.value.ids,['a','b','c']);assert.deepEqual(X.exploreFeed(state.value),['a','b','c']);
});

test('Restore is immediate, idempotent and preserves exploration; failure rolls back just that intent',()=>{
  const state=new ReviewState(),s=X.reduceExplore(base(),mark('a')(base()));state.load(s);
  const restore=state.enqueue({type:'restore',id:'a'});
  assert.equal(state.value.records.a.queued,false);assert.equal(state.value.activeId,'b');assert.equal(X.exploreCounts(state.value).explored,1);
  const page=state.enqueue(c=>({type:'page',id:c.activeId,revision:c.revision,toId:'c',availableIds:c.ids}));
  state.settle(restore);assert.equal(state.value.records.a.queued,true);assert.equal(state.value.activeId,'c');
  const saved=X.reduceExplore(s,{type:'page',id:s.activeId,revision:s.revision,toId:'c',availableIds:s.ids});state.settle(page,saved);
  const again=state.enqueue({type:'restore',id:'a'});const repeat=state.enqueue({type:'restore',id:'a'});
  assert.equal(state.value.records.a.queued,false);assert.equal(state.value.history.length,0);
  state.settle(again,X.reduceExplore(saved,{type:'restore',id:'a'}));state.settle(repeat,state.value);
  assert.equal(state.value.activeId,'c');assert.equal(X.exploreCounts(state.value).explored,2,'scrolling past b reviewed it');
});

test('end boundary proves completion independently of a lagging cursor and pending seen writes, without inventing exploration',()=>{
  let s=base();s=X.reduceExplore(s,{type:'seen',id:'a'});
  const done=X.reduceExplore(s,{type:'finish',boundary:{startedAt:s.startedAt,endpoint:'c'}});
  assert.equal(done.finished,true);assert.equal(X.exploreCounts(done).explored,1);
  assert.equal(X.reduceExplore(s,{type:'finish',boundary:{startedAt:s.startedAt-1,endpoint:'c'}}),s);
  assert.equal(X.reduceExplore(s,{type:'finish',boundary:{startedAt:s.startedAt,endpoint:'b'}}),s);
});

test('review hook exposes a mark before storage, hydrates one snapshot, and refreshes only after leaving',async()=>{
  let saved=base(),release;const gate=new Promise(resolve=>release=resolve);let tail=Promise.resolve(),reads=0,refreshes=0;
  const store={load:async()=>saved,change:intent=>{const work=tail.then(async()=>{await gate;saved=X.reduceExplore(saved,typeof intent==='function'?intent(saved):intent);return saved;});tail=work;return work;}};
  const h=hooks('components/pictopia/use-explore.ts','useExplore',{
    'react-native':{AppState:{addEventListener:()=>({remove(){}})}},
    './provider':{usePictopia:()=>({ready:true,busy:false,revision:0,refresh:async()=>{refreshes++}})},
    '@/services/explore':{exploreStore:store,exploreStoreFor:()=>store},
    '@/services/storage':{storage:{get:async id=>{reads++;return media(id)}}},
  },['adventure:quality:explore']);
  h.render();await tick();let view=h.render();assert.equal(view.media.a.id,'a');
  const writing=view.change(mark('a'));view=h.render();assert.equal(view.session.records.a.queued,true);assert.equal(view.getSession().records.a.queued,true);
  assert.equal(saved.records.a,undefined);assert.equal(refreshes,0);assert.equal(reads,3);
  h.unmount();release();await writing;assert.equal(saved.records.a.queued,true);assert.ok(refreshes>=1);
});

test('full SQLite journey: mark/back/Restore, exit at 15 then 8, resume, complete 20 + 5 without deleting',async()=>{
  const db=new DatabaseSync(':memory:');
  const rows=Array.from({length:25},(_,i)=>{const created=new Date(2020,0,i+1,12).getTime();return media(`p${i}`,{created,modified:created,month:'2020-01',day:`01-${String(i+1).padStart(2,'0')}`});});
  const p=platform({library:rows.map(m=>m.id)});let app=await boot(db,p);await app.storage.put(rows);
  let services=makeLoader({...p.mocks,'./repository':app,'./media':{mediaService:app.mediaService}});
  const {adventureStore,adventureSessionKey}=services('services/adventures.ts');
  const a=await adventureStore.choose({kind:'year',year:'2020'},71);await adventureStore.open(a.id);
  let store=services('services/explore.ts').exploreStoreFor(adventureSessionKey(a.id));
  const state=new ReviewState();state.load(await store.load());let tail=Promise.resolve(),endCalls=0;
  const save=intent=>{const token=state.enqueue(intent);const task=store.change(intent).then(saved=>{state.settle(token,saved);return saved;});tail=task;return task;};
  const ids=state.value.ids;
  const controller=new ExploreFeedController({read:()=>state.value,pages:()=>[...X.exploreFeed(state.value),'end'],completionPage:true,save,
    scrollTo(){},onPage(){},onBusy(){},onError:message=>assert.fail(message),onFeed(){},prepare:async()=>{},
    onEnd:()=>{endCalls++;void save({type:'finish',boundary:{startedAt:state.value.startedAt,endpoint:ids.at(-1)}});}
  },state.value.activeId);
  controller.jump(ids[7],ids);await tail;
  const writing=controller.discard(ids[7],'left',Promise.resolve(),Promise.resolve());
  assert.equal(state.value.records[ids[7]].queued,true,'marked state is immediate, before persistence');
  await writing;assert.equal(state.value.activeId,ids[8]);
  const restoring=save({type:'restore',id:ids[7]});assert.equal(state.value.records[ids[7]].queued,false);await restoring;controller.jump(ids[7],ids);await tail;assert.equal(state.value.activeId,ids[7]);
  controller.flushPosition(14,ids);await tail;assert.equal((await store.load()).activeId,ids[14]);
  controller.flushPosition(7,ids);await tail;
  app=await boot(db,p);services=makeLoader({...p.mocks,'./repository':app,'./media':{mediaService:app.mediaService}});store=services('services/explore.ts').exploreStoreFor(adventureSessionKey(a.id));
  assert.equal((await store.load()).activeId,ids[7]);assert.equal((await store.load()).ids.length,20);
  assert.equal((await adventureStore.resumable()).find(slot=>slot.adventure.id===a.id).session.activeId,ids[7], 'Home reads the exact same saved cursor');
  for(const id of ids)await store.change({type:'seen',id,displayedAt:Date.now()});
  await store.change(c=>({type:'discard',id:ids[0],revision:c.revision,direction:'right'}));
  state.load(await store.load());controller.jump(ids.at(-1),ids);await tail;controller.next(ids);await tail;assert.equal(endCalls,1,'crossing the final boundary commits directly to the single completion destination');
  await adventureStore.finish(a.id);assert.equal((await adventureStore.segmentStatus(a.id)).nextCount,5);
  await adventureStore.continue(a.id);const second=await store.load();assert.equal(second.ids.length,5);assert.ok(second.ids.every(id=>!ids.includes(id)));
  for(const id of second.ids)await store.change({type:'seen',id,displayedAt:Date.now()});
  await store.change({type:'finish',boundary:{startedAt:second.startedAt,endpoint:second.ids.at(-1)}});
  await adventureStore.finish(a.id);await adventureStore.finish(a.id);
  assert.equal((await adventureStore.segmentStatus(a.id)).complete,true);assert.equal((await app.storage.getValue('adventures:v1')).finished,1);
  assert.equal((await app.storage.get(ids[0])).decision,'delete');assert.equal((await app.storage.stats()).pending,1);assert.deepEqual(p.requests,[]);db.close();
});

function completion(statusPromise, extra={}) {
  const a={version:1,id:'quality',kind:'year',source:'year:2020',segment:0};
  const photoIds=Array.from({length:20},(_,i)=>`q${i}`);
  return hooks('components/pictopia/adventure-finish.tsx','AdventureFinish',{
    'react-native':{View:'View',ScrollView:'Scroll',Pressable:'Pressable'},'react-native-safe-area-context':{SafeAreaView:'Safe'},
    './navigation-header':{ScreenHeader:'Header'},'./media-image':{MediaImage:'Media'},'./ui':{Button:'Button',Loading:'Loading',Text:'Text'},
    '@/services/adventures':{adventureStore:{segmentStatus:()=>statusPromise,finish:async()=>({ask:false}),continue:async()=>a}},
    '@/services/badges':{badgeStore:{evaluate:async()=>({})}},
  },{adventure:a,photoIds,explored:20,marked:3,unavailable:0,pending:false,onDone(){},onContinueSegment(){},onReview(){},onBackToPhotos(){},onDeleteNow(){},...extra});
}
const shot=(id)=>({id,type:'photo',width:4000,height:3000,duration:0,size:2_000_000});

test('completion waits for scope facts, then shows % reviewed, kept and discarded, and Delete N now first',async()=>{
  let resolve;const h=completion(new Promise(done=>resolve=done),{discarded:[shot('q1'),shot('q2'),shot('q3')]});
  try {let tree=h.render();assert.equal(findAll(tree,'Loading').length,1);assert.equal(findAll(tree,'Button').length,0);
    resolve({complete:false,total:25,explored:18,nextCount:7,milestone:50});await tick();tree=h.render();
    assert.deepEqual(findAll(tree,'Button').map(n=>n.props.children),['Delete 3 now','Keep going: 7 more','Done']);
    assert.match(textOf(tree),/100% reviewed/);
    assert.match(textOf(tree),/17 kept · 3 discarded \(6 MB\)/);
    assert.match(textOf(tree),/Back to photos/);
    assert.doesNotMatch(textOf(tree),/deleted|saved|freed/i,'discarded photos are never claimed as deleted');
  }finally{h.unmount();}
});

test('a finished set with nothing discarded offers Done, and Back to photos',async()=>{
  const h=completion(Promise.resolve({complete:true,total:25,explored:25,nextCount:0,milestone:100}),{marked:0});
  try{h.render();await tick();const tree=h.render();assert.deepEqual(findAll(tree,'Button').map(n=>n.props.children),['Done']);assert.match(textOf(tree),/100% reviewed/);assert.match(textOf(tree),/20 photos kept/);assert.match(textOf(tree),/Back to photos/);}finally{h.unmount();}
});

test('selection screens have no transient recap producers or hosts; Progress permanently exposes just the two Pit Stops',()=>{
  for(const file of ['components/pictopia/adventure-review.tsx','components/pictopia/navigation-header.tsx','components/pictopia/playful.tsx','app/on-this-day.tsx'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/showRecap|RecapHost/);
  // Pit Stops moved from Explore to Progress as a "Take a break" reward (audit area 7).
  const progress=fs.readFileSync('app/(tabs)/progress.tsx','utf8');assert.match(progress,/<SectionTitle>Take a break<\/SectionTitle>/);assert.match(progress,/<PitStopMenu compact/);
  const explore=fs.readFileSync('app/(tabs)/explore.tsx','utf8');assert.doesNotMatch(explore,/PitStopMenu/);
  assert.deepEqual(load('lib/pictopia/pitstops.ts').ACTIVE_PIT_STOPS,['memoryMatch','whichFirst']);
  for(const file of ['app/pit-stop.tsx','components/pictopia/memory-match.tsx'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/adventureStore|useAllowance|usePhotoEncounter|Review these photos/);
  assert.match(fs.readFileSync('components/pictopia/adventure-review.tsx','utf8'),/onEnd=\{finish\}/);
  assert.doesNotMatch(fs.readFileSync('components/pictopia/adventure-review.tsx','utf8'),/Your saved place changed|End of adventure/);
});
