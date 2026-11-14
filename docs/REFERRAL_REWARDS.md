# Referral rewards and streak allowances

Pictopia uses the existing Supabase project `hvacjgfjmzxxirjxhkgl` in Data Systems Inc. There is no Auth integration, email collection, referral link, or media upload. The only rewards entry points are the Home gift icon and Settings → Invite a friend. No onboarding prompt or reward popups.

## Approved rules

- Each installation has one unique code and may redeem one incoming code, including existing installations. Both parties receive 1,000 photo/video reviews immediately. Outgoing referrals and earned credits have no product cap or expiry.
- Daily allowance: 100 / 125 / 150 / 175 / 200 on streak days 1 / 2 / 3 / 4 / 5 onward. Only completed preceding local calendar days establish today's tier. Ten distinct reviews or one confirmed deletion qualifies a day. Existing activity qualifies at rollout; no retroactive banked grant. Existing explicit restoration rules apply.
- Daily/streak reviews are spent before referral credits. Only loaded foreground media charges; revisits within the day are free. Pictopia+ never charges either pool. Unused daily allowance resets at local midnight; referral balance does not.
- Undo refunds today's charge once. Daily refunds refill daily capacity first and release any banked charges displaced by that free capacity. Streak restoration similarly releases banked charges if it opens daily slots. Undo's media/session change and refund commit together in production Explore reviews. Historical activity and deletion evidence are never erased by refunds.

## Data and security

`supabase/referrals.sql` is the canonical deployed schema/function definition, applied via Supabase MCP migrations. Private schema `pictopia_rewards` contains installation credential hashes, random public codes, lifetime awarded totals, one redeemed code, creation times, and short-lived rate counters. Tables have RLS and no client grants or policies; only the server role can execute `public.pictopia_referrals_v1` (security invoker). No photo IDs, usage histories, raw network addresses, or private credentials are stored in Supabase.

`supabase/functions/referrals/index.ts` is deployed as `referrals`, with gateway JWT verification off because it authenticates a random 64-hex installation capability itself. It hashes that capability and the gateway network address before the transaction. It uses Supabase's server-provided service-role environment variable; no privileged key ships in the app. Redemption, both awards, incoming-code uniqueness and rate checks commit in one transaction. A short transaction advisory lock gives deterministic concurrent redemption ordering. Repeating a committed code returns the same result without another grant.

Limits per hour: 20 new installations per network; 10 redemption requests per installation / 50 per network; 120 syncs per installation / 300 per network. Rate-limit errors retain counters. Old counters are removed after two hours. This is basic abuse resistance, not device attestation: clearing app data or reinstalling creates another installation. Offline spending assumes the integrity of the local app store; a modified client is outside that trust boundary.

## Offline storage and recovery

Native stores its installation credential in device-only SecureStore; a separate local installation marker avoids inheriting an old keychain identity after reinstall. Web stores the capability in IndexedDB alongside its local installation. Credits are installation-local, without cross-device recovery or accounts. Clearing local data removes wallet access.

`referralWallet:v1` stores the monotonic server awarded total, local spent total, public code, redemption status and optional pending code. `swipeAllowance:v1.referralCounted` identifies today's banked charges. Serialized `storage.put` saves allowance and wallet atomically in SQLite/IndexedDB. Supported browsers share the repository write lock across tabs with the Web Locks API; older browsers fall back to the existing single-context serializer. Server sync merges the latest saved wallet rather than replacing consumption. Pending redemption intent is saved before the request, so lost responses recover with an idempotent retry. Definitive invalid-code responses clear that intent; network failures do not.

The app syncs without blocking photo access at startup, on foreground, on browser reconnect, every five active minutes, and on the referral screen. Mobile connectivity that returns without a foreground event is picked up by the periodic sync. Saved credits spend with no network. Initial registration and redemption require connectivity. No network call is made during a review charge or refund.

The client variables `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` target this existing project in Development, Staging and Production. Rebuild through Draftbit Publishing after adding Crypto, Clipboard and SecureStore; existing binaries do not contain these new native modules.

## Verification tools

- Pure and real-SQLite coverage: `tests/streak-allowance.test.cjs`, `tests/referral-wallet.test.cjs`, `tests/referral-sync.test.cjs`, existing daily/entitlement/Explore/allowance hook suites.
- `tests/referrals-server.cjs` is an explicit live check against the existing project, covering atomic retries, both rewards, self/invalid/duplicate rejection, accumulated outgoing rewards, concurrent mutual redemption, rate limiting and blocked public RPC. It creates random test installations and writes their hashes under `/tmp` for scoped cleanup; it must not be run as part of the regular offline suite.
- Physical-device checks still needed: native secure credentials survive app restart; two devices redeem/sync; airplane-mode spending and Undo survive a restart; midnight and restoration preserve pools; Pictopia+ leaves credits unchanged; Copy/Share invoke the real native sheets.

Referral codes contain exactly seven uppercase hexadecimal characters. No legacy formats or aliases are supported.
