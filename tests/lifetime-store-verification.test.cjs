const test=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto,generateKeyPairSync,verify,createPublicKey}=require('node:crypto');
const {makeLoader}=require('./loader.cjs');
global.crypto=webcrypto;
const v=makeLoader()('supabase/functions/lifetime-plus/store-verification.ts');
const now=Date.now(), date=now-86400000;
const apple={bundleId:v.APP_ID,environment:'Production',type:'Auto-Renewable Subscription',productId:'pictopia.pro.monthly',transactionId:'123',originalTransactionId:'12',inAppOwnershipType:'PURCHASED',price:4990,currency:'USD',purchaseDate:date,expiresDate:now+1000};
test('Apple current paid period qualifies; expired payments do not; trials, refunds, wrong products and environments do not',()=>{
 assert.equal(v.applePaidTransaction(apple,now),true);
 for(const delta of [{expiresDate:now},{expiresDate:date+1000},{price:0},{price:-1},{offerDiscountType:'FREE_TRIAL'},{revocationDate:date+1},{environment:'Sandbox'},{inAppOwnershipType:'FAMILY_SHARED'},{productId:'other'},{type:'Non-Consumable'},{purchaseDate:now+1},{currency:null}])assert.equal(v.applePaidTransaction({...apple,...delta},now),false,JSON.stringify(delta));
});
const order=(id='GPA.1',token='valid-token')=>({orderId:id,purchaseToken:token,state:'PROCESSED',lineItems:[{productId:'pictopia.pro.monthly',total:{units:'4',nanos:990000000},subscriptionDetails:{offerPhase:'BASE'}}],orderHistory:{processedEvent:{eventTime:new Date(date).toISOString()}}});
test('Google requires a processed positive actual order, correct token and product; rejects trial/refund/pending/zero',()=>{
 assert.equal(v.googlePaidOrder(order(),'valid-token','GPA.1',now),date);
 for(const delta of [{purchaseToken:'stolen-token'},{orderId:'other'},{state:'PENDING'},{orderHistory:{refundEvent:{},processedEvent:{eventTime:new Date(date).toISOString()}}},{orderHistory:{partialRefundEvents:[{}],processedEvent:{eventTime:new Date(date).toISOString()}}},{lineItems:[{productId:'pictopia.pro.monthly',total:{units:'0'},subscriptionDetails:{offerPhase:'BASE'}}]},{lineItems:[{productId:'pictopia.pro.monthly',total:{units:'4'},subscriptionDetails:{offerPhase:'FREE_TRIAL'}}]}])assert.equal(v.googlePaidOrder({...order(),...delta},'valid-token','GPA.1',now),null);
});
test('Evidence parsing bounds untrusted requests and never accepts a completion claim as store evidence',()=>{
 assert.deepEqual(v.parseStoreEvidence({platform:'android',tokens:['opaque+=:/token']}),{platform:'android',tokens:['opaque+=:/token']});
 for(const value of [null,{verified:true},{platform:'android',tokens:Array(7).fill('x')},{platform:'android',tokens:['\n']},{platform:'ios',transactions:['x'.repeat(32769)]}])assert.throws(()=>v.parseStoreEvidence(value));
});
test('Apple rejects unsigned, malformed, forged and non-Apple certificate evidence',()=>{
 for(const jws of ['x', 'e30.e30.ZmFrZQ',Buffer.from(JSON.stringify({alg:'none',x5c:[]})).toString('base64url')+'.e30.ZmFrZQ']) assert.throws(()=>v.verifyAppleJws(jws,'123','transaction',now));
});
const rsa=generateKeyPairSync('rsa',{modulusLength:2048});
const config={googleServiceAccount:JSON.stringify({client_email:'verifier@example.invalid',private_key:rsa.privateKey.export({type:'pkcs8',format:'pem'})})};
async function google(tokens, options={}) {
 const calls=[];
 const send=async(url,init)=>{
  calls.push(url);
  if(url==='https://oauth2.googleapis.com/token') {
   const assertion=init.body.get('assertion');const parts=assertion.split('.');
   assert.equal(verify('sha256',Buffer.from(parts.slice(0,2).join('.')),createPublicKey(rsa.privateKey),Buffer.from(parts[2],'base64url')),true);
   const claims=JSON.parse(Buffer.from(parts[1],'base64url'));assert.equal(claims.aud,url);assert.equal(claims.exp-claims.iat,300);
   return {ok:true,json:async()=>({access_token:'server-access'})};
  }
  assert.equal(init.headers.Authorization,'Bearer server-access');
  const token=url.includes('/tokens/') && tokens.find(t=>url.endsWith(encodeURIComponent(t)));
  if(token)return {ok:options.unavailable!==true,json:async()=>({kind:'androidpublisher#subscriptionPurchaseV2',subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',...options.subscription,lineItems:[{productId:'pictopia.pro.monthly',latestSuccessfulOrderId:'GPA.'+token,expiryTime:new Date(options.expiry??now+10000).toISOString()}]})};
  const name=decodeURIComponent(url.split('/').at(-1)).slice(4);
  return {ok:true,json:async()=>({...order('GPA.'+name,name),...options.order})};
 };
 return {value:await v.verifyGooglePayment({platform:'android',tokens},config,send,now),calls};
}
test('Google server path verifies OAuth, subscription, and actual paid order; uses only authoritative linked-token aliases',async()=>{
 const {value,calls}=await google(['alpha','beta'],{subscription:{linkedPurchaseToken:'old-token'}});
 assert.equal(value.platform,'android');assert.equal(value.paidAt,date);assert.equal(value.aliases.length,2);
 assert.equal(value.aliases.includes('android:'+Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode('beta'))).toString('hex')),false,'Unrelated submitted tokens must not link identities');
 assert.equal(calls.length,5);assert.equal(value.expiresAt,now+10000);
});
test('Google test purchases, pending states, refunds and unavailable store APIs never establish paid membership',async()=>{
 for(const options of [{subscription:{testPurchase:{}}},{subscription:{subscriptionState:'SUBSCRIPTION_STATE_PENDING'}},])assert.equal((await google(['alpha'],options)).value,null);
 await assert.rejects(google(['alpha'],{unavailable:true}));
});
test('missing store credentials and empty evidence never create a verified payment',async()=>{
 assert.equal(await v.verifyGooglePayment({platform:'android',tokens:[]},{},undefined,now),null);
 await assert.rejects(v.verifyGooglePayment({platform:'android',tokens:['x']},{},undefined,now));
 await assert.rejects(v.verifyApplePayment({platform:'ios',transactions:[]},{},undefined,now));
});

test('Google current period, cancellation, trial conversion and expiry drive earning, with identity retained for restore',async()=>{
 for(const state of ['SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_CANCELED']) {
  assert.equal((await google(['alpha'],{subscription:{subscriptionState:state}})).value.expiresAt,now+10000);
 }
 for(const options of [{expiry:now},{subscription:{subscriptionState:'SUBSCRIPTION_STATE_EXPIRED'}},{subscription:{subscriptionState:'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'}},{order:{state:'CANCELLED'}},{order:{orderHistory:{refundEvent:{}}}},{order:{lineItems:[{productId:'pictopia.pro.monthly',total:{units:'4'},subscriptionDetails:{offerPhase:'FREE_TRIAL'}}]}}]) {
  assert.equal((await google(['alpha'],options)).value.expiresAt,0);
 }
});
