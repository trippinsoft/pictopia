const test = require('node:test');
const assert = require('node:assert/strict');
const {makeLoader} = require('./loader.cjs');
const {hooks,textOf} = require('./hook-harness.cjs');
function native(pages, {metadata=true, failures=[]}={}) {
  let page=0;
  const api = {
    getAssetsAsync: async()=>pages[page++],
    getAssetInfoAsync: async id=>{ if(failures.includes(id)) throw Error('metadata unavailable'); return {id,mediaSubtypes:id==='fallback-shot'?['screenshot']:[]}; },
  };
  const module = metadata ? {getMetadata:async ids=>ids.filter(id=>!failures.includes(id)&&id!=='fallback-shot').map(id=>({id,favorite:false,screenshot:id==='shot'}))} : null;
  return makeLoader({'expo-media-library':api,'expo-modules-core':{requireOptionalNativeModule:()=>module},
    'expo-file-system':{File:class{}},'react-native':{Platform:{OS:'ios'}}})('services/media.native.ts').mediaService;
}
const asset=(id,extra={})=>({id,uri:`ph://${id}`,filename:id,mediaType:'photo',creationTime:new Date(2020,1,2).getTime(),modificationTime:1,width:100,height:100,duration:0,...extra});
const page=(assets,totalCount,hasNextPage=false,endCursor='end')=>({assets,totalCount,hasNextPage,endCursor});
test('native enumeration indexes every page, classifies videos/screenshots/Live Photos and retains cloud or missing-metadata items',async()=>{
  const assets=Array.from({length:437},(_,i)=>asset(`p${i}`));
  assets[0]=asset('cloud',{isNetworkAsset:true}); assets[1]=asset('video',{mediaType:'video'});
  assets[2]=asset('shot'); assets[3]=asset('live',{mediaSubtypes:['livePhoto']});
  assets[4]=asset('fallback-shot'); assets[5]=asset('unknown',{creationTime:0});
  const svc=native([page(assets.slice(0,200),437,true,'a'),page(assets.slice(200,400),437,true,'b'),page(assets.slice(400),437)],{failures:['cloud','unknown']});
  const rows=[],progress=[];
  const report=await svc.sync(async items=>rows.push(...items),(n,total)=>progress.push([n,total]),new AbortController().signal);
  assert.equal(rows.length,437);assert.equal(new Set(rows.map(m=>m.id)).size,437);
  assert.deepEqual(progress,[[200,437],[400,437],[437,437]]);
  assert.equal(rows.find(m=>m.id==='video').type,'video');
  assert.equal(rows.find(m=>m.id==='shot').screenshot,true);
  assert.equal(rows.find(m=>m.id==='fallback-shot').screenshot,true);
  assert.equal(rows.find(m=>m.id==='live').livePhoto,true);
  assert.equal(rows.find(m=>m.id==='unknown').day,'unknown');
  assert.ok(rows.some(m=>m.id==='cloud'),'cloud metadata failure never removes the asset');
  assert.deepEqual(report.metadataFailures,['cloud','unknown']);
});
test('inconsistent totals, duplicate IDs and stalled cursors fail rather than reporting a complete index',async()=>{
  for(const pages of [
    [page([asset('a')],2)],
    [page([asset('a')],2,true,'a'),page([asset('a')],2)],
    [page([asset('a')],2,true,'a'),page([asset('b')],3)],
    [page([asset('a')],2,true,'a'),page([],2,true,'a')],
  ]) await assert.rejects(()=>native(pages).sync(async()=>{},()=>{},new AbortController().signal),/indexing|library changed/);
  const rows=[];await native([page([],0)]).sync(async m=>rows.push(...m),()=>{},new AbortController().signal);assert.equal(rows.length,0);
});
test('onboarding reveal displays total media and its photo/video breakdown, including a video-only library',()=>{
  for(const [photosCount,videos] of [[14,3],[0,7]]) {
    const h=hooks('components/pictopia/onboarding/reveal.tsx','LibraryReveal',{
      '@/components/pictopia/ui':{Text:'Text'},'@/components/pictopia/media-image':{MediaImage:'MediaImage'},
      '@/services/repository':{storage:{query:async()=>[]}},
      'react-native':{View:'View',AccessibilityInfo:{announceForAccessibility(){}}},
      'react-native-reanimated':{__esModule:true,default:{View:'View'},useReducedMotion:()=>true},
    });
    try {const text=textOf(h.render({years:[],total:photosCount+videos,photosCount,videos}));
      assert.ok(text.includes(String(photosCount+videos)));assert.match(text,/photos & videos discovered/);
      assert.ok(text.includes(`${photosCount} photos · ${videos} videos`));
    } finally {h.unmount();}
  }
});
