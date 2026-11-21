# Amplitude

## Configuration

Pictopia uses the owner's Amplitude project **Pictopia** (`909085`) in the **US** region. The public project API key and server zone are configured in Draftbit's DEVELOPMENT, STAGING and PRODUCTION environments; keys are not committed to this repository. The connected Amplitude analysis tool currently lacks read permission for this project, independently of event ingestion.

The connected Amplitude account is for analysis; it does not supply an ingestion key or support creating projects through its tools. Choose/create a Pictopia project in Amplitude and copy its **project API key**, never its secret key. Set `EXPO_PUBLIC_AMPLITUDE_API_KEY` in the intended Draftbit environments and `EXPO_PUBLIC_AMPLITUDE_SERVER_ZONE` to the project's data residency (`US` by default, or `EU`). Without a key, initialization, local identifier creation and event delivery are disabled. Do not reuse an unrelated app's project.

Use separate project keys per environment if desired; all events also carry `environment` (`DEVELOPMENT`, `STAGING`, `PRODUCTION`) and `platform`. Native changes require a new binary through Publishing → Testing Builds; web uses the browser SDK and never imports the native SDK.

## Events

| Event | Trigger | Additional properties |
| --- | --- | --- |
| `app_opened` | Root content first mounts | None |
| `app_foregrounded` | Native returns to active; browser tab becomes visible | None |
| `screen_viewed` | Navigation to a different allowlisted screen | `screen`: fixed human-readable name |

`lib/pictopia/analytics-policy.ts` owns the allowlist. Screen visits describe navigation, not successful review completion, deletion or purchase. Query/route parameters are excluded, so switching photo IDs, dates or games on the same route does not produce another screen visit. Redirects, unknown routes and developer-only screens are ignored. Per-photo decisions are excluded. Subscription instrumentation is described below.

## Pictopia+ funnel

All events below include `platform` and `environment` (Draftbit deployment environment). `plan` is `weekly`, `annual`, or the supported legacy `monthly`; `product_id` is allowlisted to `pictopia.pro.weekly`, `pictopia.pro.annual`, `pictopia.pro.monthly`. No pricing or paywall design changes are involved.

| Event | Where it fires | Exact additional properties |
| --- | --- | --- |
| `paywall_viewed` | Regular paywall mounts with the provider ready; onboarding offer becomes visible after offers load. Once per mounted offer, never on a provider refresh. | `entry_point`, `premium_access`, `trial_eligibility` |
| `subscription_selected` | A default plan first becomes visible, a retry changes the default, or the user selects a different plan in either plan picker. | `product_id`, `plan`, `localized_price`, `price_amount`, `currency`, `free_trial_available`, `trial_eligibility`, `selection_source` (`default` / `user`) |
| `purchase_started` | Direct IAP service prepares a real store request after validating the loaded product and capturing pre-purchase verified history. | `product_id`, `plan`, `trial_eligibility`; loaded offer adds `localized_price`, `price_amount`, `currency`, `free_trial_available` |
| `trial_started` | IAP purchased callback with active store access; native helper verifies the exact new transaction and introductory free-trial payment mode. Emitted before `purchase_completed`, once for that transaction. | `product_id`, `plan`, `purchase_type=trial`, `store_environment`, `distribution`; `trial_duration_days` and `expires_at` when reported |
| `purchase_completed` | Same verified transaction boundary, after local deduplication is durably saved. Never from a tap, saved entitlement, restore, startup replay or renewal callback. | `product_id`, `plan`, `purchase_type` (`trial` / `paid` / `unknown`), `store_environment`, `distribution`; `expires_at` when reported |
| `purchase_failed` | Direct IAP error listener/request rejection, pending approval, unsuccessful store entitlement check, or failed exact-transaction verification. | `product_id`, `plan` when known, `error_reason`, `user_cancelled` |
| `subscription_restored` | Explicit restore completes, existing store entitlement is active, and native helper independently verifies an active/grace entitlement. Each successful restore operation may emit once; restoring the same subscription does not emit a purchase. | `product_id`, `plan`, `purchase_type`, `store_environment`, `distribution`, `entitlement_type` (`apple_subscription` / `family_shared`); `expires_at` when reported |
| `subscription_status_changed` | A successful StoreKit refresh/listener/startup checks verified transaction AND renewal status, then compares against the saved analytics status. First observation establishes a baseline. | `previous_status`, `status`; when a transaction exists, `product_id`, `plan`, `purchase_type`, `store_environment`, `distribution`, optional `expires_at` |

Entry points: `Home`, `Settings`, `daily_limit`, `Adventure`, `Explore`, `Smart Clean`, `Duplicates`, `Statistics`, `Onboarding`, `unknown`. Current links supply their fixed tag; Home has no direct upgrade link. Untagged/deep-linked entries are `unknown`; raw route values never leave the device. Trial eligibility/availability is boolean when the store knows it, otherwise `unknown`. The regular paywall can report unknown eligibility while loading; subsequent selection/start events carry loaded eligibility. Offer eligibility lookup failure preserves the existing no-unconfirmed-trial UI behavior.

Failure reasons: `user_cancelled`, `store_error`, `network_error`, `unavailable`, `pending_approval`, `verification_failed`. Cancellation explicitly sets `user_cancelled=true`; all other categories set false. No raw error messages are sent. A pending purchase is not a conversion. A restore with no entitlement emits no restore-success event.

States: `none`, `trial`, `active_paid`, `active_unknown`, `expired`, `grace_period`, `billing_retry`, `revoked`. Only actual changes in verified states emit; repeated focus/foreground/store refreshes are silent. Cancellation of auto-renew does not immediately mean expired. Expiry is the signed subscription expiration, not a promised next billing date; `next_billing_at` is not emitted. Trial duration is the actual signed transaction period in days, so accelerated sandbox trials can have fractional durations instead of production's three days.

`store_environment` is verified StoreKit `production`, `sandbox`, `xcode`, or `unknown`. `distribution` is `development`, `app_store`, `testflight_inferred`, or `unknown`: release sandbox receipt plus absence of an embedded provisioning profile supplies the explicitly inferred TestFlight hint. Sandbox alone never claims TestFlight. Production conversion reporting must filter `store_environment=production`; the deployment environment alone does not prove real billing.

### Guarantees and remaining gaps

- `resolveEntitlement` remains the only access decision; lifetime awards and their restore logic are unchanged. Native helpers only read StoreKit. The analytics ledger (`subscriptionAnalytics:v1`) stores status and hashed transaction fingerprints, never receipts/tokens or a parallel access state. Verified pre-purchase history rejects old redelivery without depending on the phone clock; fingerprints never leave the device.
- Successful transactions save their delivery marker before Amplitude invocation. Concurrent callbacks and relaunch cannot invoke conversion events twice for the same transaction while local storage is retained. A crash after marker persistence but before SDK ingestion, network loss, disabled analytics, or clearing/reinstalling local storage can lose attribution. This is at-most-once local invocation, not a server exactly-once delivery guarantee.
- Free-trial classification requires iOS 17.2+ verified `Transaction.offer` payment mode. Earlier ambiguous offers stay `purchase_type=unknown` / `active_unknown` and never emit `trial_started`. Missing transaction reason, unavailable history, missing native helper in an older binary or failed native verification suppress conversions. Status verification failures retain the last analytics baseline and do not invent expiry.
- Real lifetime awards never emit Apple purchase/trial events. Lifetime simulations, authorized Free/Plus developer overrides and Xcode transactions suppress real subscription conversions. Genuine sandbox store purchases under Automatic access remain tagged sandbox and are suitable for testing.
- No App Store Server Notifications or authoritative server lifecycle ingestion has been implemented. While the app is closed, renewals, trial-to-paid charges, refunds and intermediate state changes are not reliably captured. On reopening, verified current-state transitions can be observed, but no historical paid-conversion/revenue event is inferred. Pending/Ask to Buy approval after the original in-memory purchase attempt ends also does not complete the analytics funnel.
- Android/web retain offers, selections, purchase-start/error behavior where supported, but verified conversion/restore/lifecycle events are iOS-only. No Play server verifier or browser store simulation is added. No event uses Amplitude's revenue API or `$revenue`/`$price`; trial starts never count as paid revenue. Paid purchases are distinguished by `purchase_type=paid`, not an invented revenue amount.
- Native helper compilation, real StoreKit behavior and actual Amplitude project ingestion require a new iOS binary and physical-iPhone testing through Publishing/TestFlight. Host tests use mocked StoreKit and cannot validate Apple's signed transactions or billing.

### Native release checks

In a new published iPhone/TestFlight build, use Automatic access with lifetime simulations reset. Verify an eligible three-day trial, ineligible paid Weekly/Annual purchases, user cancellation, store/verification failure, active and empty restores, relaunch without duplicate conversions, sandbox accelerated trial-to-paid/expiry, and grace/retry/revocation where Apple's test tools support them. Inspect Amplitude's event stream for the documented properties, environment filtering, no sensitive data and no trial revenue. Verify one production transaction after release separately. The web preview can only validate the paywall/navigation shell and web-safe SDK boundary.

## Privacy and delivery

SDK-generated random installation identity only; no `identify` or account linkage. No photos/videos, media IDs, filenames, library dates, referral codes, URL parameters or user-entered values. SDK context includes timestamps, session identifiers and basic browser/OS context. Advertising/vendor identifiers, country/carrier/language enrichment, IP location enrichment, automatic interaction capture, remote configuration, diagnostics (browser) and session replay are disabled. Browser identity uses local storage. Clearing app/browser storage resets the analytics identity independently of referral/review records.

SDK initialization and delivery run independently of library state; errors are swallowed and cannot block browsing, decisions, deletion, allowance or rewards. Flush on background is best effort. No analytics code touches the media repository or referral wallet. The legal screen and store privacy draft disclose the collection; publisher review of final privacy declarations is still required before distribution.

## Verification

After configuring a real key, open Home, Explore and Progress, then background/foreground the app. In Amplitude's event stream verify the app/navigation event types, platform/environment tags, fixed screen names and a random device identifier with no user ID. Inspect event properties to confirm no media/route data is present. Repeat on a newly published native testing build; host checks cannot validate native SDK linking. Ad blockers, offline use or a missing/invalid key can prevent delivery; successful compilation alone does not verify account ingestion.
