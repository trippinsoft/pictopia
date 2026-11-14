const test=require('node:test');const assert=require('node:assert/strict');const {webcrypto}=require('node:crypto');const {makeLoader}=require('./loader.cjs');
async function setup(enabled=false, payment){
 global.crypto=webcrypto;
 const keys=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const env={SUPABASE_SERVICE_ROLE_KEY:'test-service-only',SUPABASE_URL:'https://project.invalid',LIFETIME_PLUS_SIGNING_KEY:Buffer.from(await webcrypto.subtle.exportKey('pkcs8',keys.privateKey)).toString('base64'),LIFETIME_STORE_VERIFICATION_ENABLED:enabled?'true':'false'};
 let handler;global.Deno={env:{get:k=>env[k]},serve:fn=>handler=fn};const calls=[];
 global.fetch=async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return{ok:true,json:async()=>url.endsWith('payment_rate_v1')?true:null};};
 const mocks = payment === undefined ? {} : {'./store-verification.ts': {
  parseStoreEvidence: v=>v, verifyApplePayment:async()=>payment,verifyGooglePayment:async()=>payment,
 }};
 makeLoader(mocks)('supabase/functions/lifetime-plus/index.ts');
 const request=(body,token='a'.repeat(64))=>handler(new Request('https://test.invalid',{method:'POST',headers:{'x-installation-token':token},body:JSON.stringify(body)}));
 return{request,calls,env};
}
test('endpoint rejects forged completion proof, wrong capability and oversized payloads',async()=>{
 const s=await setup();
 assert.equal((await s.request({verified:true,completedAt:1,distinctEligiblePhotos:10000})).status,400);
 assert.equal((await s.request({},'wrong')).status,401);
 assert.equal((await s.request({evidence:'x'.repeat(262145)})).status,413);
 assert.equal(s.calls.length,0);
});
test('disabled store verifier cannot bind client transactions or award',async()=>{
 const s=await setup();assert.equal((await s.request({evidence:{platform:'android',tokens:['anything']}})).status,503);
 assert.equal(s.calls.length,0);
 delete s.env.LIFETIME_PLUS_SIGNING_KEY;assert.equal((await s.request({})).status,503);
});
test('status-only delivery is installation-hashed and cannot ingest a completion',async()=>{
 const s=await setup();const response=await s.request({evidence:null});assert.equal(response.status,200);assert.equal(await response.json(),null);
 assert.equal(s.calls.length,1);assert.match(s.calls[0].url,/pictopia_lifetime_status_v1$/);
 assert.match(s.calls[0].body.p_installation,/^[a-f0-9]{64}$/);assert.notEqual(s.calls[0].body.p_installation,'a'.repeat(64));
});
test('enabled adapter still cannot bind without authoritative successful store verification',async()=>{
 const s=await setup(true);const response=await s.request({evidence:{platform:'android',tokens:['unverified']}});
 assert.equal(response.status,503);assert.equal(s.calls.length,1);assert.match(s.calls[0].url,/payment_rate_v1$/);
});

const candidate = () => ({version:1,verified:false,ready:true,reason:'candidate',checkedAt:Date.now()-100,distinctEligiblePhotos:10000,remainingPhotos:0});
const storeProof = () => ({subject:'ios:'+ 'b'.repeat(64),aliases:['ios:'+ 'b'.repeat(64)],paidAt:Date.now()-10000,expiresAt:Date.now()+10000,proofId:'ios:'+ 'c'.repeat(64)});
test('passing local completion automatically calls award only after fresh current paid verification',async()=>{
 const s=await setup(true,storeProof());
 assert.equal((await s.request({evidence:{platform:'ios',transactions:['owned']},completion:candidate()})).status,200);
 assert.deepEqual(s.calls.map(c=>c.url.split('/').at(-1)),['pictopia_lifetime_payment_rate_v1','pictopia_lifetime_bind_current_v1','pictopia_lifetime_complete_v1','pictopia_lifetime_status_v1']);
 assert.equal(s.calls[2].body.p_distinct_photos,10000);
});
test('no paid subscription, expired/trial identity and subscription beginning after completion cannot award',async()=>{
 for(const payment of [null,{...storeProof(),expiresAt:0},{...storeProof(),expiresAt:Date.now()-1},{...storeProof(),paidAt:Date.now()+1000}]){
  const s=await setup(true,payment);
  assert.equal((await s.request({evidence:{platform:'ios',transactions:['owned']},completion:candidate()})).status,200);
  assert.equal(s.calls.some(c=>c.url.endsWith('pictopia_lifetime_complete_v1')),false);
 }
});
test('missing current evidence, incomplete, stale, future and below-threshold audits are refused before verification',async()=>{
 const s=await setup(true,storeProof());
 assert.equal((await s.request({completion:candidate()})).status,400);
 for(const patch of [{ready:false},{verified:true},{distinctEligiblePhotos:9999},{remainingPhotos:1},{checkedAt:Date.now()-300001},{checkedAt:Date.now()+10000}]) {
  assert.equal((await s.request({evidence:{platform:'ios',transactions:['owned']},completion:{...candidate(),...patch}})).status,400);
 }
 assert.equal(s.calls.length,0);
});
