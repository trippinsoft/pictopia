const test=require('node:test');
const assert=require('node:assert/strict');
const {makeLoader}=require('./loader.cjs');
const {DatabaseSync,platform,boot}=require('./native-harness.cjs');
const {HOME_TIPS,nextHomeTip}=makeLoader()('lib/pictopia/home-tips.ts');
const at=(day,hour=12)=>new Date(2026,10,day,hour).getTime();

test('fourteen daily guide messages wrap, keep the same local day, and resist clock rollback',()=>{
  assert.equal(HOME_TIPS.length,14);assert.equal(new Set(HOME_TIPS).size,14);
  let saved=nextHomeTip(undefined,at(6));assert.equal(saved.index,0);
  assert.equal(nextHomeTip(saved,at(6,23)),saved);
  assert.equal(nextHomeTip(saved,at(5)),saved);
  saved=nextHomeTip(saved,at(9));assert.equal(saved.index,1,'days away advance once');
  for(let i=0;i<13;i++) saved=nextHomeTip(saved,at(10+i));
  assert.equal(saved.index,0);
  assert.equal(nextHomeTip({version:1,day:'bad',index:999},at(6)).index,0);
});

test('tip rotation works offline across restarts and concurrent reads without touching activity or allowance',async()=>{
  const db=new DatabaseSync(':memory:'),p=platform(),fault={};let app=await boot(db,p,fault);
  const load=()=>makeLoader({...p.mocks,'./repository':app})('services/home-tips.ts').homeTipStore;
  await app.storage.setValue('swipeAllowance:v1',{preserved:true});
  await app.storage.setValue('dailyActivity:v1',{preserved:true});
  let store=load();assert.equal(await store.today(at(6)),HOME_TIPS[0]);
  app=await boot(db,p,fault);store=load();assert.equal(await store.today(at(6,23)),HOME_TIPS[0]);
  const values=await Promise.all([store.today(at(7)),store.today(at(7)),store.today(at(7))]);
  assert.deepEqual(values,[HOME_TIPS[1],HOME_TIPS[1],HOME_TIPS[1]]);
  fault.key='homeTip:v1';await assert.rejects(store.today(at(8)));
  assert.equal((await app.storage.getValue('homeTip:v1')).index,1,'failed save cannot advance the persisted selection');
  delete fault.key;assert.equal(await store.today(at(8)),HOME_TIPS[2]);
  assert.deepEqual(await app.storage.getValue('swipeAllowance:v1'),{preserved:true});
  assert.deepEqual(await app.storage.getValue('dailyActivity:v1'),{preserved:true});
  assert.deepEqual(p.requests,[]);db.close();
});

test('all fourteen approved messages render in an unboxed, compass note without clipping',()=>{
  const {JourneyNote}=makeLoader({'expo-router':{},'react-native':{View:'View'},'./ui':{Icon:'Icon',Text:'Text'},
    '@/services/home-tips':{homeTipStore:{}}})('components/pictopia/home-tip.tsx');
  const visit=(node,fn)=>{if(!node||typeof node!=='object')return;fn(node);for(const child of [node.props?.children].flat(Infinity))visit(child,fn)};
  for(const message of HOME_TIPS){
    const tree=JourneyNote({message});const text=[],icons=[];
    visit(tree,node=>{
      if(node.type==='Text')text.push(node.props.children);
      if(node.type==='Icon')icons.push(node.props.name);
      assert.equal(node.props.onPress,undefined);
      assert.equal(node.props.numberOfLines,undefined,'long copy wraps naturally');
      assert.doesNotMatch(node.props.className??'',/bg-|border|shadow/);
    });
    assert.deepEqual(text,['For the Journey...',message]);assert.deepEqual(icons,['Compass']);
  }
  assert.doesNotMatch(HOME_TIPS.join(' '),/streak|badge|exploration counts|Time Capsule picks a month|Feeling adventurous/);
});

test('Home navigation and foreground reads preserve the daily note and retain valid copy on read failure',async()=>{
  const {hooks}=require('./hook-harness.cjs');
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  let listener,fail=false,reads=0;
  const h=hooks('components/pictopia/home-tip.tsx','HomeTip',{
    'react-native':{AppState:{addEventListener:(_,fn)=>{listener=fn;return{remove(){}}}},View:'View'},
    './ui':{Icon:'Icon',Text:'Text'},
    '@/services/home-tips':{homeTipStore:{today:async()=>{reads++;if(fail)throw Error('disk');return HOME_TIPS[9]}}},
  });
  try {
    h.render();await tick();assert.equal(h.render().props.message,HOME_TIPS[9]);
    listener('active');await tick();assert.equal(h.render().props.message,HOME_TIPS[9]);
    fail=true;listener('active');await tick();assert.equal(h.render().props.message,HOME_TIPS[9]);
    assert.equal(reads,3);
  } finally {h.unmount();}
});

 test('an existing saved tip index uses only the new approved collection and keeps its saved day',async()=>{
  const db=new DatabaseSync(':memory:'),p=platform(),app=await boot(db,p);
  const saved={version:1,day:'2026-11-06',index:9};await app.storage.setValue('homeTip:v1',saved);
  const store=makeLoader({...p.mocks,'./repository':app})('services/home-tips.ts').homeTipStore;
  assert.equal(await store.today(at(6)),HOME_TIPS[9]);
  assert.deepEqual(await app.storage.getValue('homeTip:v1'),saved);
  db.close();
});

test('tapping persists the next guide message, wraps, and preserves daily rotation',async()=>{
  const db=new DatabaseSync(':memory:'),p=platform(),fault={};let app=await boot(db,p,fault);
  const load=()=>makeLoader({...p.mocks,'./repository':app})('services/home-tips.ts').homeTipStore;
  let store=load();await store.today(at(6));assert.equal(await store.next(at(6)),HOME_TIPS[1]);
  app=await boot(db,p,fault);store=load();assert.equal(await store.today(at(6)),HOME_TIPS[1]);
  for(let i=0;i<HOME_TIPS.length-1;i++) await store.next(at(6));
  assert.equal(await store.today(at(6)),HOME_TIPS[0]);
  fault.key='homeTip:v1';await assert.rejects(store.next(at(6)));delete fault.key;
  assert.equal(await store.today(at(6)),HOME_TIPS[0]);
  assert.equal(await store.today(at(7)),HOME_TIPS[1]);db.close();
});

test('tapping the guide note changes the displayed message and guards duplicate pending taps',async()=>{
  const {hooks}=require('./hook-harness.cjs');const tick=()=>new Promise(resolve=>setImmediate(resolve));
  let resolveNext,calls=0;
  const h=hooks('components/pictopia/home-tip.tsx','HomeTip',{
    'react-native':{AppState:{addEventListener:()=>({remove(){}})},View:'View',Pressable:'Pressable'},
    './ui':{Icon:'Icon',Text:'Text'},
    '@/services/home-tips':{homeTipStore:{today:async()=>HOME_TIPS[0],next:()=>{calls++;return new Promise(resolve=>{resolveNext=resolve})}}},
  });
  try {
    h.render();await tick();const note=h.render();note.props.onNext();note.props.onNext();
    assert.equal(calls,1);assert.equal(h.render().props.busy,true);
    resolveNext(HOME_TIPS[1]);await tick();assert.equal(h.render().props.message,HOME_TIPS[1]);
    assert.equal(h.render().props.busy,false);
  } finally {h.unmount();}
});
