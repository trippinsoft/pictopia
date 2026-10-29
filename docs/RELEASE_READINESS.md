# Pictopia release readiness

**Status: working first version; not approved for commercial release.** No native binaries or store purchases were produced in this workspace. The application contains real services, not simulated production paths. The browser accepts actual user-selected files; it cannot access or delete the camera roll. No backend is required for cleanup.

## Feature-by-feature status

“Native implemented” means source code and integration are present, **not** that a device test has passed.

| Capability | Implementation | Verification / remaining work |
| --- | --- | --- |
| Home / four tabs / queue badge | Implemented | Browser navigation verified |
| Real photo-library access | Native Expo MediaLibrary, permission explanation | Physical-device full/limited/denied tests required |
| Real video-library access | Native paginated MediaLibrary | Physical-device tests required |
| Browser file selection | Real local files, persisted in IndexedDB | Imported real image fixtures in browser tests |
| Monthly collections | Local calendar grouping, stable native date/id ordering | Logic and browser tests passed |
| Recent / On This Day | Real date-filtered queries; prior years for On This Day | Logic exercised; calendar-date device tests required |
| Random Shuffle | Stable session order, reviewed items excluded by preference | Seeded shuffle tested; device library scenarios pending |
| Screenshots | iOS subtype; Android platform path/album metadata | Device/OEM verification required; not inferred from dimensions |
| Videos / Favorites | Separate real collections | Browser favorites tested; native metadata tests pending |
| Large Videos | Available original sizes, largest first | Requires Pro; unknown sizes remain explicitly unknown |
| Swipe right / left | Native UI-thread gestures; browser pointer gestures | Browser drag and decisions tested; native performance pending |
| Vertical Explore internal prototype | Free fixed 200-still-photo snapshot, native up/down paging and peeking, synchronized sideways provisional discards, separate restore-only collection, persisted undo/resume/replay | Host SQLite/IndexedDB and logic tests; browser entry/intro visual checks; physical-iPhone/native build acceptance pending in `VERTICAL_EXPLORE_QA.md` |
| Tapping / skip / undo | Transactional decision, undo, skip | Logic, repository, and browser tests passed |
| Full-screen photo preview | Implemented | Browser tested |
| Photo zoom | Native pinch/double tap/pan; browser pointer pinch/double-click/pan | Browser double-click zoom tested; native tests pending |
| Video playback / scrubbing | Expo Video native controls and browser controls | Browser video scenario provided; native codec/device tests pending |
| Video review thumbnails | Native generated frame; browser video frame | Native generation unverified |
| Local favorites | Persistent app preference; OS favorites read when supported | Browser tested; does not edit OS favorite flags |
| Persistence / resuming | Versioned SQLite / IndexedDB; serialized mutations; session histories | Database, rollback, reopen, browser reload tests passed |
| Pending deletion queue | Paginated review, individual/all restore | Browser and repository tests passed |
| Explicit deletion confirmation | Counts, known size estimate, cancel, OS authorization | Browser limitation tested; native authorization tests pending |
| Native deletion | Supported MediaLibrary deletion API | Physical-device test required; never called from browser |
| Partial deletion reconciliation | Per-item lookup after the OS request; absence counts only under full access or limited access with OS success and unchanged scope; uncertain items stay pending | Simulated full/limited/Android-partial/cancel/permission-change scenarios pass on real SQLite; native tests pending |
| Interrupted deletion recovery | Persisted journal, atomic finalize, idempotent startup/foreground recovery | Simulated crash before/during/after OS confirmation and during persistence pass; device tests pending |
| Storage recovery | Known-file estimates; confirmed-deletion aggregate | Host SQLite aggregates tested; never claims actual free-space change |
| Exact duplicates | Streaming SHA-256 originals; iOS Live Photo paired resource included | Grouping logic tested; native hashes require device verification |
| Similar photos | 64-bit difference hash, ≤6 bit changes, ≤2 minute capture window, aspect-ratio guard | Threshold tests passed; device tuning pending |
| Best shot | Favorite, resolution, sharpness, exposure suggestion | Real heuristic; no face/eyes-open detector or AI claims |
| Likely blur | Laplacian variance on a 32px grayscale sample, threshold <30 | Pixel heuristic tested; false positives expected for low-detail images |
| Scan progress / cache | Per-asset version+modification cache, persistent progress, pause/resume, cancel | Native cancellation and resource limits need device tests |
| Background handling | Pause and cancel when backgrounded; resume explicitly | No continuous OS background job; interruption device QA pending |
| Battery / resource awareness | Android power-saving/low-memory; iOS low-power/thermal checks | Native source present; device tests pending |
| Smart Sessions / Quick Wins | 2/5/10-minute targets; 12/30/60-item unreviewed batches; screenshots first, voluntary completion, resumable active-time timer | Repository and browser flow passed; native lifecycle QA pending |
| Memory Lane | Older unreviewed media in chronological order; free | Repository ordering and browser session verified |
| Best of the Bunch sessions | Validated cached Pro scan groups, keeper-first review, contextual suggested keeper | Repository stale-group/gating cases and browser empty state verified; native scan-device QA pending |
| Advanced Quick Clean | Pro adds cached group candidates and large-media candidates | Entitlement gated; native scan data QA pending |
| Free tier | Unlimited manual review, no daily limits, no required ads/account | Browser gating checked |
| Pro gating | Central current entitlement with expiry; history retained | Entitlement tests passed |
| Monthly / annual / lifetime | RevenueCat packages and one logical `pro` entitlement | External products, offerings, public keys, store credentials missing |
| Purchases / restore | Real SDK calls; cancellation/pending/error handling | SDK adapter tests passed; genuine store sandbox tests NOT run |
| Expiry / revocation / offline | Current CustomerInfo listener, foreground refresh, unexpired entitlement cache | Expiration and revocation test doubles exercised; real store tests pending |
| Paywall | Localized store prices, mathematically checked annual savings, disclosures | Browser unavailable-checkout and links checked |
| Onboarding | Welcome / swiping / deletion safety / permission explanation | Browser navigable; native permissions pending |
| Appearance / preferences | System, light, dark; haptics, autoplay, favorites, reviewed, reverse directions | Browser Light/Dark/System, persistence, dialog variables, core/secondary flows and contrast verified; native chrome/device appearance and haptics pending |
| Reset / analysis-cache clearing | Explicit confirmation; original media untouched | Repository paths present; device interruption QA pending |
| Statistics | Basic counts; Pro storage coverage and recent sessions | Host database aggregates tested; no actual free-space measurement |
| Privacy / Terms / Support | In-app drafts; configurable publisher contact/public links | Publisher identity, jurisdiction, contacts, public URLs, legal review required |
| Accessibility | Text scaling, labeled controls, ≥44px main actions, reduced-motion behavior | Automated viewport checks; VoiceOver/TalkBack/large-text audit pending |
| Branding / splash | Original photo/check artwork, PNG sizes, scalable source | Files generated; native launch rendering pending |
| Native configuration | Bundle/package overrides, accurate photo permissions, no camera/audio request, build profiles | JS native bundles and autolinking checked separately; native compilation required |
| Store submission materials | Listing, subscription and privacy drafts | Not submitted; publisher confirmation and screenshots required |
| Live Photo motion preview | Native iOS PhotosUI view, explicit motion/still toggle, no cloud download | Source implemented; native compilation and device playback NOT verified |
| Performance | 200-item import/query pages, 12/30/60/200-item sessions, virtualized grids, native off-thread streaming analysis | Host metadata benchmarks 100–50,000 rows; physical-device 50,000+ stress tests NOT run |

## External setup required

1. Identifiers are `com.trippinsoft.pictopia` on both platforms; the iOS bundle ID is registered with Apple. Create the matching Google Play app and RevenueCat apps before the first store build; identity must remain stable for native data and store continuity.
2. In App Store Connect and Google Play Console create these suggested product IDs:
   - `pictopia_pro_monthly`: auto-renewing monthly, initial test price $2.99.
   - `pictopia_pro_annual`: auto-renewing annual, initial test price $19.99.
   - `pictopia_pro_lifetime`: non-consumable, initial test price $39.99.
   Store-localized product values are authoritative; the application never fabricates these prices.
3. Add both platform applications to RevenueCat. Connect the relevant Apple/Google store credentials in RevenueCat, not in client code. Import products, attach all three to entitlement `pro`, and create a current offering with Monthly, Annual, and Lifetime package types.
4. Set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` to the respective public SDK keys in the app's DEVELOPMENT/STAGING/PRODUCTION environments as appropriate. Never put secret RevenueCat, Apple, or service-account keys in the application.
5. Supply `EXPO_PUBLIC_SUPPORT_EMAIL`, `EXPO_PUBLIC_PRIVACY_URL`, and `EXPO_PUBLIC_TERMS_URL`, publisher legal identity/address, governing jurisdiction, policy effective date, and a public support URL. Complete legal review.
6. Use Draftbit **Publishing** for internal native builds. Ensure the custom analysis module is included; Expo Go is insufficient. Complete the device matrix and genuine sandbox purchase/restore/expiry/refund tests before production distribution.
7. Confirm store data-safety declarations against the final binary, RevenueCat processing, and any Publishing-added integrations. The app itself includes no photo-upload or behavioral analytics service. Draftbit preview telemetry belongs to the hosted development environment.

## Verification record

Actual executable results are recorded in `docs/VERIFICATION.md`. Device tests and genuine purchases must remain marked unexecuted until run. A passing JavaScript bundle is not a passing Swift/Kotlin compilation or native deletion test.

## Algorithm limits

Perceptual matches are suggestions, not identity guarantees. Rotation, cropping, edited versions, burst timing, extreme lighting, formats unavailable to the native decoder, cloud-only originals, and low-detail scenes can affect results. Native original-file scanning is asynchronous and streaming; the browser caps whole-file SHA-256 at 64 MB and never labels a larger unhashed file an exact duplicate. iOS resource reads have a timeout and never request cloud downloads. Recently Deleted/Trash can retain physical storage after an authorized deletion.
