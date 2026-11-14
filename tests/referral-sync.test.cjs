const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {makeLoader}=require('./loader.cjs');
const {DatabaseSync,platform,boot}=require('./native-harness.cjs');
const W='referralWallet:v1';
async function setup() {
 const db=new DatabaseSync(':memory:'),p=platform(),app=await boot(db,p),credentials=new Map();
 const mocks={...p.mocks,'./repository':app,'expo-crypto':{randomUUID},'./referral-credential':{referralCredential:{read:async id=>credentials.get(id)||null,write:async(id,token)=>credentials.set(id,token)}}};
 return {app,db,load:()=>makeLoader(mocks)('services/referrals.ts').referralStore};
}
async function environment(work) {
 const previous={fetch:global.fetch,url:process.env.EXPO_PUBLIC_SUPABASE_URL,key:process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
 process.env.EXPO_PUBLIC_SUPABASE_URL='https://test.invalid';process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY='public-test';
 try{await work();}finally{global.fetch=previous.fetch; for(const [name,value] of [['EXPO_PUBLIC_SUPABASE_URL',previous.url],['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',previous.key]]){if(value===undefined) delete process.env[name];else process.env[name]=value;}}
}
test('lost redemption response survives a restart; retry merges one committed grant without media data',()=>environment(async()=>{
 const {app,db,load}=await setup();let committed=false,lose=true,token;
 global.fetch=async(url,request)=>{
  assert.equal(url,'https://test.invalid/functions/v1/referrals');
  const body=JSON.parse(request.body);
  assert.deepEqual(Object.keys(body).sort(),body.code?['code','operation']:['operation']);
  assert.match(request.headers['x-installation-token'],/^[a-f0-9]{64}$/);
  if(token)assert.equal(request.headers['x-installation-token'],token);else token=request.headers['x-installation-token'];
  if(body.operation==='redeem') {committed=true;if(lose){lose=false;throw new TypeError('offline after commit');}}
  return new Response(JSON.stringify({code:'AAAABBB',earned:committed?1000:0,redeemed:committed}));
 };
 let store=load(); await store.sync();
 await assert.rejects(store.redeem('ddddeee'),/Connect to the internet/);
 assert.equal((await app.storage.getValue(W)).pendingCode,'DDDDEEE');
 assert.equal((await app.storage.getValue(W)).earned,0,'uncertain response never grants locally');
 store=load();const recovered=await store.sync();
 assert.equal(recovered.earned,1000);assert.equal(recovered.redeemed,true);assert.equal(recovered.pendingCode,undefined);
 assert.equal((await store.sync()).earned,1000);
 db.close();
}));
test('a delayed sync preserves newer offline spending and invalid pending codes can be corrected',()=>environment(async()=>{
 const {app,db,load}=await setup();const store=load();let finish;
 global.fetch=async()=>new Response(JSON.stringify({code:'AAAABBB',earned:1000,redeemed:false}));
 await store.sync();
 global.fetch=async()=>new Promise(resolve=>{finish=()=>resolve(new Response(JSON.stringify({code:'AAAABBB',earned:2000,redeemed:false})))});
 await app.storage.setValue(W,{version:1,code:'AAAABBB',earned:1000,spent:5,redeemed:false});
 const syncing=store.sync();while(!finish)await new Promise(resolve=>setImmediate(resolve));
 await app.serialize(()=>app.storage.setValue(W,{version:1,code:'AAAABBB',earned:1000,spent:9,redeemed:false}));
 finish();assert.equal((await syncing).spent,9);
 global.fetch=async()=>new Response(JSON.stringify({error:'That code wasn’t found. Check it and try again.'}),{status:400});
 await assert.rejects(store.redeem('DDDDEEE'),/wasn’t found/);
 assert.equal((await store.load()).pendingCode,undefined);
 db.close();
}));

test('an invalid cached code is hidden and repaired by sync using the same credential',()=>environment(async()=>{
 const {app,db,load}=await setup();const store=load();let token;
 global.fetch=async(url,request)=>{token=request.headers['x-installation-token'];return new Response(JSON.stringify({code:'ABC1234',earned:1000,redeemed:false}));};
 await store.sync();
 await app.storage.setValue(W,{version:1,code:'83C1918C99A4',earned:1000,spent:12,redeemed:false});
 assert.equal((await store.load()).code,undefined);
 const originalToken=token;
 const recovered=await store.sync();
 assert.equal(token,originalToken); assert.equal(recovered.code,'ABC1234'); assert.equal(recovered.spent,12);
 assert.equal((await app.storage.getValue(W)).code,'ABC1234');
 db.close();
}));
