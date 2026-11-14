/** Current store-verified subscription, local consistency summary and signed permanent award. */
// @ts-expect-error Deno deployment resolves explicit TypeScript extensions.
import { parseStoreEvidence, verifyApplePayment, verifyGooglePayment } from './store-verification.ts';
// @ts-expect-error Deno deployment resolves explicit TypeScript extensions.
import { validCompletion } from './completion.ts';
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey,content-type,x-installation-token', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Cache-Control': 'no-store' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const token = request.headers.get('x-installation-token') ?? '';
  if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: 'Installation credential required' }, 401);
  // Live delivery requires configured signing and store credentials.
  const signingKey = Deno.env.get('LIFETIME_PLUS_SIGNING_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  if (!signingKey || !serviceKey || !url) return json({ error: 'Lifetime verification is not enabled yet' }, 503);
  try {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
    const installation = Array.from(hash, n => n.toString(16).padStart(2, '0')).join('');
    const rpc = async (name: string, body: Record<string, unknown>) => {
      const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST', headers: { apikey: serviceKey!, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw Error('Verification unavailable');
      return response.json();
    };
    const raw = await request.text();
    if (raw.length > 262144) return json({ error: 'Evidence too large' }, 413);
    let body: { evidence?: unknown; completion?: unknown };
    try {
      body = JSON.parse(raw);
      if (!body || Array.isArray(body) || Object.keys(body).some(k => k !== 'evidence' && k !== 'completion')) throw Error();
    } catch { return json({ error: 'Invalid request' }, 400); }
    if (body.completion != null && (!validCompletion(body.completion) || body.evidence == null)) return json({ error: 'Fresh completion and subscription evidence required' }, 400);
    if (body.evidence != null) {
      if (Deno.env.get('LIFETIME_STORE_VERIFICATION_ENABLED') !== 'true') return json({ error: 'Store verification is not enabled yet' }, 503);
      let evidence;
      try { evidence = parseStoreEvidence(body.evidence); }
      catch { return json({ error: 'Invalid store evidence' }, 400); }
      if (!await rpc('pictopia_lifetime_payment_rate_v1', { p_installation: installation })) return json({ error: 'Try again later' }, 429);
      const config = {
        appleAppId: Deno.env.get('LIFETIME_APPLE_APP_ID'), appleIssuer: Deno.env.get('LIFETIME_APPLE_ISSUER_ID'),
        appleKeyId: Deno.env.get('LIFETIME_APPLE_KEY_ID'), applePrivateKey: Deno.env.get('LIFETIME_APPLE_PRIVATE_KEY'),
        googleServiceAccount: Deno.env.get('LIFETIME_GOOGLE_SERVICE_ACCOUNT'),
      };
      const payment = evidence.platform === 'ios' ? await verifyApplePayment(evidence, config) : await verifyGooglePayment(evidence, config);
      if (payment) await rpc('pictopia_lifetime_bind_current_v1', {
        p_installation: installation, p_subject: payment.subject, p_aliases: payment.aliases,
        p_paid_at: payment.paidAt, p_proof_id: payment.proofId, p_paid_until: payment.expiresAt,
      });
      else await rpc('pictopia_lifetime_clear_current_v1', { p_installation: installation });
      if (body.completion != null && payment && payment.expiresAt > Date.now() && payment.paidAt <= body.completion.checkedAt) {
        await rpc('pictopia_lifetime_complete_v1', {
          p_installation: installation, p_checked_at: body.completion.checkedAt,
          p_distinct_photos: body.completion.distinctEligiblePhotos,
        });
      }
    }
    const result = await fetch(`${url}/rest/v1/rpc/pictopia_lifetime_status_v1`, {
      method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_installation: installation }), signal: AbortSignal.timeout(10000),
    });
    if (!result.ok) return json({ error: 'Lifetime verification unavailable' }, 503);
    const claims = await result.json();
    if (claims?.error === 'rate_limit') return json({ error: 'Try again later' }, 429);
    if (!claims) return json(null);
    const payload = JSON.stringify(claims);
    const bytes = Uint8Array.from(atob(signingKey), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('pkcs8', bytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(payload)));
    return json({ payload, signature: btoa(String.fromCharCode(...signature)) });
  } catch { return json({ error: 'Lifetime verification unavailable' }, 503); }
});
