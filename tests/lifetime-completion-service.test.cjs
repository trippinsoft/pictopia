const test=require('node:test');const assert=require('node:assert/strict');const {makeLoader}=require('./loader.cjs');
function setup(options={}){
 const facts=Array.from({length:10000},(_,i)=>({id:String(i),type:'photo',modified:10,active:true,firstSeenAt:20,scan:{version:'sha256-dhash-laplacian-v1:10',hash:'a'.repeat(64)}}));
 const values=new Map([['scan',{status:'complete',processed:10000,total:10000,skipped:0}],['libraryIndex:v1',{status:'complete',completedAt:100,metadataFailures:[]}]]);
 let enumerations=0,permissions=0,queries=0;const submitted=[];
 const media={permission:async()=>({granted:true,limited:options.limited || (++permissions>1 && options.revoke)}),sync:async(page,progress)=>{
  enumerations++;for(let at=0;at<facts.length;at+=500)await page(facts.slice(at,at+500));progress(10000,10000);
  if(options.changeIndex && enumerations===2)values.set('libraryIndex:v1',{status:'indexing',completedAt:101});
  return{metadataFailures:options.failures?['missing']:[]};
 }};
 const storage={progress:async()=>({remaining:0,accessible:10000,deleted:0}),getValue:async k=>values.get(k),setValue:async(k,v)=>values.set(k,v),query:async q=>{queries++;assert.equal(q.includeInactive,true);return facts.slice(q.offset,q.offset+q.limit);}};
 const {checkLifetimeCompletion}=makeLoader({'@/lib/pictopia/feature-flags':{LIFETIME_PLUS_ENABLED:options.enabled!==false},'./lifetime-plus':{lifetimePlusStore:{snapshot:()=>({}),sync:async value=>submitted.push(value)}},'@/lib/pictopia/lifetime-plus':{isLifetimeEligible:()=>options.ineligible!==true && !(options.expireDuringAudit && enumerations===2)},'react-native':{Platform:{OS:options.web?'web':'ios'}},'./media':{mediaService:media},'./repository':{storage,serialize:async fn=>fn()}})('services/lifetime-completion.ts');
 return{checkLifetimeCompletion,values,submitted,reads:()=>({enumerations,queries})};
}
test('native audit enumerates the OS twice, pages saved records and submits a passing aggregate automatically',async()=>{
 const s=setup();await s.checkLifetimeCompletion();const r=s.values.get('lifetimeCompletionCandidate:v1');
 assert.equal(r.ready,true);assert.equal(r.verified,false);assert.deepEqual(s.reads(),{enumerations:2,queries:21});
 assert.equal('ids' in r,false);assert.deepEqual(s.submitted,[{completion:r}]);await s.checkLifetimeCompletion();assert.equal(s.reads().enumerations,2,'bounded repeated audit');
});
test('permission revocation and index replacement during the audit never produce a ready candidate',async()=>{
 for(const options of [{revoke:true},{changeIndex:true}]){const s=setup(options);await s.checkLifetimeCompletion();assert.equal(s.values.get('lifetimeCompletionCandidate:v1').ready,false);assert.equal(s.submitted.length,0);}
});
test('metadata failures fail closed, limited access does not enumerate, web does not open its file picker',async()=>{
 const failed=setup({failures:true});await assert.rejects(failed.checkLifetimeCompletion());assert.equal(failed.values.get('lifetimeCompletionCandidate:v1').ready,false);
 for(const options of [{limited:true},{web:true}]){const s=setup(options);await s.checkLifetimeCompletion();assert.equal(s.reads().enumerations,0);assert.equal(s.values.get('lifetimeCompletionCandidate:v1')?.ready??false,false);}
});

test('free/trial/expired skip the audit; becoming paid checks completion, and expiry during audit prevents submission',async()=>{
 const options={ineligible:true};const s=setup(options);
 await s.checkLifetimeCompletion();assert.equal(s.reads().enumerations,0);assert.equal(s.submitted.length,0);
 options.ineligible=false;await s.checkLifetimeCompletion();assert.equal(s.submitted.length,1);
 const expired=setup({expireDuringAudit:true});await expired.checkLifetimeCompletion();
 assert.equal(expired.values.get('lifetimeCompletionCandidate:v1').ready,true);
 assert.equal(expired.submitted.length,0);
});

test('paused launch skips native inventories and completion submissions',async()=>{
 const s=setup({enabled:false});await s.checkLifetimeCompletion();
 assert.deepEqual(s.reads(),{enumerations:0,queries:0});assert.equal(s.submitted.length,0);
 assert.equal(s.values.has('lifetimeCompletionCandidate:v1'),false);
});
