# Review reliability and platform boundaries

Native release validation remains required. No physical iPhone, iCloud account, Android cloud-provider account, native simulator or native compiler was available here. Host tests and the web preview do not establish native correctness or v21-quality animation on a device. Android cloud-picker imports are not implemented.

## Evidence and root causes

- Compared the repository snapshots at the 1.0.21 bump (`30952df`) and 1.0.22 bump (`c46a04a`). These are available source snapshots; they have not been matched to installed binaries or App Store build artifacts.
- Native gesture activation/arbitration, finger tracking, fling thresholds, Bézier geometry, duration and easing are unchanged between these snapshots. The material change is photo resolution: v21 tried the library URI directly; v22 resolves the complete ID through MediaLibrary first. Each new flight image consequently performed another async lookup. This is a plausible contributor to the reported hesitation, not an instrumented reproduction on the phone. Flights now reuse the already painted representation, retaining the existing curve and timing. Fixed review slots retain the v21 two-frame next-photo transform preparation and original 300 ms slide; the pager changes slots only once that offscreen transform is ready.
- Marked records were deliberately filtered out of production feeds, and reconciliation moved a queued active ID to another photo. Those policies contradicted fixed positions and exact resume. Production feeds now retain the complete segment order, including pending marks and unavailable records; the isolated prototype keeps its separate local-discard behavior.
- Position was saved only after scroll quiet/momentum callbacks. Exiting or backgrounding before those callbacks could leave an older cursor. Review exits, navigation removal, unmount and background now flush the nearest visible fixed slot, using action builders inside serialized writes. Older reloads cannot overwrite a newer action. Highest position and distinct exploration are separate from the cursor.
- The reported Expo pause exception indicates an invalid native shared-object reference. The starting v22 code already used explicit player ownership instead of hook-owned release. That ownership is retained and hardened: source changes invalidate autoplay immediately; listeners are registered for cleanup individually; focus and app foreground are tracked separately; source callbacks are checked against the visible URI; native replacement work settles before one release. This was tested with native-object fakes, not reproduced or proven fixed on a real iPhone.
- Failed resolution does not prove iCloud. Full IDs are resolved separately from display loading; errors are retryable and skippable. Failed final slots can end a segment without crediting exploration or completing the larger scope. No failure queues a deletion or charges a daily review.
- On This Day previously widened to adjacent dates and then the whole month. It now uses exact local month/day equality; one photo is valid. February 29 never substitutes February 28. Native dates come from existing capture-time metadata; browser dates remain explicitly labeled file-modified dates.
- The shared allowance previously covered Adventure/collection review but not classic Swipe or full preview. Those surfaces now use the same persisted 150-distinct-item local-day allowance. Pending charges reserve the last slot immediately; backward navigation cannot expose an uncounted item after exhaustion. Pro bypasses the limit; Undo, pending marks, queue confirmation and exit stay accessible.

## Current behavior

- An 18-photo segment keeps 18 fixed slots. Marking slot 8 queues that ID once and advances to slot 9. Returning to slot 8 shows the faded photo, its pending state and Restore. Actual OS deletion remains solely in the explicit queue-confirmation flow.
- Restore commits an idempotent queue update independently of animation, reverses the existing trash path using a previously painted representation, and preserves the current cursor and exploration. A failed save cancels the reverse flight and retains the pending mark. Offscreen/tray restores commit safely without drawing a different photograph over the current slot. Undo retains its existing navigation behavior and guards duplicate actions.
- Larger Yearbook, Time Capsule/month, Screenshot Sweep, Surprise Me and exact-date Adventures continue in the same Adventure ID through curated segments of up to 18 photos. Last segments may be shorter. Completed snapshots are archived under `adventure:<id>:segment:<n>:explore`; their queue marks remain canonical and restorable. No obsolete test sessions are backfilled.
- Selecting an unfinished year resumes its current segment; returning after a segment completes starts the next available segment. A segment endpoint alone never claims whole-scope completion. Library metadata is paged separately from image bytes; full-resolution assets are not loaded for curation.
- Completion UI offers Explore N More and Finish for Now. Whole-Adventure completion uses distinct meaningful exploration across currently accessible eligible photos in the scope. Unavailable/unexplored items prevent a completion claim. New library items can add remaining work; earned milestone recognition is never revoked.
- Journeys larger than 18 recognize 25%, 50%, 75% and 100% at natural segment endings, showing the highest newly reached threshold and recording all crossed thresholds once. Halfway and completion have distinct wording. There are no new Pit Stop games or interruption screens.
- On This Day lists today and precisely seven prior local dates with counts. Historical selection requires Pro at the chooser and service boundary, including direct opening of a Pro-history journey. A Free journey started on its then-current date may resume after a daily-limit pause on a later day. No arbitrary or future-date picking is added.
- No original was reset, deleted, edited or downloaded during development verification. Automated deletion tests use simulated libraries and in-memory SQLite/IndexedDB.

## Platform capability matrix

| Capability | iOS | Android | Evidence / current limit |
| --- | --- | --- | --- |
| Library enumeration | Authorized PhotoKit library, including permitted iCloud records; limited access restricts the set | Accessible local MediaStore rows, within OS permissions | Existing MediaLibrary adapter; account/device behavior unverified |
| Cloud photo display | New native bridge requests an aspect-fit representation within 2048 px; network allowed for a visible foreground review; nearby/decorative requests stay local | No cloud library enumeration or picker-import pipeline integrated | iOS request is cancellable, compressed off the UI thread, with a 64-entry temporary display cache; requires Publishing |
| Cloud video | User explicitly requests network playback preparation; cancellable PhotoKit medium-quality AVAsset request, then owned Expo player | Local content URIs supported; cloud picker/provider playback not integrated | PhotoKit may download data; streaming, exact transfer size and every codec/composition are not guaranteed. Non-URL AVAssets get a retryable failure |
| Picker-authorized cloud items | Separate picker flow not added; library authorization is used | Android Photo Picker supports eligible cloud providers, but its returned URIs are not imported by this app yet | Platform capability is not an implemented app feature |
| Google Photos whole library | No Google Photos connector used | Not exposed through MediaStore. Google Photos Library API is limited to app-created content | No claim of full-library Google Photos access, cleanup or remote deletion |
| Cancellation / offline | New display/video requests cancel on departure/background; errors allow retry or scrolling on | Local read failures remain recoverable; no cloud transfer to cancel in current path | Network interruption, cache eviction, account/provider failures require device checks |
| Deletion | Existing visible/unchanged revalidation, journal, explicit confirmation and Photos authorization | Existing local MediaStore validation/OS authorization | No picker-cloud deletion is promised; unknown bytes stay unknown |

Sources: [Apple image request options](https://developer.apple.com/documentation/photos/phimagerequestoptions), [Apple AVAsset requests](https://developer.apple.com/documentation/photos/phimagemanager/requestavasset(forvideo:options:resulthandler:)), [Android Photo Picker](https://developer.android.com/training/data-storage/shared/photo-picker), [Google Photos API changes](https://developers.google.com/photos/support/updates). Installed Expo SDK 55 source was also inspected, including `expo-video/ios/Utils/URL+MediaLibraryAssets.swift`; it uses network-enabled PhotoKit AVAsset retrieval for ph:// sources but does not provide this app's per-request cancellation.

## Main changed areas

- Review state/queue projection: `lib/pictopia/explore.ts`, `lib/pictopia/explore-feed-controller.ts`, `components/pictopia/explore-feed.tsx`, `explore-card.tsx`, `adventure-review.tsx`, `use-explore.ts`.
- Flight handoff/Restore: `discard-flight.tsx`, `media-image.tsx`, `lib/pictopia/display-cache.ts`; existing `flight-math.ts` and native gesture recognizer geometry/timing remain in use.
- Video ownership/retrieval: `lib/pictopia/video-lifecycle.ts`, `use-review-video.ts`, `video-page.tsx`, `app/preview.tsx`, `services/video-source.*`.
- Cloud display: `services/photo-display.*`, `modules/pictopia-analysis/ios/PictopiaReview.swift`, `PictopiaAnalysisModule.swift`.
- Journeys/milestones/history: `services/adventures.ts`, `lib/pictopia/adventures.ts`, `curation.ts`, `journey-progress.ts`, `adventure-finish.tsx`, `app/on-this-day.tsx`, Home/Explore/Yearbook entry points and root route registration.
- Allowance: `use-allowance.ts`, shared review, classic Swipe and full preview. Existing fixed daily-store limit and deletion journal remain in place.
- Regression coverage: `tests/journey-segments.test.cjs`, `cloud-display.test.cjs`; existing review, curation, eligibility, native-media and gesture contract tests updated to the requested fixed-slot/exact-date behavior.

## Verification and remaining work

Verification: `node --test tests/*.test.cjs` passed **408/408 tests**, with zero failures, skips or cancellations (33.494 s). The provided type-check tool passed. Lint on changed TypeScript and test files passed with zero errors/warnings after fixes. `git diff --check` passed. The preview server is running; the compact On This Day empty state rendered without console errors at 390 × 844. A dark capture request retained the app’s light appearance, so dark-mode rendering was not independently established. Native Swift/PhotoKit compilation and device behavior remain unverified. Browser interaction scripts that launch their own Chromium were not executed under the workspace's browser restrictions; preview capture was used instead. Empty-library previews do not exercise a populated review gesture flow.

Remaining capability work: Android Photo Picker cloud import needs a separate provider-URI representation, retained permission lifecycle and read-only/deletion capability distinction before it can join the MediaStore-based repository safely. Cloud transfer progress percentages and Android cloud playback are not implemented. iOS requests show loading/retry states rather than invented progress percentages. This is an explicit platform implementation gap, not a request for product approval.

No new product decision is awaiting approval: requested continuation/milestones and seven-day Pro history were treated as authorized. Native release sign-off remains dependent on Publishing and the checks below.

## Physical iPhone checklist — not executed

1. Publish a native build and start with empty app data, retaining the actual library. Check full and limited Photos access with local, cloud-only and mixed images/videos.
2. Compare slow/fast repeated left/right swipes against installed v21: finger tracking, immediate handoff, no blank frame, no snap-back, immediate next-photo input. Try Undo during a flight and leave during several queued saves.
3. Mark photo 8/18, inspect 9/18, return to faded 8, restore repeatedly, and verify its reverse flight, unchanged cursor, one queue entry and no duplicate exploration.
4. Exit while photo 15 settles; confirm Home/resume says 15 and opens that exact ID. Backtrack to 8, background/foreground, reopen and confirm 8. Repeat under slow storage and rapid navigation.
5. Scroll rapidly between videos, retry a bad codec, navigate away during loading, background during cloud retrieval and return. No stale pause/play/release or first-frame event may affect a disposed/different player.
6. Try offline/interrupted cloud photo/video retrieval, revoked/expanded limited access and edits/removal outside the app. Retry or skip without a queue mark, allowance charge or dead end.
7. Use a 25-photo year: explore 18, continue 7, finish for now, resume and restore a mark from the first segment. Confirm one year entry, no repeated explored assets and one-time milestones.
8. Exhaust 150 distinct reviews across Adventures, collections, classic review and preview. Try forward/backward navigation, On This Day, a failed item, Undo and queue access; check reset across local midnight and Pro unlimited access.
9. Check On This Day zero/one/many exact matches, no neighboring dates, leap day, local date changes and Pro's seven historical dates. Verify no future dates and no Free historical-selection bypass.
10. Review pending marks without deleting, exit freely, cancel the OS deletion prompt, then separately test an explicitly chosen disposable test asset. Confirm cancelled/uncertain outcomes never claim recovered storage. Do not use valuable originals for deletion QA.
