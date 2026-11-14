// Explicit live test against Pictopia. Creates only random test installations.
// Prints their token hashes for scoped cleanup by the agent; never prints credentials.
const assert = require('node:assert/strict');
const {randomBytes,createHash}=require('node:crypto');
const fs=require('node:fs');
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split('\n').filter(x=>x.includes('=')&&!x.startsWith('#')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).replace(/^['"]|['"]$/g,'')]}));
const url=process.env.EXPO_PUBLIC_SUPABASE_URL||env.EXPO_PUBLIC_SUPABASE_URL;
const key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.equal(url,'https://hvacjgfjmzxxirjxhkgl.supabase.co','Refuse to test another project');
const tokens=Array.from({length:5},()=>randomBytes(32).toString('hex'));
const hashes=tokens.map(t=>createHash('sha256').update(t).digest('hex'));
fs.writeFileSync('/tmp/pictopia-referral-test-hashes.json',JSON.stringify(hashes));
async function call(i,operation='sync',code) {
  const response=await fetch(`${url}/functions/v1/referrals`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json','x-installation-token':tokens[i]},body:JSON.stringify({operation,code})});
  return {status:response.status,data:await response.json()};
}
(async()=>{
  const a=await call(0),b=await call(1),c=await call(2),d=await call(3),e=await call(4);
  assert.equal(a.status,200,JSON.stringify(a)); for(const r of [a,b,c,d,e]) assert.match(r.data.code,/^[A-F0-9]{7}$/,'new codes have seven characters'); assert.equal(a.data.earned,0); assert.notEqual(a.data.code,b.data.code);
  assert.equal((await call(0,'redeem',a.data.code)).status,400,'self rejected');
  assert.equal((await call(1,'redeem','BADCODE12345')).status,400,'unknown rejected');
  const concurrent=await Promise.all([call(1,'redeem',a.data.code),call(1,'redeem',a.data.code)]);
  for(const r of concurrent) {assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.earned,1000);}
  assert.equal((await call(0)).data.earned,1000,'referrer receives 1000 once');
  assert.equal((await call(1,'redeem',c.data.code)).status,400,'second incoming code rejected');
  assert.equal((await call(2,'redeem',a.data.code)).data.earned,1000);
  assert.equal((await call(0)).data.earned,2000,'multiple outgoing referrals accumulate');
  const mutual=await Promise.all([call(3,'redeem',e.data.code),call(4,'redeem',d.data.code)]);
  assert.equal(mutual.filter(r=>r.status===200).length,2,'mutual calls do not deadlock');
  assert.equal((await call(3)).data.earned,2000);assert.equal((await call(4)).data.earned,2000);
  let limited;
  for(let i=0;i<11;i++) limited=await call(1,'redeem',a.data.code);
  assert.equal(limited.status,429,'installation redemption rate limit');
  const rejected=await fetch(`${url}/rest/v1/rpc/pictopia_referrals_v1`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_token_hash:hashes[0],p_network_hash:hashes[0],p_operation:'sync'})});
  assert.notEqual(rejected.status,200,'publishable key cannot call privileged RPC');
  console.log('PASS: real Edge Function registration, self/invalid rejection, atomic duplicate redemption, both rewards, accumulated referrals, mutual concurrency, rate limiting, private RPC.');
})().catch(error=>{console.error(error);process.exitCode=1;});
