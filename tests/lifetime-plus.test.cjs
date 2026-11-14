const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { makeLoader } = require('./loader.cjs');
const loader = makeLoader();
const policy = loader('lib/pictopia/lifetime-plus.ts');
const { resolveEntitlement } = loader('lib/pictopia/entitlement.ts');
const now = 1000000;
const completion = { eventId: 'verified:event', completedAt: now - 1, distinctEligiblePhotos: 10000, remainingPhotos: 0, fullAccess: true, scanComplete: true, scanSkipped: 0, libraryReliable: true, verified: true };
const paid = { paidAt: 500, expiresAt: now + 1000 };
for (const [name, changes] of Object.entries({ belowThreshold: { distinctEligiblePhotos: 9999 }, unexplored: { remainingPhotos: 1 }, limitedAccess: { fullAccess: false }, scanRunning: { scanComplete: false }, scanSkipped: { scanSkipped: 1 }, unreliableSync: { libraryReliable: false }, localCounts: { verified: false }, missingEvent: { eventId: '' }, futureEvent: { completedAt: Date.now() + 86400000 } })) {
  test(`${name} cannot grant lifetime`, () => assert.equal(policy.qualifiesForLifetime(paid, { ...completion, ...changes }, now), false));
}
test('exact threshold and larger verified completions qualify', () => {
  assert.equal(policy.qualifiesForLifetime(paid, completion, now), true);
  assert.equal(policy.qualifiesForLifetime(paid, { ...completion, distinctEligiblePhotos: 10001 }, now), true);
});
test('only a current paid period covering completion qualifies; no previous-payment history is needed', () => {
  for (const period of [null, {paidAt:500,expiresAt:now}, {paidAt:now,expiresAt:now+1000}]) assert.equal(policy.qualifiesForLifetime(period, completion, now), false);
  assert.equal(policy.qualifiesForLifetime({paidAt:completion.completedAt,expiresAt:now+1000},completion,now),true);
  assert.equal(policy.qualifiesForLifetime(paid,{...completion,completedAt:now-300001},now),false);
});
const claims = { version: 1, entitlement: 'lifetime_plus', installation: 'owner', firstPaidAt: 500, awardedAt: 900, issuedAt: now };
const accept = async () => true;
test('local flags and reconstructed claim JSON never grant access', () => {
  assert.equal(resolveEntitlement(null, null, false, now, claims).pro, false);
  assert.equal(policy.isLifetimeAward({ active: true, lifetime_plus: true }), false);
});
test('legacy historical membership never shows eligibility or grants lifetime', async () => {
  const member = await policy.verifyLifetimeReceipt({ payload: JSON.stringify({ ...claims, awardedAt: null }), signature: 'test' }, 'owner', accept, now);
  assert.ok(member);
  assert.equal(policy.showLifetimeAchievement(member,now),false);
  assert.equal(resolveEntitlement(null, null, false, now, member).pro, false);
});
test('lifetime survives inactive, expired and canceled subscription state', async () => {
  const award = await policy.verifyLifetimeReceipt({ payload: JSON.stringify(claims), signature: 'test' }, 'owner', accept, now);
  for (const store of [null, { active: false, expires: null, verifiedAt: now }, { active: true, expires: 1, verifiedAt: 1 }]) {
    assert.equal(resolveEntitlement(store, null, false, now, award).pro, true);
    assert.equal(resolveEntitlement(store, null, false, now, award).source, 'lifetime');
  }
  assert.equal(resolveEntitlement(null, null, false, now, { ...award }).pro, false);
});
test('wrong installation, invalid signatures and malformed timelines fail closed', async () => {
  const r = { payload: JSON.stringify(claims), signature: 'test' };
  assert.equal(await policy.verifyLifetimeReceipt(r, 'another', accept, now), null);
  assert.equal(await policy.verifyLifetimeReceipt(r, 'owner', async () => false, now), null);
  for (const patch of [{ firstPaidAt: 0 }, { awardedAt: 499 }, { awardedAt: now + 1 }, { issuedAt: now + 999999 }, { entitlement: 'pro' }, { version: 2 }]) {
    assert.equal(await policy.verifyLifetimeReceipt({ ...r, payload: JSON.stringify({ ...claims, ...patch }) }, 'owner', accept, now), null);
  }
});
test('real P-256 receipt verifies offline after serialization/restart; tampering fails', async () => {
  global.crypto = webcrypto;
  const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign','verify']);
  const publicKey = Buffer.from(await webcrypto.subtle.exportKey('spki', keys.publicKey)).toString('base64');
  const payload = JSON.stringify(claims);
  const signature = Buffer.from(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, new TextEncoder().encode(payload))).toString('base64');
  const { lifetimeSignature } = loader('services/lifetime-signature.web.ts');
  const verify = (p,s) => lifetimeSignature.verify(p,s,publicKey);
  const receipt = JSON.parse(JSON.stringify({payload,signature}));
  const fresh = makeLoader()('lib/pictopia/lifetime-plus.ts');
  assert.equal(fresh.isLifetimeAward(await fresh.verifyLifetimeReceipt(receipt,'owner',verify,now)), true);
  assert.equal(await fresh.verifyLifetimeReceipt({...receipt,payload:payload.replace('900','901')},'owner',verify,now),null);
  assert.equal(await lifetimeSignature.verify(payload,'malformed',publicKey),false);
});

test('achievement follows free → trial → paid → canceled-unexpired → expired, while an award remains visible', async () => {
  const receipt = async patch => policy.verifyLifetimeReceipt({payload:JSON.stringify({...claims,awardedAt:null,...patch}),signature:'test'},'owner',accept,now);
  assert.equal(policy.showLifetimeAchievement(null,now),false);
  assert.equal(policy.showLifetimeAchievement(await receipt({paidUntil:null}),now),false);
  const paidMember = await receipt({paidUntil:now+1000});
  assert.equal(policy.showLifetimeAchievement(paidMember,now),true);
  assert.equal(policy.isLifetimeAward(paidMember),false);
  assert.equal(policy.showLifetimeAchievement(paidMember,now+999),true);
  assert.equal(policy.showLifetimeAchievement(paidMember,now+1000),false);
  assert.equal(policy.showLifetimeAchievement(await receipt({paidUntil:now+9999999}),now+900000),false);
  const award = await receipt({awardedAt:900,paidUntil:null});
  assert.equal(policy.showLifetimeAchievement(award,now+999999999),true);
});
