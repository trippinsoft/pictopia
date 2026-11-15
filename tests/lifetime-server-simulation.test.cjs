// Isolated server award path: execute the shipped Edge handler with an ephemeral signing key,
// fake store verification and in-memory RPCs. No live credentials, SDK or network is used.
const test=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {makeLoader}=require('./loader.cjs');
test('isolated Edge handler: paid completion, idempotent award, expiration and signed access',async(t)=>{
  const before={Deno:global.Deno,fetch:global.fetch};
  t.after(()=>Object.assign(global,before));
  const keys=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const pk=Buffer.from(await webcrypto.subtle.exportKey('pkcs8',keys.privateKey)).toString('base64');
  const env={LIFETIME_PLUS_SIGNING_KEY:pk,SUPABASE_SERVICE_ROLE_KEY:'isolated-test-only',SUPABASE_URL:'https://isolated-test.invalid',LIFETIME_STORE_VERIFICATION_ENABLED:'true'};
  let handler,paid=null,member=null,awardedAt=null,awards=0;
  global.Deno={env:{get:k=>env[k]},serve:fn=>{handler=fn;}};
  const now=Date.now();
  global.fetch=async(url,init)=>{
    assert.ok(url.startsWith('https://isolated-test.invalid/rest/v1/rpc/'),'never contact a real server');
    const name=url.split('/').pop(); const body=JSON.parse(init.body);
    let result=true;
    if(name==='pictopia_lifetime_bind_current_v1') member={installation:body.p_installation,paidAt:body.p_paid_at,paidUntil:body.p_paid_until};
    else if(name==='pictopia_lifetime_clear_current_v1') {if(member) member.paidUntil=null;}
    else if(name==='pictopia_lifetime_complete_v1') {
      assert.ok(member.paidUntil>Date.now()); assert.ok(body.p_distinct_photos>=10000);
      if(!awardedAt) {awardedAt=Date.now();awards++;}
    } else if(name==='pictopia_lifetime_status_v1') result=member?{version:1,entitlement:'lifetime_plus',installation:member.installation,firstPaidAt:member.paidAt,paidUntil:member.paidUntil,awardedAt,issuedAt:Date.now()}:null;
    else assert.equal(name,'pictopia_lifetime_payment_rate_v1');
    return Response.json(result);
  };
  const load=makeLoader({'./store-verification.ts':{parseStoreEvidence:()=>({platform:'ios'}),verifyApplePayment:async()=>paid,verifyGooglePayment:async()=>paid}});
  load('supabase/functions/lifetime-plus/index.ts');
  const request=body=>handler(new Request('https://isolated-test.invalid/functions/v1/lifetime-plus',{method:'POST',headers:{'x-installation-token':'f'.repeat(64)},body:JSON.stringify(body)}));
  const completion=count=>({version:1,verified:false,ready:true,reason:'candidate',checkedAt:Date.now(),distinctEligiblePhotos:count,remainingPhotos:0});
  for(const status of ['free','trial','expired']) {
    assert.equal((await request({evidence:{status},completion:completion(15000)})).status,200);
    assert.equal(awards,0);
  }
  paid={subject:'isolated',aliases:['isolated'],paidAt:now-60000,expiresAt:now+60000,proofId:'isolated-only'};
  assert.equal((await request({evidence:{},completion:completion(9999)})).status,400);assert.equal(awards,0);
  assert.equal((await request({evidence:{},completion:{...completion(15000),remainingPhotos:1}})).status,400);
  const earnedResponse=await request({evidence:{},completion:completion(15000)});
  assert.equal(earnedResponse.status,200); assert.equal(awards,1);
  await request({evidence:{},completion:completion(15000)}); assert.equal(awards,1);
  paid=null;
  const receipt=await (await request({evidence:{status:'expired'}})).json();
  assert.equal(JSON.parse(receipt.payload).paidUntil,null);
  const policy=load('lib/pictopia/lifetime-plus.ts');
  const verified=await policy.verifyLifetimeReceipt(receipt,member.installation,(payload,signature)=>webcrypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},keys.publicKey,Buffer.from(signature,'base64'),new TextEncoder().encode(payload)));
  assert.equal(policy.isLifetimeAward(verified),true);
  assert.equal(load('lib/pictopia/entitlement.ts').resolveEntitlement(null,null,false,Date.now(),verified).pro,true);
  assert.equal(awards,1);
  assert.equal((await request({simulation:{award:'earned'}})).status,400,'real endpoint rejects test overrides');
});
