const test=require('node:test');
const assert=require('node:assert/strict');
const {makeLoader}=require('./loader.cjs');
const {hooks,textOf}=require('./hook-harness.cjs');
const {media}=require('./native-harness.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const {VideoLifecycle}=makeLoader()('lib/pictopia/video-lifecycle.ts');
function player() {
  const p={released:false,calls:[],currentTime:0,events:{},
    pause(){assert.equal(this.released,false,'pause after release');this.calls.push('pause')},
    play(){assert.equal(this.released,false,'play after release');this.calls.push('play')},
    release(){assert.equal(this.released,false,'double release');this.released=true;this.calls.push('release')},
    replaceAsync:async function(uri){assert.equal(this.released,false);this.calls.push(uri)},
    addListener(name,fn){this.events[name]=fn;return{remove:()=>{delete this.events[name]}}},
  };return p;
}

test('video disposal detaches callbacks, invalidates commands and releases once after pending replacement',async()=>{
  const p=player();let resolve,errors=0,removed=0;
  p.replaceAsync=()=>new Promise(done=>{resolve=done});
  const lease=new VideoLifecycle(()=>errors++);lease.attach(p);lease.listen(()=>removed++);
  const replacing=lease.replace('file://one');await tick();
  lease.play();lease.dispose();lease.dispose();assert.equal(removed,1);
  assert.equal(p.released,false,'native async work retains its owner until it settles');
  lease.pause();lease.play();lease.command(q=>{q.currentTime=10});
  resolve();await replacing;await tick();assert.equal(p.released,true);assert.equal(errors,0);
  lease.pause();lease.play();await lease.replace('file://late');assert.equal(p.calls.at(-1),'release');
});

test('rapid video replacements serialize and a background pause prevents delayed autoplay',async()=>{
  const p=player(),lease=new VideoLifecycle(()=>assert.fail('unexpected failure'));lease.attach(p);
  let resolve;const calls=[];
  p.replaceAsync=uri=>{calls.push(uri);return uri==='a'?new Promise(done=>{resolve=done}):Promise.resolve()};
  const first=lease.replace('a');await tick();lease.play();
  const second=lease.replace('b'),third=lease.replace('c');lease.pause();resolve();
  await Promise.all([first,second,third]);assert.deepEqual(calls,['a','c']);
  assert.equal(p.calls.includes('play'),false);lease.play();assert.equal(p.calls.at(-1),'play');
  lease.dispose();await tick();assert.equal(p.released,true);
});

test('native command and source failures are reported without escaping into React',async()=>{
  let errors=0;const p=player(),lease=new VideoLifecycle(()=>errors++);lease.attach(p);
  p.pause=()=>{throw Error('native failure')};assert.doesNotThrow(()=>lease.pause());assert.equal(errors,1);
  p.pause=()=>{};p.replaceAsync=async()=>{throw Error('unsupported codec')};await lease.replace('bad');
  assert.equal(errors,2);lease.play();assert.equal(p.calls.includes('play'),false);
  lease.dispose();await tick();assert.equal(p.released,true);
});

test('shared video hook owns creation/listeners and late native events cannot touch a released player',async()=>{
  const p=player();let made=0;
  const h=hooks('components/pictopia/use-review-video.ts','useReviewVideo',{
    'expo-video':{createVideoPlayer:source=>{assert.equal(source,null);made++;return p}},
  });
  h.render();const result=h.render();const late=p.events.playToEnd;
  result.owner.current.play();h.unmount();await tick();
  assert.equal(made,1);assert.equal(p.released,true);assert.deepEqual(p.events,{});
  assert.doesNotThrow(()=>late());assert.equal(result.owner.current,undefined);
});

function imageHarness(resolve,initial=media('photo/L0/001',{uri:'ph://photo/L0/001'})) {
  const seen=[];
  const h=hooks('components/pictopia/media-image.tsx','MediaImage',{
    'react-native':{View:'View',Platform:{OS:'ios'},Pressable:'Button',ActivityIndicator:'Spinner',AppState:{currentState:'active',addEventListener:()=>({remove(){}})}},
    'expo-image':{Image:'Image'},'./ui':{Text:'Text',Icon:'Icon'},
    './video-poster':{VideoPoster:'Poster'},'@/services/review-media':{reviewMedia:{thumbnail:async()=>{throw Error('no poster')}}},
    '@/services/photo-display':{photoDisplay:async(m)=> (await resolve(m,{download:false})).uri},
    '@/services/media':{mediaService:{resolve}},'@/services/storage':{storage:{}},
    '@/theming/ThemeProvider':{useTheme:()=>({theme:{colors:{primary:'purple'}}})},
  },{media:initial,active:true,allowRetry:true,onSettled:value=>seen.push(value)});
  return {h,seen};
}
function find(node,type){if(!node||typeof node!=='object')return;if(node.type===type)return node;for(const child of [node.props?.children].flat(Infinity)){const value=find(child,type);if(value)return value}}

test('photos resolve by complete asset ID, never render raw ph URI, and only loaded pixels qualify',async()=>{
  const calls=[],v=imageHarness(async(m,opts)=>{calls.push([m.id,opts.download]);return{uri:'file://actual.heic'}});
  try {assert.equal(find(v.h.render(),'Image'),undefined);await tick();const picture=find(v.h.render(),'Image');
    assert.equal(picture.props.source,'file://actual.heic');assert.deepEqual(calls,[['photo/L0/001',false]]);
    assert.deepEqual(v.seen,[]);picture.props.onDisplay();assert.deepEqual(v.seen,['loaded']);
  }finally{v.h.unmount()}
});

test('unavailable/cloud photos stay unreviewed, offer retry, and download only after explicit action',async()=>{
  const calls=[],cloud=makeLoader()('services/media-errors.ts').CLOUD_ONLY;
  const v=imageHarness(async(m,opts)=>{calls.push(opts.download);if(!opts.download)throw Error(cloud);return{uri:'file://downloaded.heic'}});
  try {v.h.render();await tick();let tree=v.h.render();assert.match(textOf(tree),/in iCloud/);
    assert.deepEqual(v.seen,['failed']);assert.deepEqual(calls,[false]);
    find(tree,'Button').props.onPress();v.h.render();await tick();tree=v.h.render();
    assert.deepEqual(calls,[false,false,true]);find(tree,'Image').props.onDisplay();assert.equal(v.seen.at(-1),'loaded');
  }finally{v.h.unmount()}
});

test('navigation during photo loading cancels stale results and stale image callbacks',async()=>{
  let finish;const v=imageHarness(m=>m.id==='photo/L0/001'?new Promise(resolve=>{finish=resolve}):Promise.resolve({uri:'file://next.jpg'}));
  try {v.h.render();v.h.render({media:media('next'),active:true,onSettled:value=>v.seen.push(value)});await tick();
    const next=find(v.h.render(),'Image');assert.equal(next.props.source,'file://next.jpg');
    finish({uri:'file://stale.jpg'});await tick();assert.equal(find(v.h.render(),'Image').props.source,'file://next.jpg');
    v.h.unmount();assert.doesNotThrow(()=>next.props.onDisplay());assert.deepEqual(v.seen,[]);
  }finally{v.h.unmount()}
});

test('an unavailable item never consumes allowance; the first successfully displayed item does',async()=>{
  let charged=0;const session={ids:['a','b'],activeId:'a',records:{}},counted=[];
  const h=hooks('components/pictopia/use-allowance.ts','useAllowance',{
    'react-native':{AppState:{currentState:'active',addEventListener:()=>({remove(){}})}},
    '@/services/daily':{allowanceStore:{state:async()=>({counted}),limit:async()=>150,
      present:async id=>{charged++;counted.push(id);return{counted,left:149,limit:150}}}},
  },[session,session.ids,'a',false,false]);
  try {h.render();await tick();h.render();await tick();assert.equal(charged,0);
    h.render([session,session.ids,'a',false,true]);await tick();h.render();assert.equal(charged,1);
    h.render([session,session.ids,'b',false,false]);await tick();assert.equal(charged,1);
  }finally{h.unmount()}
});

test('native resolution uses complete identifiers, accepts photo edits, and requires intentional cloud download',async()=>{
  const calls=[],m=media('uuid/L0/001',{uri:'ph://uuid/L0/001'});let cloud=false;
  const api={getAssetInfoAsync:async(id,opts)=>{calls.push([id,opts.shouldDownloadFromNetwork]);return{id,mediaType:'photo',creationTime:m.created+1,width:500,height:600,uri:m.uri,localUri:cloud&&!opts.shouldDownloadFromNetwork?undefined:'file://edited.heic',isNetworkAsset:cloud}}};
  const svc=makeLoader({'expo-media-library':api,'expo-modules-core':{requireOptionalNativeModule:()=>null},
    'expo-file-system':{File:class{exists=false}},'react-native':{Platform:{OS:'ios'}},
  })('services/media.native.ts').mediaService;
  assert.equal((await svc.resolve(m)).uri,'file://edited.heic');cloud=true;
  await assert.rejects(svc.resolve(m),/CLOUD_ONLY|iCloud/);assert.equal((await svc.resolve(m,{download:true})).uri,'file://edited.heic');
  assert.deepEqual(calls,[[m.id,false],[m.id,false],[m.id,true]]);
});

test('full preview cannot autoplay a pending source after backgrounding or unmounting',async()=>{
  let finish,appEvent,plays=0,ready=0;
  const owner={current:{replace:()=>new Promise(resolve=>{finish=resolve}),pause(){},play(){plays++}}};
  const h=hooks('app/preview.tsx','Video',{
    '@/components/pictopia/use-review-video':{useReviewVideo:()=>({player:{},status:'idle',owner})},
    '@/components/pictopia/navigation-header':{},
    'react-native':{AppState:{currentState:'active',addEventListener:(_,fn)=>{appEvent=fn;return{remove(){}}}},View:'View'},
    'react-native-safe-area-context':{},'expo-video':{VideoView:'Video'},
    '@/components/pictopia/live-photo':{},'@/components/pictopia/use-photo-encounter':{},'@/components/pictopia/zoom-photo':{},
    '@/components/pictopia/ui':{Text:'Text'},'@/components/pictopia/provider':{},
    '@/services/repository':{},'@/services/media':{},
  },{uri:'file://video',autoplay:true,onReady:()=>{ready++}});
  const tree=h.render();appEvent('background');finish();await tick();
  assert.equal(plays,0);tree.props.onFirstFrameRender();assert.equal(ready,0);
  h.unmount();assert.doesNotThrow(()=>tree.props.onFirstFrameRender());assert.equal(ready,0);
});

test('a failed current photo does not block the next accessible photo when one free review remains',async()=>{
  const counted=Array.from({length:149},(_,i)=>String(i)),session={ids:['failed','next','later'],activeId:'failed',records:{}};
  const h=hooks('components/pictopia/use-allowance.ts','useAllowance',{
    'react-native':{AppState:{currentState:'active',addEventListener:()=>({remove(){}})}},
    '@/services/daily':{allowanceStore:{state:async()=>({counted}),limit:async()=>150,present:async()=>{throw Error('must not charge failed media')}}},
  },[session,session.ids,'failed',false,false]);
  try {h.render();await tick();assert.equal(h.render().stopBefore,'later','next remains reachable without charging the failed photo');}
  finally{h.unmount()}
});
