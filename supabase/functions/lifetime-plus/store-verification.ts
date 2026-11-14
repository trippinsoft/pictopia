/// <reference types="node" />
/** Server-only verification. No third-party runtime dependencies, no store secrets in clients. */
import { X509Certificate, verify as verifySignature } from 'node:crypto';
import { Buffer } from 'node:buffer';
export const APP_ID = 'com.trippinsoft.pictopia';
const PRODUCTS = new Set(['pictopia.pro.weekly', 'pictopia.pro.monthly', 'pictopia.pro.annual']);
const APPLE_ROOT = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c7566f3017b3a8c488c3653e9179';
export interface StorePayment {
  platform: 'ios' | 'android';
  subject: string;
  aliases: string[];
  proofId: string;
  paidAt: number;
  /** Zero means identity can restore an award but cannot earn a new one. */
  expiresAt: number;
}
export type StoreEvidence = { platform: 'ios'; appJws?: string; transactions: string[] } | { platform: 'android'; tokens: string[] };
type Fields = Record<string, unknown>;
export interface StoreConfig {
  appleAppId?: string;
  appleIssuer?: string;
  appleKeyId?: string;
  applePrivateKey?: string;
  googleServiceAccount?: string;
}
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const timestamp = (v: unknown, now: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= now;
const base64url = (value: Uint8Array | string) => Buffer.from(value).toString('base64url');
const decode = (value: string) => JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Fields;
const sha = async (value: string) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('hex');

// Strict DER traversal confines Apple policy OIDs to actual certificate extensions.
interface Der { tag: number; start: number; end: number }
function children(bytes: Uint8Array, from: number, end: number): Der[] {
  const nodes: Der[] = [];
  for (let at = from; at < end;) {
    const tag = bytes[at++]; let length = bytes[at++];
    if (length & 128) {
      const count = length & 127;
      if (!count || count > 4 || at + count > end) throw Error('Invalid certificate');
      length = 0;
      for (let n = 0; n < count; n++) length = length * 256 + bytes[at++];
    }
    if (!Number.isSafeInteger(length) || at + length > end) throw Error('Invalid certificate');
    nodes.push({ tag, start: at, end: at + length }); at += length;
  }
  return nodes;
}
function extension(cert: X509Certificate, oid: string) {
  const bytes = cert.raw;
  const outer = children(bytes, 0, bytes.length)[0];
  const tbs = children(bytes, outer.start, outer.end)[0];
  const extensions = children(bytes, tbs.start, tbs.end).find(n => n.tag === 0xa3);
  if (!extensions) return false;
  const sequence = children(bytes, extensions.start, extensions.end)[0];
  return children(bytes, sequence.start, sequence.end).some(ext => {
    const key = children(bytes, ext.start, ext.end)[0];
    return key.tag === 6 && bytes.subarray(key.start, key.end).toString('hex') === oid;
  });
}
export function verifyAppleJws(jws: string, appId: string, kind: 'app' | 'transaction', now = Date.now()): Fields {
  if (jws.length > 32768 || !/^\d+$/.test(appId)) throw Error('Invalid Apple evidence');
  const parts = jws.split('.');
  if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw Error('Invalid Apple evidence');
  const header = decode(parts[0]); const payload = decode(parts[1]);
  if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length !== 3 || !header.x5c.every(v => typeof v === 'string' && v.length <= 8192)) throw Error('Invalid Apple certificate chain');
  const [leaf, intermediate, root] = header.x5c.map(v => new X509Certificate(Buffer.from(v as string, 'base64')));
  if (root.fingerprint256.replace(/:/g, '').toLowerCase() !== APPLE_ROOT || !root.ca || leaf.ca || !intermediate.ca ||
    !root.verify(root.publicKey) || !intermediate.checkIssued(root) || !intermediate.verify(root.publicKey) ||
    !leaf.checkIssued(intermediate) || !leaf.verify(intermediate.publicKey) ||
    !extension(leaf, '2a864886f76364060b01') || !extension(intermediate, '2a864886f76364060201')) throw Error('Untrusted Apple certificate');
  const signedAt = kind === 'app' ? payload.receiptCreationDate : payload.signedDate;
  if (!timestamp(signedAt, now + 300000)) throw Error('Invalid Apple signing date');
  for (const cert of [leaf, intermediate, root]) {
    if (signedAt < Date.parse(cert.validFrom) || signedAt > Date.parse(cert.validTo)) throw Error('Apple certificate outside validity');
  }
  if (leaf.publicKey.asymmetricKeyType !== 'ec' || leaf.publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1' ||
    !verifySignature('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'))) throw Error('Invalid Apple signature');
  if (payload.bundleId !== APP_ID || (kind === 'app' ? payload.receiptType : payload.environment) !== 'Production' ||
    (kind === 'app' && String(payload.appAppleId) !== appId)) throw Error('Wrong Apple app or environment');
  return payload;
}

async function jsonGet(url: string, bearer: string, send: typeof fetch): Promise<Fields> {
  const response = await send(url, { headers: { Authorization: `Bearer ${bearer}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error('Store verification temporarily unavailable');
  return response.json();
}
function pemBytes(value: string) { return Uint8Array.from(Buffer.from(value.replace(/-----[^-]+-----|\s/g, ''), 'base64')); }
async function jwt(header: Fields, claims: Fields, pem: string, algorithm: 'ES256' | 'RS256') {
  const params = algorithm === 'ES256' ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(pem), params, false, ['sign']);
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signed = await crypto.subtle.sign(algorithm === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(input));
  return `${input}.${base64url(new Uint8Array(signed))}`;
}
export function applePaidTransaction(value: Fields, now = Date.now()): boolean {
  return value.bundleId === APP_ID && value.environment === 'Production' && value.type === 'Auto-Renewable Subscription' &&
    text(value.productId) && PRODUCTS.has(value.productId) && text(value.transactionId) && text(value.originalTransactionId) &&
    value.inAppOwnershipType === 'PURCHASED' && value.revocationDate == null && value.offerDiscountType !== 'FREE_TRIAL' &&
    typeof value.price === 'number' && Number.isSafeInteger(value.price) && value.price > 0 &&
    timestamp(value.purchaseDate, now) && Number.isSafeInteger(value.expiresDate) && Number(value.expiresDate) > now && typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency);
}
export async function verifyApplePayment(evidence: Extract<StoreEvidence, { platform: 'ios' }>, config: StoreConfig, send = fetch, now = Date.now()): Promise<StorePayment | null> {
  const { appleAppId, appleIssuer, appleKeyId, applePrivateKey } = config;
  if (!appleAppId || !appleIssuer || !appleKeyId || !applePrivateKey) throw Error('Apple payment verification is not configured');
  const app = evidence.appJws ? verifyAppleJws(evidence.appJws, appleAppId, 'app', now) : null;
  const transactions = evidence.transactions.map(jws => verifyAppleJws(jws, appleAppId, 'transaction', now));
  const anchor = app?.appTransactionId ?? transactions[0]?.originalTransactionId;
  if (!text(anchor) || !/^\d{1,50}$/.test(anchor)) return null;
  const seconds = Math.floor(now / 1000);
  const bearer = await jwt({ alg: 'ES256', kid: appleKeyId, typ: 'JWT' }, { iss: appleIssuer, iat: seconds, exp: seconds + 300, aud: 'appstoreconnect-v1', bid: APP_ID }, applePrivateKey, 'ES256');
  // Current subscription status only; never enumerate historical payments.
  const result = await jsonGet(`https://api.storekit.apple.com/inApps/v1/subscriptions/${encodeURIComponent(anchor)}`, bearer, send);
  if (result.bundleId !== APP_ID || String(result.appAppleId) !== appleAppId || result.environment !== 'Production' || !Array.isArray(result.data)) throw Error('Wrong Apple subscription status');
  let chosen: { transaction: Fields; active: boolean } | null = null;
  for (const group of result.data as Fields[]) {
    if (!Array.isArray(group.lastTransactions)) continue;
    for (const entry of group.lastTransactions as Fields[]) {
      if (!text(entry.signedTransactionInfo)) continue;
      const t = verifyAppleJws(entry.signedTransactionInfo, appleAppId, 'transaction', now);
      const sameOwner = app ? t.appTransactionId === app.appTransactionId : t.originalTransactionId === anchor;
      if (!sameOwner || !text(t.productId) || !PRODUCTS.has(t.productId) || t.inAppOwnershipType !== 'PURCHASED' || !timestamp(t.purchaseDate, now)) continue;
      const active = entry.status === 1 && applePaidTransaction(t, now);
      if (!chosen || (active && !chosen.active) || (active === chosen.active && Number(t.purchaseDate) > Number(chosen.transaction.purchaseDate))) chosen = { transaction: t, active };
    }
  }
  if (!chosen) return null;
  const t = chosen.transaction;
  const subject = `ios:${await sha(`${app?.appTransactionId || t.appTransactionId ? 'app' : 'original'}:${app?.appTransactionId ?? t.appTransactionId ?? t.originalTransactionId}`)}`;
  return { platform: 'ios', subject, aliases: [...new Set([subject, `ios:${await sha(`original:${String(t.originalTransactionId)}`)}`])], proofId: `ios:${await sha(String(t.transactionId))}`, paidAt: Number(t.purchaseDate), expiresAt: chosen.active ? Number(t.expiresDate) : 0 };
}

interface GoogleOrder extends Fields {
  lineItems?: { productId?: string; total?: { units?: string; nanos?: number }; subscriptionDetails?: { offerPhase?: string } }[];
  orderHistory?: { processedEvent?: { eventTime?: string }; refundEvent?: unknown; partialRefundEvents?: unknown[] };
}
export function googlePaidOrder(order: GoogleOrder, token: string, orderId: string, now = Date.now()): number | null {
  const paidAt = Date.parse(order.orderHistory?.processedEvent?.eventTime ?? '');
  const item = order.lineItems?.find(item => item.productId && PRODUCTS.has(item.productId) && item.subscriptionDetails && item.subscriptionDetails.offerPhase !== 'FREE_TRIAL');
  const units = item?.total?.units ?? '0'; const nanos = item?.total?.nanos ?? 0;
  const positive = /^\d{1,15}$/.test(units) && Number.isInteger(nanos) && nanos >= 0 && nanos < 1e9 && (BigInt(units) > 0n || nanos > 0);
  return order.orderId === orderId && order.purchaseToken === token && order.state === 'PROCESSED' &&
    !order.orderHistory?.refundEvent && !order.orderHistory?.partialRefundEvents?.length && positive && timestamp(paidAt, now) ? paidAt : null;
}
async function googleAccess(config: StoreConfig, send: typeof fetch, now: number) {
  if (!config.googleServiceAccount) throw Error('Google payment verification is not configured');
  const account = JSON.parse(config.googleServiceAccount) as Fields;
  if (!text(account.client_email) || !text(account.private_key)) throw Error('Invalid Google verification configuration');
  const seconds = Math.floor(now / 1000);
  const assertion = await jwt({ alg: 'RS256', typ: 'JWT' }, { iss: account.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: seconds, exp: seconds + 300 }, account.private_key, 'RS256');
  const response = await send('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), redirect: 'error', signal: AbortSignal.timeout(10000) });
  const data: Fields = await response.json();
  if (!response.ok || !text(data.access_token)) throw Error('Google verification temporarily unavailable');
  return data.access_token;
}
export async function verifyGooglePayment(evidence: Extract<StoreEvidence, { platform: 'android' }>, config: StoreConfig, send = fetch, now = Date.now()): Promise<StorePayment | null> {
  if (!evidence.tokens.length) return null;
  const bearer = await googleAccess(config, send, now);
  let paid: StorePayment | null = null;
  for (const token of evidence.tokens) {
    const result = await jsonGet(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${APP_ID}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`, bearer, send);
    if (result.kind !== 'androidpublisher#subscriptionPurchaseV2' || result.testPurchase != null || !Array.isArray(result.lineItems) ||
      !['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_CANCELED', 'SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'].includes(String(result.subscriptionState))) continue;
    if (!(result.lineItems as Fields[]).some(line => text(line.productId) && PRODUCTS.has(line.productId))) continue;
    const subject = `android:${await sha(token)}`;
    const related = new Set([subject]);
    if (text(result.linkedPurchaseToken)) related.add(`android:${await sha(result.linkedPurchaseToken)}`);
    // An expired/trial identity can recover an existing award, never earn a new one.
    const candidate: StorePayment = { platform: 'android', subject, aliases: [...related], proofId: `android:${await sha(token)}`, paidAt: now, expiresAt: 0 };
    for (const line of result.lineItems as Fields[]) {
      if (!text(line.productId) || !PRODUCTS.has(line.productId) || !text(line.latestSuccessfulOrderId)) continue;
      const expiresAt = Date.parse(String(line.expiryTime ?? ''));
      if (!['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_CANCELED'].includes(String(result.subscriptionState)) || !Number.isSafeInteger(expiresAt) || expiresAt <= now) continue;
      const orderId = line.latestSuccessfulOrderId;
      const order = await jsonGet(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${APP_ID}/orders/${encodeURIComponent(orderId)}`, bearer, send);
      const paidAt = googlePaidOrder(order, token, orderId, now);
      if (!paidAt) continue;
      if (expiresAt > candidate.expiresAt) Object.assign(candidate, { paidAt, expiresAt, proofId: `android:${await sha(orderId)}` });
    }
    if (!paid || candidate.expiresAt > paid.expiresAt) paid = candidate;
  }
  return paid;
}
export function parseStoreEvidence(value: unknown): StoreEvidence {
  const v = value as Partial<StoreEvidence> | null;
  if (v?.platform === 'ios' && Array.isArray(v.transactions) && v.transactions.length <= 6 && v.transactions.every(s => typeof s === 'string' && s.length <= 32768) && (v.appJws === undefined || typeof v.appJws === 'string' && v.appJws.length <= 32768)) return v as StoreEvidence;
  if (v?.platform === 'android' && Array.isArray(v.tokens) && v.tokens.length <= 6 && v.tokens.every(s => typeof s === 'string' && /^[\x21-\x7e]{1,8192}$/.test(s))) return v as StoreEvidence;
  throw Error('Invalid store evidence');
}
