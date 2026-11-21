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
| Recent / On This Day | Real date-filtered queries; prior years for On This Day; whole date incl. discarded-not-deleted photos | Logic exercised (`tests/on-this-day.test.cjs`); run the Lab's On This Day audit on a real iPhone against SwipeWipe/Picnic counts |
| Random Shuffle | Stable session order, reviewed items excluded by preference | Seeded shuffle tested; device library scenarios pending |
| Screenshots | iOS subtype; Android platform path/album metadata | Device/OEM verification required; not inferred from dimensions |
| Videos / Favorites | Videos collection (oldest first, largest first) in the shared review | Browser tested; native playback, iCloud and deletion pending device checks |
| Albums / Folders | Explore section from the native media library (iOS albums, Android folders) | Service tests on host; never run on a device yet |
| Duplicate Hunt | Built, Pro-gated, closed for release | Needs on-device scan and keeper checks before `RELEASED.duplicateHunt` |
| Review endings | Completion, recap, Ready to delete, Result | Browser and host tests pass; OS deletion prompts and Result wording need device checks |
| Large Videos | Available original sizes, largest first | Requires Pro; unknown sizes remain explicitly unknown |
| Swipe right / left | Native UI-thread gestures; browser pointer gestures | Browser drag and decisions tested; native performance pending |
| Vertical Explore internal prototype | Free fixed 200-still-photo snapshot, native up/down paging and peeking, synchronized sideways provisional discards, separate restore-only collection, persisted undo/resume/replay | Host SQLite/IndexedDB and logic tests; browser entry/intro visual checks; physical-iPhone/native build acceptance pending in `VERTICAL_EXPLORE_QA.md` |
| Tapping / skip / undo | Transactional decision, undo, skip | Logic, repository, and browser tests passed |
| Full-screen photo preview | Implemented | Browser tested |
| Photo zoom | Native pinch/double tap/pan; browser pointer pinch/double-click/pan | Browser double-click zoom tested; native tests pending |
| Video playback / scrubbing | Expo Video native controls and browser controls | Browser video scenario provided; native codec/device tests pending |
| Video review thumbnails | Native generated frame; browser video frame | Native generation unverified |
| Favorites | Adventure review: verified native favorite mutations on iOS / Android 11+; classic app-local favorites stay separate | Native source added; SDK/build/device verification pending; Android cloud sync not guaranteed |
| Adventure photo review | Scroll to browse, swipe into a trashcan that catches the photograph, reversible queue marks, trash tray with Restore, explicit Done, contextual tips, native share adapters | Host tests and component layout captures; native compilation and real-photo interaction acceptance pending in `PHOTO_REVIEW_QA.md` |
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
| Weekly / monthly / annual | Direct Expo IAP / StoreKit 2 / Play Billing, exact `pictopia.pro.*` IDs | Store configuration and native billing verification required; see SUBSCRIPTIONS.md |
| Purchases / restore | Real SDK calls; cancellation/pending/error handling | SDK adapter tests passed; genuine store sandbox tests NOT run |
| Expiry / revocation / offline | Native purchase listener, foreground store refresh, unexpired entitlement cache | Expiration and revocation test doubles exercised; real store tests pending |
| Paywall | Localized store prices, mathematically checked annual savings, disclosures | Browser unavailable-checkout and links checked |
| Onboarding | Welcome, three-step story, photo/reminder access, library reveal, planning, store-driven trial offer, first adventure | Browser welcome/story/trial checked; library reveal, permissions, trial purchase and reminders need a device build; weekly product + trial must exist in both stores |
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

1. Identifiers are `com.trippinsoft.pictopia` on both platforms; identity must remain stable for native data and store continuity. Use the matching store app records.
2. Configure auto-renewable products `pictopia.pro.weekly` (1 week), `pictopia.pro.monthly` (1 month), `pictopia.pro.annual` (1 year), using the intended prices and availability. Apple plans belong to one Pictopia+ group at the same level; Android needs active base plans. Store-localized values are authoritative. No lifetime purchase product is used.
3. Complete store business agreements, banking/tax information and product metadata. RevenueCat configuration and SDK keys are not required by the current direct Expo IAP adapter. Do not put store private keys in client environment variables.
4. Follow `SUBSCRIPTIONS.md` for native purchase/restore/expiration verification. TestFlight billing is sandbox automatically; use Automatic subscription access and reset lifetime testing simulations before a real billing test. Separate lifetime-reward release requirements remain in `LIFETIME_PLUS.md`.
5. Supply `EXPO_PUBLIC_SUPPORT_EMAIL`, `EXPO_PUBLIC_PRIVACY_URL`, and `EXPO_PUBLIC_TERMS_URL`, publisher legal identity/address, governing jurisdiction, policy effective date, and a public support URL. Complete legal review.
6. Use Draftbit **Publishing** for internal native builds. Ensure the custom analysis module is included; Expo Go is insufficient. Complete the device matrix and genuine sandbox purchase/restore/expiry/refund tests before production distribution.
7. Confirm store data-safety declarations against the final binary, direct store billing, any enabled rewards/store-evidence verification, optional Amplitude analytics and any Publishing-added integrations. Amplitude receives anonymous lifecycle and named-screen events when configured; personal media remains local. Draftbit preview telemetry belongs to the hosted development environment. See `ANALYTICS.md`.

## Verification record

Actual executable results are recorded in `docs/VERIFICATION.md`. Device tests and genuine purchases must remain marked unexecuted until run. A passing JavaScript bundle is not a passing Swift/Kotlin compilation or native deletion test.

## Algorithm limits

Perceptual matches are suggestions, not identity guarantees. Rotation, cropping, edited versions, burst timing, extreme lighting, formats unavailable to the native decoder, cloud-only originals, and low-detail scenes can affect results. Native original-file scanning is asynchronous and streaming; the browser caps whole-file SHA-256 at 64 MB and never labels a larger unhashed file an exact duplicate. iOS resource reads have a timeout and never request cloud downloads. Recently Deleted/Trash can retain physical storage after an authorized deletion.

## Consolidated physical-device QA gate

The [24-finding QA report](CONSOLIDATED_QA.md) is the current acceptance checklist. Do not release on host-test results alone: exercise the new native local-size bridge, local/cloud video pipeline, badge reconciliation, review/back/Undo sequence and 150-item interruption/resumption through a new Publishing build on iOS and Android. No device sign-off is recorded.
