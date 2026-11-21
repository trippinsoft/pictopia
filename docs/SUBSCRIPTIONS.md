# Subscription setup

## Current integration

Pictopia uses direct `expo-iap` with StoreKit 2 on iOS and Google Play Billing on Android. `app.config.js` already includes the plugin. The fixed bundle/package identifier is `com.trippinsoft.pictopia`. No RevenueCat project, offerings, SDK keys, shared secret in the app, new backend or client-side store secret is required for this purchase adapter.

Purchase, restore, foreground refresh, expiration checks and store-price paywall rendering are implemented. Real native billing remains a device verification step; browser checkout is intentionally unavailable. App Store Connect read access is enabled for Pictopia (app ID `6826672202`). Group `22587313` (Pictopia+) contains Weekly (`6835699954`) and Annual (`6835699847`), both Level 1, with English localization, price schedules and availability records. US prices are $7.99/week and $29.99/year; the app always displays StoreKit's localized price rather than these documentation values. Both products report `READY_TO_SUBMIT` and both have a 3-day introductory free trial in all 175 territories (no end date). Paid Apps Agreement, tax and banking status remain unverified; check them in Business. Agent access is read-only, so Apple-side configuration must be completed in App Store Connect.

iOS access is derived from StoreKit 2 current entitlements through expo-iap/OpenIAP, which verifies native transactions. The JavaScript adapter accepts only allowlisted products with active status and a finite, future Apple expiry; it never invents an iOS offline period. The entitlement is cached in the existing local database, rechecked on launch/foreground and bounded by expiry (the foreground clock updates every 30 seconds). This cache is not a separately signed receipt or server-authoritative subscription ledger; on a modified device it is not tamper-proof, and offline revocations cannot be discovered until a successful store refresh. No new verification backend or third-party service is introduced. Billing grace-period extension is not modeled separately from the transaction expiry.

## iOS: configure Apple

1. In App Store Connect → Business, the Account Holder must activate the Paid Apps Agreement and complete the required tax/banking information. Resolve any pending agreement.
2. Open Apps → Pictopia and confirm the app belongs to bundle ID `com.trippinsoft.pictopia`.
3. Under Monetization → Subscriptions, use one group, named **Pictopia+**. Reuse an existing matching group. Add its English display name **Pictopia+**.
4. Create or reuse these auto-renewable products with the exact case-sensitive IDs. Do not create duplicates if products already exist. If existing IDs differ, reconcile them with the app before making new products.

| Reference/display name | Product ID | Duration |
| --- | --- | --- |
| Pictopia+ Weekly | `pictopia.pro.weekly` | 1 week |
| Pictopia+ Yearly | `pictopia.pro.annual` | 1 year |

Both plans provide the same Pictopia+ access at the same subscription level in the same group. The paywall shows Yearly and Weekly using real store prices. The adapter retains `pictopia.pro.monthly` as a compatibility/fallback ID, but no Monthly product is configured or required; absent products are not fabricated. Product IDs are fixed strings in `lib/pictopia/store-entitlement.ts`, not environment variables.

5. Select actual prices, storefront availability and tax category. Complete each product's English localization. Suggested description: **Unlimited reviews and advanced photo cleanup tools.** Provide review information and a real native paywall screenshot when available. Address all missing metadata so the products reach Ready to Submit or an approved state. Allow up to an hour for product metadata changes to reach sandbox.
6. Onboarding is designed around a **3-day free trial** on Weekly. Configure it as an introductory offer on `pictopia.pro.weekly`: Subscription Prices → Introductory Offers → all territories, type **Free**, duration **3 days** (Google Play: a free-trial offer on the weekly base plan). The app derives trial duration and eligibility from Apple; without an eligible trial it shows regular purchase wording. Do not advertise a trial that is not configured.

Source: [Apple subscription configuration](https://developer.apple.com/help/app-store-connect/manage-subscriptions/offer-auto-renewable-subscriptions/), [Apple IAP prerequisites](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases/).

## TestFlight: exercise real billing

Use Draftbit **Publishing** to create/upload an iOS App Store/TestFlight build with the current native code and the existing bundle identifier. An iOS Testing Build is for the Simulator; it is not an installable iPhone TestFlight build. Complete TestFlight beta information, export-compliance prompts and any required external beta review, then assign the build to the tester group.

On a real iPhone, install through TestFlight. Ordinary TestFlight testers can use their Apple Account; a separate Sandbox Apple Account is optional for advanced sandbox controls. TestFlight purchases use sandbox automatically and are free, even when the purchase screen displays a price. There is no app switch or environment key needed to route TestFlight purchases to sandbox. Do not test this by buying through the public App Store app.

In authorized staging builds, open **Settings → Developer tools → Reset onboarding** to replay Welcome through the Pictopia+ offer with your existing library. This leaves StoreKit ownership and introductory-offer eligibility intact. For an end-to-end purchase test, reset any **Pictopia+ for Life testing** simulation and use **Automatic** under **Subscription mode**. Start with a fresh Sandbox Apple Account or clear that test account’s purchase history. Apple’s TestFlight sandbox controls require signing out of Media & Purchases and signing in to the Sandbox Apple Account in Developer settings. After clearing purchase history, sign out of the sandbox account and back in to refresh the device cache. [Apple’s sandbox testing instructions](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox)

Acceptance checklist:

- Store plans load with the intended localized prices and periods.
- Buy a plan; the Apple sheet identifies a test/sandbox purchase, and Pictopia+ unlocks after confirmation.
- Close/reopen the app; active access remains.
- Restore purchases with the same Apple Account; access returns while the subscription is active.
- Cancel a purchase before confirmation; access stays Free and a retry works.
- Check trial eligibility, renewal, expiration and switching plans using Apple's test controls as needed.
- Check that an expired subscription returns to Free without erasing review history.

To test both independently, use a fresh Sandbox Apple Account or clear that sandbox account's purchase history between runs; reinstalling Pictopia alone does not remove Apple ownership. For an existing subscriber, use **Manage subscription** to change Weekly ↔ Annual. Both are Level 1 with different durations, so Apple's crossgrade takes effect at the next renewal; the current plan remains entitled until then. The app follows the effective StoreKit transaction and does not grant a second parallel subscription. Canceling auto-renewal retains access through the paid expiry; dismissing an unconfirmed purchase grants no new access. A saved signed lifetime award stays active independently of either subscription, so use an installation without that award to test expiration returning to Free.

Apple currently documents a 24-hour TestFlight renewal interval and up to six renewals before auto-renewal is disabled; sandbox account controls can change test behavior. Test purchases do not become paid production subscriptions. Tell testers they may need to subscribe again during a longer beta.

Source: [Apple TestFlight billing](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testing-subscriptions-and-in-app-purchases-in-testflight/).

## Public release

Finalize publisher identity, support contact, a public privacy policy and terms. Configure `EXPO_PUBLIC_SUPPORT_EMAIL`, `EXPO_PUBLIC_PRIVACY_URL` and `EXPO_PUBLIC_TERMS_URL` in the relevant Draftbit environments. The built-in legal pages remain labeled release drafts; they are not final public policies. Privacy declarations must include the configured Amplitude collection and any enabled reward/store-verification processing.

Submit the first auto-renewable subscriptions and their group with a new app version for App Review. Sandbox availability is distinct from approval for paid public distribution. Keep production developer overrides disabled. Review the final native paywall, restoration, renewal wording, legal links and screenshots before release.

Source: [Apple submission requirements](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase/).

Pictopia+ for Life uses a separate, disabled-by-default store-verification/reward path. It is not a lifetime product for sale and is not needed to unlock subscription access. Keep its release gate unchanged until the independent requirements in `LIFETIME_PLUS.md` are complete. Never enable real lifetime rewards merely to test subscription billing.

## Android, separately

For Android distribution, create/reuse the matching Play Console app and the exact product IDs above. Configure active auto-renewing base plans with matching periods, prices, countries and any intended trial offer. Complete Play's required business setup, publish an internal-testing release through Draftbit Publishing, add license testers and distribute through the Play testing link. Verify purchase/acknowledgment, restore and expiry on Android; an APK installed outside Play is not proof that Play billing works. Apple setup does not configure Google Play.
