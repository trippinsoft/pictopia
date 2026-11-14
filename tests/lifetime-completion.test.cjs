const test=require('node:test');const assert=require('node:assert/strict');
const {makeLoader}=require('./loader.cjs');
const {auditLifetimePhotos}=makeLoader()('lib/pictopia/lifetime-completion.ts');
const now=100000;
const photo=i=>({id:String(i),type:'photo',modified:10,active:true,firstSeenAt:20,scan:{version:'sha256-dhash-laplacian-v1:10',hash:'a'.repeat(64)}});
const input=(n=10000)=>{const saved=Array.from({length:n},(_,i)=>photo(i));return{fullAccess:true,indexComplete:true,scan:{status:'complete',processed:n,total:n,skipped:0},before:saved.map(m=>({...m})),after:saved.map(m=>({...m})),saved};};
test('10,000 distinct fully reviewed and scanned photos produce only an unverified local candidate',()=>{
 const r=auditLifetimePhotos(input(),now);assert.equal(r.ready,true);assert.equal(r.verified,false);assert.equal(r.distinctEligiblePhotos,10000);
 assert.equal(auditLifetimePhotos(input(9999),now).ready,false);
});
test('confirmed Pictopia deletion counts once; pending discards and external disappearance are not deleted credits',()=>{
 const a=input(9999);a.saved.push({...photo(9999),active:false,deletedAt:30});assert.equal(auditLifetimePhotos(a,now).ready,true);
 delete a.saved.at(-1).deletedAt;assert.equal(auditLifetimePhotos(a,now).ready,false);
 a.saved.at(-1).decision='delete';assert.equal(auditLifetimePhotos(a,now).ready,false);
});
test('restore and duplicated IDs cannot inflate the distinct count',()=>{
 const a=input();a.saved[0].deletedAt=30;assert.equal(auditLifetimePhotos(a,now).ready,false);
 delete a.saved[0].deletedAt;assert.equal(auditLifetimePhotos(a,now).distinctEligiblePhotos,10000);
 a.saved.push({...a.saved[0]});assert.equal(auditLifetimePhotos(a,now).ready,false);
});
test('full access, fresh unchanged index, complete scan and actual encounters are all required',()=>{
 for(const change of [a=>a.fullAccess=false,a=>a.indexComplete=false,a=>a.after.pop(),a=>a.after[0].modified++,a=>delete a.saved[0].firstSeenAt,a=>a.saved[0].scanError='failed',a=>a.saved[0].scan.version='old',a=>a.saved[0].scan.hash='',a=>a.scan.skipped=1,a=>a.scan.status='running']){const a=input();change(a);assert.equal(auditLifetimePhotos(a,now).ready,false);}
});
test('videos do not satisfy the threshold and future timestamps are not encounters',()=>{
 const a=input(9999);a.saved.push({...photo('video'),type:'video'});assert.equal(auditLifetimePhotos(a,now).ready,false);
 const b=input();b.saved[0].firstSeenAt=now+1;assert.equal(auditLifetimePhotos(b,now).ready,false);
});
