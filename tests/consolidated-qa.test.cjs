const test = require('node:test');
const assert = require('node:assert/strict');
const { makeLoader } = require('./loader.cjs');
const { hooks, textOf } = require('./hook-harness.cjs');
const { DatabaseSync, media, platform, boot } = require('./native-harness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const b = makeLoader()('lib/pictopia/badges.ts');
const zero = Object.fromEntries(b.BADGES.map(d => [d.family,0]));

test('all seven legacy badge claims are archived, not confirmed by their own historical counters', () => {
  const legacy = { version: 1, backfilled: true, earned: Object.fromEntries(b.BADGES.map(d => [d.family,{ tier: d.tiers.length, value: 999999, earnedAt: 1 }])) };
  const r = b.evaluateBadges(legacy,zero,2);
  assert.deepEqual(r.state.earned,{}); assert.deepEqual(r.state.legacy,legacy.earned);
  assert.deepEqual(r.newlyEarned,[]);
  assert.equal(b.BADGES.filter(d => b.badgeView(d,r.state,0).earned).length,0);
  for (const d of b.BADGES) {
    let r = b.evaluateBadges(undefined,{...zero,[d.family]:d.tiers[0]-1},1);
    assert.equal(b.badgeView(d,r.state,d.tiers[0]-1).earned,false);
    r = b.evaluateBadges(r.state,{...zero,[d.family]:d.tiers[0]},2);
    assert.equal(r.state.earned[d.family].tier,1);
    const permanent = b.evaluateBadges(r.state,zero,3);
    assert.equal(permanent.state.earned[d.family].tier,1,'verified historical tiers survive library changes');
  }
});

test('a stale final-discard finish token cannot end a review after a backward page save or Undo', () => {
  const x = makeLoader()('lib/pictopia/explore.ts');
  let s = {...x.createExplore(['a','b','c']),review:true};
  s = x.reduceExplore(s,{type:'page',id:'a',toId:'c',revision:s.revision,availableIds:s.ids});
  s = x.reduceExplore(s,{type:'discard',id:'c',revision:s.revision,direction:'left'});
  const finish = {type:'finish',expectedRevision:s.revision};
  s = x.reduceExplore(s,{type:'page',id:s.activeId,toId:'a',revision:s.revision,availableIds:s.ids});
  assert.equal(x.reduceExplore(s,finish),s);
  s = x.reduceExplore(s,{type:'undo'});
  assert.equal(x.reduceExplore(s,finish),s); assert.notEqual(s.finished,true);
});

test('149 to 150, seven-photo interruption, restart, new local day and Pro keep separate allowance facts', async () => {
  const db = new DatabaseSync(':memory:'), app = await boot(db,platform());
  const p = platform();
  const load = () => makeLoader({...p.mocks,'./repository':app})('services/daily.ts').allowanceStore;
  let store = load(); const now = new Date(2026,10,5,12).getTime();
  for(let i=0;i<147;i++) await store.present(`earlier-${i}`,false,now);
  const ids = Array.from({length:7},(_,i)=>`otd-${i}`);
  for(let i=0;i<3;i++) assert.equal((await store.present(ids[i],false,now)).allowed,true);
  assert.equal((await store.present(ids[3],false,now)).allowed,false);
  assert.equal((await store.present(ids[2],false,now)).left,0,'revisiting at 150 is free');
  store = load(); assert.equal((await store.state(now)).counted.length,150);
  assert.equal((await store.present(ids[3],true,now)).allowed,true,'Pro resumes without changing allowance records');
  assert.equal((await store.state(now)).counted.length,150);
  assert.equal((await store.present(ids[3],false,now+86400000)).left,149);
  db.close();
});

test('scope labels distinguish open-ended session activity, bounded scope percent and adventure position', () => {
  const r = makeLoader()('lib/pictopia/review-flow.ts');
  for(const scope of ['recent','videos','videos-large']) assert.equal(r.reviewProgressLabel(scope,24,3,120,3),'24 reviewed this session');
  assert.equal(r.reviewProgressLabel('album:a',4,3,120,20),'20% of this album explored');
  assert.equal(r.reviewProgressLabel(undefined,2,4,18),'5 of 18');
  assert.match(r.moreCollectionLabel('album:a'),/this album/);
  assert.match(r.limitCopy(150).title,/150 photos and videos/);
});

function video(resolve) {
  const sources = [], events = {}, appEvents = {};
  const player = { status:'idle', currentTime:0, playCalls:0, pauseCalls:0,
    play(){this.playCalls++}, pause(){this.pauseCalls++}, replaceAsync:async uri=>{sources.push(uri)}, addListener:(name,fn)=>{events[name]=fn; return{remove(){}}} };
  const props = { media:media('v',{type:'video',duration:12}),active:true,playing:false,onPlayingChange:value=>{props.playing=value},onReady:()=>{props.ready=true} };
  const h = hooks('components/pictopia/video-page.tsx','VideoPage',{
    'react-native':{ActivityIndicator:'Spinner',View:'View',StyleSheet:{absoluteFill:{}},AppState:{addEventListener:(name,fn)=>{appEvents[name]=fn;return{remove(){}}}}},
    expo:{useEvent:(_,event)=>event==='statusChange'?{status:player.status}:{currentTime:0}},
    'expo-video':{useVideoPlayer:source=>{assert.equal(source,null,'player identity must stay stable during async source replacement');return player},VideoView:'VideoView'},
    './ui':{Icon:'Icon',Text:'Text'}, '@/services/media':{mediaService:{resolve}},
  },props);
  return {h,props,player,sources,events,appEvents};
}

test('video resolves locally without a poster, waits for playback-ready, pauses offscreen and surfaces codec failure', async () => {
  const v = video(async()=>({uri:'file://local.mov'}));
  v.h.render(); v.props.playing=true; v.h.render(); await tick(); v.h.render();
  assert.ok(v.sources.includes('file://local.mov')); assert.equal(v.player.playCalls,0);
  v.player.status='readyToPlay'; v.h.render(); assert.equal(v.player.playCalls,1); assert.equal(v.props.ready,undefined,'playable does not yet prove pixels were displayed');
  const find=node=>node?.type==='VideoView'?node:[node?.props?.children].flat().filter(Boolean).map(find).find(Boolean);
  find(v.h.render()).props.onFirstFrameRender(); assert.equal(v.props.ready,true);
  v.player.status='error'; v.h.render(); assert.match(textOf(v.h.render()),/couldn’t play/);
  v.props.active=false; v.h.render(); assert.equal(v.props.playing,false); assert.ok(v.player.pauseCalls>0);
  v.h.unmount();
});

test('cloud video downloads only after explicit second tap and a late result cannot start a departed player', async () => {
  const calls=[];let resolveCloud;
  const v = video(async(_,options)=>{calls.push(options.download); if(!options.download)throw Error(makeLoader()('services/media-errors.ts').CLOUD_ONLY); return new Promise(resolve=>{resolveCloud=resolve});});
  v.h.render();v.props.playing=true;v.h.render();await tick();
  assert.match(textOf(v.h.render()),/tap to download/);assert.deepEqual(calls,[false]);
  v.props.playing=true;v.h.render();await tick();assert.deepEqual(calls,[false,true]);
  v.props.active=false;v.h.render();resolveCloud({uri:'file://cloud.mov'});await tick();v.h.render();
  assert.ok(!v.sources.includes('file://cloud.mov'));assert.equal(v.player.playCalls,0);
  v.h.unmount();
});

test('native file-size metadata is used without resolving or downloading an original', async()=>{
  let lookups=0;let availableSize=4200000;
  const service=makeLoader({
    'expo-media-library':{getAssetInfoAsync:async()=>{lookups++;throw Error('must not resolve')}},
    'expo-modules-core':{requireOptionalNativeModule:()=>({localAssetSize:async()=>availableSize})},
    'expo-file-system':{File:class{}}, 'react-native':{Platform:{OS:'ios'},Linking:{}},
  })('services/media.native.ts').mediaService;
  assert.equal(await service.size(media('a')),4200000);assert.equal(lookups,0);
  assert.equal(await service.size(media('b',{scan:{size:2400000}})),2400000);
  availableSize=null;assert.equal(await service.size(media('slow-motion',{type:'video'})),undefined);assert.equal(lookups,0,'an unknown metadata size must not trigger a video export');
});

test('20,000-photo SQLite aggregate stays unique, separates video and survives restart', async t=>{
  const db=new DatabaseSync(':memory:'),p=platform();let app=await boot(db,p);
  const rows=Array.from({length:20000},(_,i)=>media(String(i),{firstSeenAt:i<5000?1:undefined,active:i>=1000}));
  await app.storage.put([...rows,media('video',{type:'video',firstSeenAt:1})]);
  const started=performance.now();const first=await app.storage.progress();
  assert.equal(first.explored,5000);assert.equal(first.accessibleExplored,4000);assert.equal(first.accessible,19000);
  t.diagnostic(`Host aggregate: ${Math.round(performance.now()-started)} ms; not a device benchmark`);
  await app.repository.encounter('15000');await app.repository.encounter('15000');
  app=await boot(db,p);assert.equal((await app.storage.progress()).explored,5001);
  assert.equal((await app.storage.videoProgress()).explored,1);db.close();
});

test('missing and invalid sizes never fabricate savings, including Live Photo still-only metadata',()=>{
  const {storageEstimate}=makeLoader()('lib/pictopia/storage-size.ts');
  assert.deepEqual(storageEstimate([{size:7000000},{},{size:0},{size:NaN},{size:-1},{size:42,livePhoto:true},{scan:{size:3000000}}]),{bytes:10000000,known:2,unknown:5});
});

test('the actual allowance hook charges historical encounters on a new day, then allows revisits and Pro',async()=>{
  const session={ids:['a','b'],activeId:'a',records:{a:{encountered:true}}};let counted=Array.from({length:149},(_,i)=>String(i)),calls=0;const events={};
  const h=hooks('components/pictopia/use-allowance.ts','useAllowance',{
    'react-native':{AppState:{addEventListener:(name,fn)=>{events[name]=fn;return{remove(){}}}}},
    '@/services/daily':{allowanceStore:{state:async()=>({counted}),limit:async()=>150,present:async id=>{calls++;counted=[...counted,id];return{counted,left:150-counted.length,limit:150}}}},
  },[session,session.ids,'a',false]);
  assert.equal(h.render().ready,false);await tick();h.render();await tick();
  assert.equal(h.render().stopBefore,'b');assert.equal(calls,1,'old encounters do not grant lifetime free access');
  h.render();await tick();assert.equal(calls,1,'today’s repeated display is free');
  assert.equal(h.render([session,session.ids,'a',true]).stopBefore,undefined);
  h.unmount();
});

test('deletion streak activity commits with verified deletion, rolls back on failure and never replays twice',async()=>{
  const fault={},db=new DatabaseSync(':memory:'),p=platform({library:['a']}),app=await boot(db,p,fault);
  await app.storage.put([media('a',{decision:'delete',size:2000000})]);
  fault.key='dailyActivity:v1';
  await assert.rejects(app.deleteMarked([await app.storage.get('a')],app.mediaService),/Simulated write failure/);
  assert.equal((await app.storage.progress()).deleted,0);
  assert.equal(await app.storage.getValue('dailyActivity:v1'),undefined);
  delete fault.key;await app.recoverDeletions(app.mediaService);
  const day=Object.values((await app.storage.getValue('dailyActivity:v1')).days)[0];assert.equal(day.deleted,1);
  await app.recoverDeletions(app.mediaService);
  assert.equal(Object.values((await app.storage.getValue('dailyActivity:v1')).days)[0].deleted,1);
  assert.equal((await app.storage.progress()).deleted,1);db.close();
});

test('legacy partial endings and old proofs cannot silently verify an adventure',()=>{
  const load=makeLoader(),x=load('lib/pictopia/explore.ts'),a=load('lib/pictopia/adventures.ts');
  let s={...x.createExplore(['a','b','c']),review:true,finished:true,activeId:null,records:{c:{encountered:true}}};
  assert.equal(a.completionEvidence(s),false);
  const meta={count:3,finishedAt:1,completionProof:{version:1,at:1,total:3,explored:1,endpoint:'c',sessionStartedAt:s.startedAt}};
  assert.equal(a.savedCompletion(meta,s),false);
  s={...s,finished:false,activeId:'b',records:{c:{encountered:true,queued:true}}};
  const next=x.reduceExplore(s,{type:'finish',expectedRevision:s.revision});
  assert.ok(next.completionVerifiedAt);assert.equal(a.completionEvidence(next),true,'the current explicit final-discard flow has durable evidence');
});

test('a first displayed photo alone is not Continue; real navigation or a mark is resumable and Undo retains encounter history',()=>{
  const load=makeLoader(),x=load('lib/pictopia/explore.ts'),a=load('lib/pictopia/adventures.ts');
  let s={...x.createExplore(['a','b']),review:true};
  assert.equal(a.meaningfulReview(s),false);s=x.reduceExplore(s,{type:'seen',id:'a'});
  assert.equal(a.meaningfulReview(s),false);
  s=x.reduceExplore(s,{type:'page',id:'a',revision:s.revision,toId:'b',availableIds:s.ids});assert.equal(a.meaningfulReview(s),true);
  s=x.reduceExplore(s,{type:'discard',id:'b',revision:s.revision,direction:'left'});
  s=x.reduceExplore(s,{type:'undo'});assert.equal(x.exploreCounts(s).explored,2);assert.equal(x.exploreCounts(s).discarded,0);
});

test('editing an asset invalidates its cached size while preserving exploration and its queue decision',async()=>{
  const db=new DatabaseSync(':memory:'),app=await boot(db,platform());
  const original=media('a',{size:5000000,firstSeenAt:1,decision:'delete'});
  await app.storage.put([original]);
  await app.repository.ingest([media('a',{modified:original.modified+1})],2);
  const current=await app.storage.get('a');
  assert.equal(current.size,undefined);assert.equal(current.firstSeenAt,1);assert.equal(current.decision,'delete');db.close();
});
