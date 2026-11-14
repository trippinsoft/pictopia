// No user accounts: a random installation capability authenticates each wallet.
// Only its SHA-256 is stored. Public API keys never authorize database wallet writes.
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, content-type, x-installation-token', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
Deno.serve(async request => {
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  const token = request.headers.get('x-installation-token') ?? '';
  if (!/^[a-f0-9]{64}$/.test(token)) return reply({ error: 'Invalid installation credential.' }, 401);
  try {
    const raw = await request.text();
    if (raw.length > 256) return reply({ error: 'Request too large.' }, 413);
    const body = JSON.parse(raw);
    if (!['sync','redeem'].includes(body?.operation)) return reply({ error: 'Invalid request.' }, 400);
    const network = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const url = Deno.env.get('SUPABASE_URL');
    if (!secret || !url) return reply({ error: 'Rewards are temporarily unavailable.' }, 503);
    const response = await fetch(`${url}/rest/v1/rpc/pictopia_referrals_v1`, {
      method: 'POST', headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token_hash: await hash(token), p_network_hash: await hash(network), p_operation: body.operation, p_code: typeof body.code === 'string' ? body.code.trim().toUpperCase() : null }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return reply({ error: 'Rewards are temporarily unavailable. Please try again.' }, 503);
    const result = await response.json();
    return reply(result, result.rateLimited ? 429 : result.error ? 400 : 200);
  } catch { return reply({ error: 'Couldn’t connect to rewards. Please try again.' }, 503); }
});
export {};
