# Store submission drafts

## Listing

Name: Pictopia

Subtitle: Keep memories. Clear the clutter.

Short description: A calmer camera roll, one swipe at a time.

Description:

Keep the memories. Lose the clutter. Pictopia helps you review your photos and videos without rushing your decisions. Swipe right to keep, left to set aside, and undo whenever you change your mind. Browse by month or start a manageable 5-minute clean.

Your originals stay untouched while you review. When you're ready, check the deletion queue and authorize the request through your device. Deleted media may remain in Recently Deleted or Trash.

No account is required. Pictopia Pro adds local exact-duplicate analysis, similar-shot comparisons, best-shot suggestions, likely-blur review, and large-video prioritization. Analysis runs on your device; personal media is not uploaded for analysis.

Pictopia+ subscription plans use weekly, monthly or annual store products, according to availability. Store prices and terms appear before purchase. Subscriptions renew automatically unless cancelled according to your store's terms. Manage or restore purchases from Settings. No lifetime purchase product is offered.

Keywords draft: photo,cleanup,storage,organize,duplicate,video,camera roll,swipe

## Submission requirements

- Publisher identity, support email and public support URL.
- Public privacy and terms URLs and final legal review.
- Correct bundle/package ownership and developer signing accounts.
- Actual native screenshots reflecting current behavior, not the browser fallback.
- Store localized products, subscription group/base plans, entitlement mapping, screenshots and review notes.
- Apple purchase/restore sandbox and Google license-tester evidence.
- Content rating, countries, localized listing and pricing confirmation.

## Privacy / data-safety working draft

Photos/videos are accessed for user-authorized local review; not uploaded or sold. Local metadata, decisions, preferences, and derived analysis remain in the device database. No app account, advertising identifier or advertising SDK.

When an Amplitude project key is configured, Amplitude receives app opens, foreground returns and named screen visits with a random installation identifier, timestamps, environment, platform and basic browser/OS context. No media, media IDs, filenames, library dates, referral codes or route parameters are sent. Advertising/device-vendor identifiers, IP-based location enrichment, automatic interaction capture, remote configuration and replay are disabled. Review Amplitude's final SDK disclosures and declare applicable identifiers, product interaction and device information for analytics before submission; do not claim no analytics data is collected. This integration does not add cross-app advertising tracking.

Apple/Google process store billing through direct Expo IAP. The app reads subscription status and caches access information locally. When enabled, the existing Pictopia+ for Life verifier processes store evidence separately; see LIFETIME_PLUS.md. RevenueCat is not used by the current purchase adapter. Confirm final SDK disclosures, enabled reward services, automatic device backup and Publishing-added integrations. Do not submit an unqualified “no data collected” declaration.

Permission purpose: read only the photos/videos the user authorizes to help review their library; deletion only for explicitly confirmed selections with operating-system authorization. No camera or audio recording permission is required.

## Review notes draft

Use a disposable native test library. Set-aside decisions do not delete media. Open the queue and explicitly authorize native deletion. Pictopia+ is determined from active subscriptions to `pictopia.pro.weekly`, `pictopia.pro.monthly` or `pictopia.pro.annual`, using the native store. See SUBSCRIPTIONS.md for setup. The browser preview has file selection and review only; native features require the submitted binary.
