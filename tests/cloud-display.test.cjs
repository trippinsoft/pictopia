const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { makeLoader } = require('./loader.cjs');
const { hooks } = require('./hook-harness.cjs');
const { media } = require('./native-harness.cjs');
const { CLOUD_ONLY } = makeLoader()('services/media-errors.ts');
const tick = () => new Promise(resolve=>setImmediate(resolve));

test('PhotoKit display passes the complete ID, uses network only for the active review, and cancels its own request', async () => {
  const calls=[], cancels=[];let finish;
  const native={reviewDisplay:(...args)=>{calls.push(args);return new Promise(resolve=>finish=resolve)},cancelReviewDisplay:async token=>{cancels.push(token)}};
  const {photoDisplay}=makeLoader({'react-native':{Platform:{OS:'ios'}},'expo-modules-core':{requireOptionalNativeModule:()=>native},'@/services/media':{mediaService:{resolve:()=>assert.fail('must not export an original')}}})('services/photo-display.native.ts');
  const abort=new AbortController(), row=media('full/asset/L0/001');
  const request=photoDisplay(row,true,abort.signal);await tick();
  assert.equal(calls[0][0],row.id);assert.equal(calls[0][3],true);
  abort.abort();assert.deepEqual(cancels,[calls[0][2]]);
  finish('file://display.jpg');await request;
  const local=new AbortController();const second=photoDisplay(row,false,local.signal);await tick();
  assert.equal(calls[1][3],false);finish('file://cached.jpg');await second;
});

test('iOS cloud video requires explicit network permission, retains the full ID and is cancellable', async () => {
  let finish;const calls=[],cancelled=[];
  const native={reviewVideoSource:(id,token)=>{calls.push([id,token]);return new Promise(resolve=>finish=resolve)},cancelReviewDisplay:async token=>{cancelled.push(token)}};
  const {videoSource}=makeLoader({'react-native':{Platform:{OS:'ios'}},'expo-modules-core':{requireOptionalNativeModule:()=>native},'@/services/media':{mediaService:{resolve:async()=>{throw Error(CLOUD_ONLY)}}}})('services/video-source.native.ts');
  const row=media('video/L0/007',{type:'video'});
  await assert.rejects(videoSource(row,false,new AbortController().signal),new RegExp(CLOUD_ONLY));assert.deepEqual(calls,[]);
  const abort=new AbortController(),pending=videoSource(row,true,abort.signal);await tick();
  assert.equal(calls[0][0],row.id);abort.abort();assert.deepEqual(cancelled,[calls[0][1]]);
  finish('file://photokit-playback.mov');assert.equal((await pending).uri,'file://photokit-playback.mov');
});

test('local video stays local; access/decoding errors are never mislabeled as cloud downloads', async () => {
  let mode='local';const native={reviewVideoSource:()=>assert.fail('must not start network')};
  const {videoSource}=makeLoader({'react-native':{Platform:{OS:'ios'}},'expo-modules-core':{requireOptionalNativeModule:()=>native},'@/services/media':{mediaService:{resolve:async()=>{if(mode==='error')throw Error('Access revoked');return{uri:'content://local-video'}}}}})('services/video-source.native.ts');
  assert.equal((await videoSource(media('v'),false,new AbortController().signal)).uri,'content://local-video');
  mode='error';await assert.rejects(videoSource(media('v'),true,new AbortController().signal),/Access revoked/);
});

test('a queued replacement cannot play the previous video before the source microtask starts', async () => {
  const {VideoLifecycle}=makeLoader()('lib/pictopia/video-lifecycle.ts');
  const calls=[];let resolve;const player={currentTime:0,pause:()=>calls.push('pause'),play:()=>calls.push('play'),release:()=>calls.push('release'),replaceAsync:()=>new Promise(done=>resolve=done)};
  const lease=new VideoLifecycle(()=>assert.fail('unexpected failure'));lease.attach(player);
  const replacing=lease.replace('next');lease.play();assert.deepEqual(calls,[]);
  await tick();lease.pause();resolve();await replacing;
  assert.equal(calls.includes('play'),false);lease.dispose();await tick();assert.equal(calls.at(-1),'release');
});

test('last free slot is reserved immediately; backward navigation to an uncounted ID is blocked at 150', async () => {
  let resolve;const charged=[];const counted=Array.from({length:149},(_,i)=>`old${i}`);
  const h=hooks('components/pictopia/use-allowance.ts','useAllowance',{'react-native':{AppState:{currentState:'active',addEventListener:()=>({remove(){}})}},'@/services/daily':{allowanceStore:{state:async()=>({counted}),limit:async()=>150,present:id=>{charged.push(id);return new Promise(done=>resolve=done)}}}},[undefined,['last','new'],'last',false,true]);
  try {h.render();await tick();h.render();let state=h.render();
    assert.deepEqual(charged,['last']);assert.equal(state.left,0);assert.equal(state.canReview('new'),false);assert.equal(state.canReview('last'),true);
    resolve({allowed:true,counted:[...counted,'last'],limit:150,left:0});await tick();state=h.render();
    assert.equal(state.canReview('unseen-behind-cursor'),false);assert.equal(state.canReview('old8'),true);
  } finally {h.unmount();}
});

test('native display implementation is bounded, uses full IDs, and removes request ownership before callback resolution (source audit only)', () => {
  const swift=fs.readFileSync('modules/pictopia-analysis/ios/PictopiaReview.swift','utf8');
  assert.match(swift,/CGSize\(width: 2048, height: 2048\)/);
  assert.match(swift,/cancelImageRequest\(request.id\)/);
  assert.match(swift,/displays.removeValue\(forKey: token\)/);
  assert.match(swift,/options.deliveryMode = network \? \.mediumQualityFormat : \.automatic/);
  assert.match(swift,/options.isNetworkAccessAllowed = network\n/);
  assert.doesNotMatch(swift,/deleteAssets|performChanges.*display/);
});
