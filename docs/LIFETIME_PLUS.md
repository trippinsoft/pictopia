# Pictopia+ for Life

## Eligibility and completion

Only a **currently active, paid Pictopia+ subscription** exposes the achievement beneath The Big Picture or can earn a new award. Any existing paid subscription plan qualifies. Free users, free trials, expired subscriptions, refunded/revoked purchases and developer overrides do not qualify. Canceling renewal leaves the current paid period eligible until expiry. Already-earned lifetime members always retain their award and permanent access.

The local completion check requires at least 10,000 distinct eligible photo IDs, zero unexplored eligible photos, full permission, a reliable complete index and a finished scan with no skipped items. Videos are excluded. Confirmed Pictopia deletions count; pending discards and external disappearances do not add deleted credits. Restored IDs count once. Two fresh native inventories surround serialized saved records and scan/index checks. No photo content or identifiers are uploaded.

A passing audit is submitted automatically to the existing Supabase function, which freshly checks the current paid subscription before awarding. The audit time must fall within the current paid period and be at most five minutes old; expiry during verification fails closed. Completion already present when a trial converts or a user subscribes can qualify after a fresh local consistency check while paid. There is no historical subscription search, earliest-payment requirement, previous-payment eligibility or historical completion reconstruction.

Local aggregates are accepted as consistency checks under this product policy, **not attested proof of photo activity**. No accounts, device attestation, extra anti-tampering infrastructure, RevenueCat, new service or dependency is introduced. The local audit's `verified:false` describes this boundary; only the server issues a signed entitlement.

## Existing subscription verification

Direct Expo IAP remains the purchase path. `purchaseService.evidence()` supplies owned native evidence; explicit Restore alone may prompt an ownership refresh. Web supplies no fabricated store evidence. Current subscription evidence refreshes at most every 15 minutes during normal operation; purchase, Restore and completion requests recheck immediately. Status refresh runs on startup, foreground and every five active minutes. Unearned eligibility expires with its paid period or verification window.

Apple verification retains existing signed JWS checks and platform identity binding, but reads **current subscription statuses**, not transaction history. Only an active, unrevoked, owned Production subscription with a positive current price, future expiry and no FREE_TRIAL qualifies. Current/expired/trial store identity may still restore an already-earned award. The Publishing App Store Connect key is not accessed or reused.

Google checks the current subscription and its latest successful order to distinguish an actually paid current period from a trial. ACTIVE or CANCELED with future expiry and a processed positive current order qualifies. Expired, grace/retry/hold, pending, trial and test periods cannot earn. This is current-period verification, not a previous-payment search. Only authoritative linked tokens supply restore aliases; unrelated tokens never merge.

## Award and persistence

Existing project `hvacjgfjmzxxirjxhkgl` stores private platform-scoped identities, installation bindings, current paid-period eligibility and idempotent lifetime awards. `supabase/lifetime-current-subscription.sql` upgrades the existing schema; older schema files are retained as its prerequisites. Legacy `first_paid_at`/`firstPaidAt` remain for receipt and restore compatibility only and do not establish eligibility.

Service-only RPCs ingest the verified current paid period and passing local aggregate. The award transaction locks membership/store identity, checks current eligibility and the release switch, and grants at most one permanent award per store identity. The client cannot directly invoke these RPCs. Installation credentials, existing rate limits and private-table policies remain in use.

P-256 receipts bind the permanent award to the installation capability. The app verifies signatures before caching or publishing access and re-verifies saved receipts before screens become ready. Earned awards work offline and survive subscription expiry, cancellation, failed refresh, stale membership-only responses and restarts. Repeated completion requests cannot create duplicate awards. The central entitlement resolver alone applies active subscription or verified lifetime access.

Earning lifetime does **not cancel store billing**. The earned dialog explains this and opens Manage subscription.

## Restoration limitations

- Offline restoration works on the same installation when its capability and signed receipt survive.
- Apple same-platform reinstall/device restoration depends on signed app identity when available; verified original subscription lineage is the fallback for older SDK/OS support. Real-device restoration remains unvalidated.
- Google restoration requires Play to return a verifiable purchase token or linked lineage. Fully expired subscriptions may no longer be returned after reinstall, and old-token verification has a limited lifetime. Fully expired reinstall recovery cannot be guaranteed.
- Apple and Google identities are not linked. There is no account, cross-platform sync or additional recovery mechanism. No new purchase is required as a substitute for recovery.

## Release gate and validation

**Live awards remain disabled.** The database switch `pictopia_rewards.lifetime_release_gate.awarding_enabled` stays false. Delivery needs the existing signing secret and matching app public key; store verification needs its existing server credentials and `LIFETIME_STORE_VERIFICATION_ENABLED=true`. Those credentials and native store flows must be validated before enabling live awards through Publishing/release configuration.

Host tests cover eligibility transitions, threshold/distinct-photo rules, completion timing, cancellation and expiry during verification, automatic submission, signed persistence and non-revocation. `tests/sql/lifetime-plus.sql` tests actual database award/restore behavior inside a rollback-only transaction; it leaves the live gate off and no test awards. Type/lint and web checks cannot validate real StoreKit/Play, native enumeration, Apple certificate compatibility/revocation behavior or device restoration. Those remain release checks in Pro simulators where supported or a Publishing test build. Do not infer native validation from host tests.
