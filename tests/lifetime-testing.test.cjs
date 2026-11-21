const test = require('node:test');
const assert = require('node:assert/strict');
const { makeLoader } = require('./loader.cjs');
const load = makeLoader();
const t = load('lib/pictopia/lifetime-testing.ts');
const { resolveEntitlement } = load('lib/pictopia/entitlement.ts');
const { libraryPercent } = load('lib/pictopia/library-progress.ts');
const { buildWall } = load('lib/pictopia/memory-wall.ts');

test('all 300 panel combinations use real percentage, visibility and premium policy', () => {
  for (const subscription of t.TEST_SUBSCRIPTIONS) for (const percent of t.TEST_PERCENTAGES) for (const count of t.TEST_COUNTS) for (const award of t.TEST_AWARDS) {
    const s = { ...t.defaultLifetimeTest, subscription, percent, count, award };
    const paid = ['paid','canceled-active'].includes(subscription);
    const p = t.testProgress(s);
    assert.equal(libraryPercent(p), percent, JSON.stringify(s));
    assert.equal(t.testQualifies(s), paid && percent === 100 && count >= 10000);
    assert.equal(t.testAchievementVisible(s), paid || award === 'earned');
    assert.equal(resolveEntitlement(null, null, true, Date.now(), null, s).pro, paid || subscription === 'trial' || award === 'earned');
    const wall = buildWall([{key:'2000-01',total:count,explored:p.explored,remaining:p.remaining,cleared:0}]);
    assert.equal(wall.remaining, p.remaining);
    assert.equal(wall.photos,count);
  }
});
test('completion → celebration → acknowledgement → expiration → reset uses memory only', () => {
  const store = t.createLifetimeTestStore(true);
  let changes = 0;
  const unsubscribe = store.subscribe(() => changes++);
  store.scenario();
  const award = store.snapshot();
  assert.equal(award.count,15000); assert.equal(award.percent,100); assert.equal(award.award,'earned');
  assert.ok(award.awardedAt); assert.equal(award.acknowledged,false);
  store.acknowledge(); assert.equal(store.snapshot().acknowledged,true);
  store.change({ subscription:'expired' });
  assert.equal(store.snapshot().awardedAt,award.awardedAt);
  assert.equal(resolveEntitlement(null,null,true,Date.now(),null,store.snapshot()).pro,true);
  assert.equal(t.testAchievementVisible(store.snapshot()),true);
  assert.equal(store.snapshot().acknowledged,true,'expiration does not replay the celebration');
  store.reset(); assert.equal(store.snapshot(),null);
  assert.equal(resolveEntitlement(null,null,true).pro,false);
  assert.equal(t.createLifetimeTestStore(true).snapshot(),null,'restart has no simulated award');
  assert.equal(changes,5); unsubscribe();
});
test('free, trial, expired, incomplete and under-threshold states cannot earn', () => {
  const store = t.createLifetimeTestStore(true);
  for (const subscription of ['free','trial','expired']) {
    store.change({subscription, percent:100,count:15000,award:'eligible'});
    assert.equal(store.complete(),false); assert.equal(store.snapshot().award,'eligible');
  }
  store.change({subscription:'canceled-active',percent:99});assert.equal(store.complete(),false);
  store.change({percent:100,count:9999});assert.equal(store.complete(),false);
  store.change({count:10000});assert.equal(store.complete(),true);
  const timestamp=store.snapshot().awardedAt;store.complete();assert.equal(store.snapshot().awardedAt,timestamp);
});
test('production ignores simulated access even when given an earned fixture', () => {
  const store=t.createLifetimeTestStore(false);
  store.scenario(); store.change({award:'earned'}); store.acknowledge();
  assert.equal(store.complete(),false); assert.equal(store.snapshot(),null);
  assert.equal(resolveEntitlement(null,null,false,Date.now(),null,{...t.defaultLifetimeTest,award:'earned'}).pro,false);
  assert.equal(load('lib/pictopia/lifetime-plus.ts').isLifetimeAward({...t.defaultLifetimeTest,award:'earned',awardedAt:1}),false);
});
test('simulation prevents real store evidence, server calls, native audit and persistence',async()=>{
  const fail=()=>{throw Error('real operation reached');};
  const mocks={
    './lifetime-testing':{lifetimeTestStore:{snapshot:()=>({...t.defaultLifetimeTest,award:'earned'})}},
    './repository':{storage:new Proxy({}, {get:()=>fail}),serialize:fail},
    './referrals':{rewardCredential:fail},'./purchases':{purchaseService:{evidence:fail}},
    './media':{mediaService:new Proxy({}, {get:()=>fail})},
    'expo-crypto':{CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:fail},
    'react-native':{Platform:{OS:'ios'}},
  };
  const isolated=makeLoader(mocks);
  await isolated('services/lifetime-plus.ts').lifetimePlusStore.sync({completion:{ready:true},payment:true});
  await isolated('services/lifetime-completion.ts').checkLifetimeCompletion();
});

test('existing achievement and celebration components render simulated state and never save real acknowledgement',async()=>{
  const store=t.createLifetimeTestStore(true);
  let slots=[],cursor=0,effects=[],oldDeps=[];
  const react={
    useState(initial){const i=cursor++;if(!(i in slots)) slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useEffect(fn,deps){const i=cursor++;if(!oldDeps[i]||deps.some((v,j)=>v!==oldDeps[i][j])) effects.push(fn);oldDeps[i]=deps;},
  };
  const jsx=(type,props)=>({type,props});
  const mocks={
    '@/lib/pictopia/feature-flags':{LIFETIME_PLUS_ENABLED:true},
    react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
    'react-native':{Modal:'Modal',View:'View',ScrollView:'ScrollView',Pressable:'Pressable',AppState:{addEventListener:()=>({remove(){}})}},
    './use-lifetime-test':{useLifetimeTest:()=>store.snapshot()},
    '@/services/lifetime-testing':{lifetimeTestStore:store},
    './provider':{usePictopia:()=>({})},
    './ui':{Text:'Text',Icon:'Icon',Button:'Button'},
    './playful':{useLift:()=>({})},
    './use-library-progress':{useLibraryProgress:()=>({progress:store.snapshot() ? t.testProgress(store.snapshot()) : undefined})},
    '@/services/lifetime-plus':{lifetimePlusStore:{snapshot:()=>null,subscribe:()=>()=>{}}},
    '@/services/repository':{storage:{getValue:async()=>undefined,setValue:async()=>{throw Error('must not save simulated acknowledgement');}}},
    '@/lib/pictopia/links':{manageSubscription:()=>{throw Error('must not manage real billing');}},
  };
  const components=makeLoader(mocks);
  const notice=components('components/pictopia/lifetime-award-notice.tsx').LifetimeAwardNotice;
  const row=components('components/pictopia/lifetime-plus-row.tsx').LifetimePlusRow;
  const render=component=>{cursor=0;effects=[];const result=component();effects.forEach(fn=>fn());return result;};
  const clear=()=>{slots=[];oldDeps=[];};
  const children=node=>Array.isArray(node)?node.flatMap(children):node?.props?[node,...children(node.props.children)]:[];
  store.change({subscription:'free'});assert.equal(render(row),null);clear();
  store.change({subscription:'trial'});assert.equal(render(row),null);clear();
  store.change({subscription:'paid'});assert.ok(render(row));clear();
  store.scenario();render(notice);let tree=render(notice);assert.equal(tree.props.visible,true);
  const button=children(tree).find(n=>n.type==='Button'&&n.props.children==='Got it');
  assert.ok(button);button.props.onPress();await Promise.resolve();
  assert.equal(render(notice).props.visible,false);
  store.change({subscription:'expired'});render(notice);assert.equal(render(notice).props.visible,false);
  clear();const earnedRow=render(row);assert.ok(earnedRow);
  assert.ok(children(earnedRow).some(n=>n.props.accessibilityLabel?.includes('Earned')));
  store.reset();clear();assert.equal(render(row),null);
});

test('downloaded staging builds expose completion testing only with the explicit developer flag', () => {
  const oldEnv = process.env.EXPO_PUBLIC_CURRENT_ENV;
  const oldFlag = process.env.EXPO_PUBLIC_PICTOPIA_DEV_TOOLS;
  try {
    for (const [env, flag, expected] of [
      ['STAGING', 'enabled', true],
      ['STAGING', '', false],
      ['PRODUCTION', 'enabled', false],
      ['PRODUCTION', '', false],
      ['UNKNOWN', 'enabled', false],
      ['DEVELOPMENT', 'enabled', true],
    ]) {
      process.env.EXPO_PUBLIC_CURRENT_ENV = env;
      process.env.EXPO_PUBLIC_PICTOPIA_DEV_TOOLS = flag;
      const isolated = makeLoader({ './repository': {}, '@/lib/pictopia/feature-flags':{LIFETIME_PLUS_ENABLED:true} });
      const gate = isolated('services/entitlement.ts');
      const { lifetimeTestStore: store } = isolated('services/lifetime-testing.ts');
      assert.equal(gate.LIFETIME_TEST_TOOLS, expected, `${env}/${flag}`);
      assert.equal(store.authorized, expected);
      store.scenario();
      assert.equal(store.snapshot()?.percent ?? null, expected ? 100 : null);
      assert.equal(store.snapshot()?.award ?? null, expected ? 'earned' : null);
    }
  } finally {
    if (oldEnv === undefined) delete process.env.EXPO_PUBLIC_CURRENT_ENV;
    else process.env.EXPO_PUBLIC_CURRENT_ENV = oldEnv;
    if (oldFlag === undefined) delete process.env.EXPO_PUBLIC_PICTOPIA_DEV_TOOLS;
    else process.env.EXPO_PUBLIC_PICTOPIA_DEV_TOOLS = oldFlag;
  }
});

test('paused launch disables lifetime scenarios even in opted-in development and staging',()=>{
 const oldEnv=process.env.EXPO_PUBLIC_CURRENT_ENV,oldFlag=process.env.EXPO_PUBLIC_PICTOPIA_DEV_TOOLS;
 try {
  process.env.EXPO_PUBLIC_PICTOPIA_DEV_TOOLS='enabled';
  for(const env of ['DEVELOPMENT','STAGING','PRODUCTION']) {
   process.env.EXPO_PUBLIC_CURRENT_ENV=env;
   const isolated=makeLoader({'./repository':{}});
   const store=isolated('services/lifetime-testing.ts').lifetimeTestStore;
   assert.equal(store.authorized,false);store.scenario();assert.equal(store.snapshot(),null);
  }
 } finally {
  if(oldEnv===undefined)delete process.env.EXPO_PUBLIC_CURRENT_ENV;else process.env.EXPO_PUBLIC_CURRENT_ENV=oldEnv;
  if(oldFlag===undefined)delete process.env.EXPO_PUBLIC_PICTOPIA_DEV_TOOLS;else process.env.EXPO_PUBLIC_PICTOPIA_DEV_TOOLS=oldFlag;
 }
});
