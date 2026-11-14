const test = require('node:test');
const assert = require('node:assert/strict');
const { makeLoader } = require('./loader.cjs');
const w = makeLoader()('lib/pictopia/referral-wallet.ts');
const now = new Date(2026,10,14,12).getTime();
const wallet = () => ({version:1,earned:1000,spent:0,redeemed:true,code:'ABCDEF0'});
function spend(n, limit=100) {
  let r={state:undefined,wallet:wallet()};
  for(let i=0;i<n;i++) r=w.chargeReview(r.state,r.wallet,String(i),limit,false,now);
  return r;
}
test('daily first, then persistent credits; revisits and Pro never charge',()=>{
  let r=spend(100);
  assert.equal(r.wallet.spent,0); assert.equal(r.left,1000);
  r=w.chargeReview(r.state,r.wallet,'video',100,false,now);
  assert.equal(r.wallet.spent,1); assert.equal(r.left,999);
  const again=w.chargeReview(r.state,r.wallet,'video',100,false,now);
  assert.deepEqual(again.wallet,r.wallet);
  const pro=w.chargeReview(r.state,r.wallet,'newProPhoto',100,true,now);
  assert.deepEqual(pro.wallet,r.wallet); assert.deepEqual(pro.counted,r.counted);
});
test('Undo refunds once, rebalances banked charges into free slots, never refunds old days',()=>{
  let r=spend(102);
  r=w.refundReview(r.state,r.wallet,'0',100,now);
  assert.equal(r.wallet.spent,1);
  r=w.refundReview(r.state,r.wallet,'0',100,now);
  assert.equal(r.refunded,false); assert.equal(r.wallet.spent,1);
  r=w.refundReview(r.state,r.wallet,'101',100,now);
  assert.equal(r.wallet.spent,0); assert.equal(r.dailyLeft,0);
  r=w.refundReview(r.state,r.wallet,'1',100,now+86400000);
  assert.equal(r.refunded,false); assert.equal(r.dailyLeft,100);
});
test('midnight discards unused daily allowance but retains credits and spending indefinitely',()=>{
  const r=spend(110);
  const next=w.walletAllowance(r.state,r.wallet,125,now+86400000*365);
  assert.equal(next.credits,990); assert.equal(next.dailyLeft,125); assert.equal(next.left,1115);
  assert.equal(next.counted.length,0);
});
test('restoration opens daily slots without retroactive banked grants',()=>{
  const r=spend(110);
  const restored=w.walletAllowance(r.state,r.wallet,200,now);
  assert.equal(restored.wallet.spent,0); assert.equal(restored.credits,1000); assert.equal(restored.dailyLeft,90);
  assert.equal(w.walletAllowance(undefined,undefined,200,now).credits,0);
});
test('out-of-order sync is monotonic, never replaces spending, never mints on retries',()=>{
  const r=spend(105);
  let saved=w.mergeReferralWallet(r.wallet,{code:'ABCDEF0',earned:3000,redeemed:true},now);
  assert.equal(w.walletCredits(saved),2995);
  saved=w.mergeReferralWallet(saved,{code:'ABCDEF0',earned:1000,redeemed:false},now);
  assert.equal(w.walletCredits(saved),2995); assert.equal(saved.redeemed,true);
  assert.throws(()=>w.mergeReferralWallet(saved,{code:'DEADBEE',earned:5000,redeemed:true},now));
});
test('empty wallet blocks exactly at allowance, including mixed photo/video IDs',()=>{
  let state, wallet;
  for(let i=0;i<100;i++) { const r=w.chargeReview(state,wallet,`${i%2?'video':'photo'}:${i}`,100,false,now); state=r.state; wallet=r.wallet; assert.equal(r.allowed,true); }
  assert.equal(w.chargeReview(state,wallet,'over',100,false,now).allowed,false);
});

const { DatabaseSync, platform, boot } = require('./native-harness.cjs');
test('SQLite concurrent charges, refunds and restart retain one wallet and atomic allowance',async()=>{
  const db=new DatabaseSync(':memory:'); const p=platform({library:[],records:[]});
  const app=await boot(db,p);
  await app.storage.setValue(w.REFERRAL_WALLET,wallet());
  let daily=makeLoader({...p.mocks,'./repository':app})('services/daily.ts').allowanceStore;
  await Promise.all(Array.from({length:105},(_,i)=>daily.present(String(i),false,now)));
  assert.equal((await app.storage.getValue(w.REFERRAL_WALLET)).spent,5);
  await Promise.all([daily.present('same',false,now),daily.present('same',false,now)]);
  assert.equal((await app.storage.getValue(w.REFERRAL_WALLET)).spent,6);
  await Promise.all([daily.refund('same',now),daily.refund('same',now)]);
  assert.equal((await app.storage.getValue(w.REFERRAL_WALLET)).spent,5);
  const restarted=await boot(db,p);
  daily=makeLoader({...p.mocks,'./repository':restarted})('services/daily.ts').allowanceStore;
  assert.equal((await daily.snapshot(now)).left,995);
  assert.equal((await daily.snapshot(now+86400000)).left,1095);
  await daily.present('pro',true,now+86400000);
  assert.equal((await restarted.storage.getValue(w.REFERRAL_WALLET)).spent,5);
});
test('wallet write failure rolls back the daily charge, and retry charges once',async()=>{
  const fault={},db=new DatabaseSync(':memory:'),p=platform(),app=await boot(db,p,fault);
  await app.storage.setValue(w.REFERRAL_WALLET,wallet());
  const daily=makeLoader({...p.mocks,'./repository':app})('services/daily.ts').allowanceStore;
  for(let i=0;i<100;i++) await daily.present(String(i),false,now);
  fault.key=w.REFERRAL_WALLET;
  await assert.rejects(daily.present('failed',false,now),/Simulated write failure/);
  assert.equal((await daily.state(now)).counted.includes('failed'),false);
  assert.equal((await app.storage.getValue(w.REFERRAL_WALLET)).spent,0);
  delete fault.key;
  await daily.present('failed',false,now);
  assert.equal((await app.storage.getValue(w.REFERRAL_WALLET)).spent,1);
  db.close();
});
test('classic discard Undo commits its wallet refund with the session and media, or rolls all back',async()=>{
  const {media}=require('./native-harness.cjs');
  const fault={},db=new DatabaseSync(':memory:'),p=platform({library:['a']}),app=await boot(db,p,fault);
  await app.storage.put([media('a')]);
  const prefs=makeLoader()('lib/pictopia/types.ts').defaultPreferences;
  await app.repository.start('recent',{...prefs,includeFavorites:true});
  await app.storage.setValue(w.REFERRAL_WALLET,{...wallet(),spent:1});
  const daily=makeLoader({...p.mocks,'./repository':app})('services/daily.ts').allowanceStore;
  const current=Date.now();
  await app.storage.setValue('swipeAllowance:v1',{version:1,date:makeLoader()('lib/pictopia/daily.ts').localDate(current),counted:[...Array.from({length:100},(_,i)=>`before${i}`),'a'],referralCounted:['a'],lastWallClock:current});
  await app.repository.decide('delete','a');
  fault.key=w.REFERRAL_WALLET;
  await assert.rejects(app.repository.undo(),/Simulated write failure/);
  assert.equal((await app.storage.get('a')).decision,'delete');
  assert.equal((await app.storage.getValue(w.REFERRAL_WALLET)).spent,1);
  delete fault.key;
  await app.repository.undo();
  assert.notEqual((await app.storage.get('a')).decision,'delete');
  assert.equal((await app.storage.getValue(w.REFERRAL_WALLET)).spent,0);
  assert.equal((await daily.state(current)).counted.includes('a'),false);
  db.close();
});

test('only seven-character codes merge; twelve-character and other invalid codes are rejected',()=>{
 const code='ABC1234';
 assert.equal(w.mergeReferralWallet(undefined,{code,earned:1000,redeemed:false},now).code,code);
 for(const code of ['ABC123','ABC12345','ABCDEF012345','abcdef1']) assert.throws(()=>w.mergeReferralWallet(undefined,{code,earned:0,redeemed:false},now));
});

test('invalid cached code recovers from authenticated sync without losing credits or spending',()=>{
 const saved={...wallet(),code:'83C1918C99A4',spent:37};
 const updated=w.mergeReferralWallet(saved,{code:'ABC1234',earned:1000,redeemed:false},now);
 assert.equal(updated.code,'ABC1234'); assert.equal(updated.spent,37);
 assert.equal(w.walletCredits(updated),963); assert.equal(updated.redeemed,true);
 assert.throws(()=>w.mergeReferralWallet(updated,{code:'DEF5678',earned:1000,redeemed:true},now));
});
