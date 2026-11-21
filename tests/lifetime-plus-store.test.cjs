const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { makeLoader } = require('./loader.cjs');
const now = Date.now();
const installation = 'a'.repeat(64);
const claims = { version:1, entitlement:'lifetime_plus', installation, firstPaidAt:now-1000, awardedAt:now-500, issuedAt:now };
async function setup(enabled = true) {
  global.crypto = webcrypto;
  const keys = await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  process.env.EXPO_PUBLIC_LIFETIME_PLUS_PUBLIC_KEY=Buffer.from(await webcrypto.subtle.exportKey('spki',keys.publicKey)).toString('base64');
  process.env.EXPO_PUBLIC_SUPABASE_URL='https://test.invalid';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY='public-test';
  const values=new Map(); let fail=false; const evidenceCalls=[]; const requests=[];
  const storage={init:async()=>{}, getValue:async k=>values.get(k), setValue:async(k,v)=>{if(fail)throw Error('disk full');values.set(k,JSON.parse(JSON.stringify(v)));}};
  const mocks={
    "@/lib/pictopia/feature-flags":{LIFETIME_PLUS_ENABLED:enabled},
    './purchases':{purchaseService:{evidence:async restore=>{evidenceCalls.push(restore);return {platform:"ios",transactions:["test-owned"]};}}},
    'expo-crypto':{CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:async()=>installation},
    './referrals':{rewardCredential:async()=> 'capability'},
    './repository':{storage,serialize:async fn=>fn()},
  };
  const boot=()=>makeLoader(mocks)('services/lifetime-plus.ts').lifetimePlusStore;
  async function sign(c) {
    const payload=JSON.stringify(c);
    return {payload,signature:Buffer.from(await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,new TextEncoder().encode(payload))).toString('base64')};
  }
  let response = await sign(claims);
  global.fetch=async(url,init)=>{requests.push(JSON.parse(init.body));return {ok:true,json:async()=>response};};
  return {boot,values,sign,evidenceCalls,requests,response:(v)=>{response=v;},fail:(v)=>{fail=v;}};
}
test('signed award saves atomically and restores locally after restart without a network',async()=>{
  const app=await setup(); const store=app.boot();
  await store.sync(); assert.equal(store.snapshot().awardedAt,claims.awardedAt);
  global.fetch=async()=>{throw Error('offline');};
  const restarted=app.boot(); await restarted.load();
  assert.equal(restarted.snapshot().awardedAt,claims.awardedAt);
  await assert.rejects(restarted.sync());
  assert.equal(restarted.snapshot().awardedAt,claims.awardedAt);
});
test('duplicate sync and stale membership responses never demote a permanent award',async()=>{
  const app=await setup(); const store=app.boot();
  await store.sync(); await store.sync();
  app.response(await app.sign({...claims,awardedAt:null})); await store.sync();
  assert.equal(store.snapshot().awardedAt,claims.awardedAt);
  const restarted=app.boot(); await restarted.load(); assert.equal(restarted.snapshot().awardedAt,claims.awardedAt);
});
test('failed persistence does not publish a grant and invalid cached flags are ignored',async()=>{
  const app=await setup(); const store=app.boot(); app.fail(true);
  await assert.rejects(store.sync()); assert.equal(store.snapshot(),null);
  app.fail(false); app.values.set('lifetimePlusReceipt:v1',{lifetime_plus:true});
  const restarted=app.boot(); await restarted.load(); assert.equal(restarted.snapshot(),null);
});
test('reinstall or changed installation cannot restore another installation receipt',async()=>{
  const app=await setup(); app.response(await app.sign({...claims,installation:'b'.repeat(64)}));
  const store=app.boot(); await assert.rejects(store.sync()); assert.equal(store.snapshot(),null);
});
test('no verification key disables network and grants nothing',async()=>{
  const app=await setup(); delete process.env.EXPO_PUBLIC_LIFETIME_PLUS_PUBLIC_KEY;
  global.fetch=async()=>{throw Error('must not call');};
  const store=app.boot(); await store.load(); await store.sync(); assert.equal(store.snapshot(),null);
});

test('completion bypasses evidence throttle and always rechecks subscription without prompting ownership refresh',async()=>{
 const app=await setup();const store=app.boot();
 app.response(await app.sign({...claims,awardedAt:null,paidUntil:now+60000}));
 await store.sync();await store.sync();assert.equal(app.evidenceCalls.length,1);
 const completion={version:1,verified:false,ready:true,reason:'candidate',checkedAt:now,distinctEligiblePhotos:10000,remainingPhotos:0};
 app.response(await app.sign(claims));await store.sync({completion});
 assert.equal(app.evidenceCalls.length,2);assert.equal(app.evidenceCalls[1],false);
 assert.deepEqual(app.requests.at(-1).completion,completion);
 assert.ok(app.requests.at(-1).evidence);
 assert.equal(store.snapshot().awardedAt,claims.awardedAt);
});
test('no-membership response clears unearned membership but preserves an earned award on disk',async()=>{
 const app=await setup();const store=app.boot();
 app.response(await app.sign({...claims,awardedAt:null,paidUntil:now+60000}));await store.sync();
 app.response(null);await store.sync({payment:true});assert.equal(store.snapshot(),null);
 const restart=app.boot();await restart.load();assert.equal(restart.snapshot(),null);
 app.response(await app.sign(claims));await store.sync();
 app.response(null);await store.sync({payment:true});assert.equal(store.snapshot().awardedAt,claims.awardedAt);
 const awarded=app.boot();await awarded.load();assert.equal(awarded.snapshot().awardedAt,claims.awardedAt);
});


test('paused launch blocks all network and store evidence while retaining an earned signed receipt', async()=>{
 const app=await setup(false);
 app.values.set('lifetimePlusReceipt:v1', await app.sign(claims));
 const store=app.boot(); await store.load();
 await store.sync(); await store.sync({payment:true}); await store.sync({restore:true});
 await store.sync({completion:{ready:true}});
 assert.equal(app.evidenceCalls.length,0); assert.equal(app.requests.length,0);
 assert.equal(store.snapshot().awardedAt,claims.awardedAt);
});
