# Phase 1 — Native Safety, Reliability, and Release Readiness

Scope: PIC-001 to PIC-004 from the independent audit of `trippinsoft/pictopia`. This was a remediation task: no features, monetization, identifiers, or signing were changed. The audit's `components/flickwell/` paths are now `components/pictopia/`.

**Nothing in this phase was tested on a physical device.** The Android debug build compiled (Gradle `BUILD SUCCESSFUL`). iOS has not been compiled; the first iOS build is to come from Draftbit Publishing for iPhone validation.

## Executive summary

| Issue | Verdict | Outcome |
| --- | --- | --- |
| PIC-001 Deletion verification | **Verified defect** (three distinct bugs) | Fixed; 10 platform-level regression tests |
| PIC-002 Interrupted deletion recovery | **Verified defect** (no recovery; non-atomic stats) | Fixed; 11 journal/recovery regression tests |
| PIC-003 Native compilation | **Partially verified** | Android debug build compiles (no project fixes needed); Android release build deferred by request; iOS project generates with the registered bundle ID, compile pending via Publishing |
| PIC-004 Session persistence | **Partially confirmed** (core persistence was sound; four gaps, including set-aside statistics) | Fixed; 8 regression tests and 2 browser checks |

What was actually wrong:

1. With limited photo access, the app counted an item as **deleted** just because it could no longer see it. That covers both a lookup that found nothing and an item missing from the library listing.
2. iOS silently leaves out identifiers it can't see and still reports success, so a "success" never proved that every queued item had been deleted.
3. Cancelling the system deletion sheet was never recognised on either platform; it showed a generic "could not be verified" error.
4. The deletion journal was written but never read, so a crash mid-deletion was never reconciled.
5. Cleanup statistics were saved in a separate write from the queue update, so a crash between them could lose or skew the counts.
6. A swipe could, in a narrow window, record a decision on the next item before it was on screen.

None of these produced an *unauthorized* deletion: every deletion still went through the OS authorization sheet. The risk was **false success reporting and lost reconciliation**, not deleting without consent.

## PIC-001 — Deletion verification

**Verdict: verified defect.**

### Root cause

These describe the code as it was before this phase (`services/media.native.ts`, original `remove()`). The library behaviour was checked against the installed `expo-media-library` 55.0.21 native source.

- **Unsafe absence proof.**
  - A lookup that returned nothing was counted as deleted. On iOS a not-found lookup resolves `nil` (`MediaLibraryModule.swift` line 321), and on Android it resolves null (`AssetUtils.kt` lines 55–64).
  - Under limited access, assets outside the selection look exactly like that, so they were counted as deleted.
  - When a lookup threw, the code fell back to scanning the library listing and counted anything missing as deleted. Under limited access that listing only covers the selection. On iOS it also excludes hidden assets.
  - The only guard compared the access level before and after, so "limited before and after" let the false result through.
- **Unproven success.**
  - iOS `deleteAssetsAsync` fetches the identifiers inside `performChanges` and drops the ones it can't find, then still resolves `true` (`MediaLibraryModule.swift` lines 195–203).
  - Android deletes row by row, skips rows it can't see, and can throw part-way after some rows are already deleted (`MediaLibraryUtils.kt` lines 100–111).
- **Cancellation never recognised.**
  - The pattern `/cancel|denied|reject/` doesn't match iOS's `PHPhotosErrorDomain error 3072` or Android's `User didn't grant write permission to requested files.`
- **Batch aborts.**
  - The provider pre-checked each item with `resolve()`, which throws for iCloud-only items. A single cloud-only item made the whole batch fail.

### Implementation

- `lib/pictopia/deletion.ts` holds the pure, tested rules:
  - `verdict()` decides each item's outcome. An item still visible is **remaining**. A failed lookup is **uncertain**. A missing item counts as **confirmed** only in two cases. One is full access. The other is limited access where the OS reported success, the item was verified visible just before the request, and the access level didn't change. Anything else is **uncertain**.
  - `deletionErrorKind()` recognises cancellation on both platforms.
  - `summarize()` and `deletionMessage()` build the overall status and user-facing copy: confirmed, partial, cancelled, failed, or uncertain.
- `services/media.native.ts`:
  - A new `lookup()` checks each identifier individually and records the access level. If the access level changes during the check, every missing item becomes uncertain.
  - `remove(items, hooks)` sends only items that are visible now and unchanged (same creation time, size, and type). Everything else is reported as **skipped** and never sent to the OS.
  - It calls `hooks.beforeRequest` to persist the journal and won't call the OS if that fails. Then it makes the OS call, records the result through `hooks.afterRequest`, and checks each item again afterwards.
  - The library-listing fallback was removed.
- `services/media.types.ts` adds `inspect()`, a read-only lookup that never prompts or deletes, and the new `remove` signature. `services/media.web.ts` returns "unknown" for every item from `inspect()`, so the browser can never prove a deletion.
- The deletion queue (`app/queue.tsx`) now shows an accurate per-outcome message, and cancelling is no longer shown as an error.

### Regression tests (`tests/deletion.test.cjs`)

- Full-access success.
- Limited access: unselected items are never requested.
- Limited access: disappearing from view without OS success is not proof.
- Android 14 partial access.
- Partial success under full access.
- Cancellation: the iOS 3072 error, the Android grant refusal, and a `false` result.
- The access level changing to limited or none during the request, and changing while checking afterwards.
- Inaccessible, changed, and unreadable assets.
- No OS call without access or without a persisted journal.
- The classification rules and the message copy.

## PIC-002 — Interrupted deletion recovery

**Verdict: verified defect.**

### Root cause

- `components/pictopia/provider.tsx` (previous `deleteQueue`) wrote `deletionAttempt`, but nothing ever read it.
- The queue update, the journal clear, and the `confirmedCleanup` increment were three separate transactions, so a crash between them lost or skewed the counts.
- Writes used the stale snapshot taken before deletion, not the latest record.

### Implementation

New `services/deletion.ts`:

- **Journal.** Before the OS request it writes `deletionAttempt` with the attempt id, item ids, size estimates, access level, and `phase: "requested"`. Once the OS answers, it records `phase: "returned"` and the result. A second deletion can't start while a journal is unresolved.
- **`commit()`.** One storage transaction:
  - Confirmed items go inactive and leave the queue, and `confirmedCleanup` goes up.
  - Items still present stay in the queue.
  - Uncertain items move to `deletionPending`, along with their access level and OS result.
  - It only processes ids still listed in the journal or the pending list, so replaying it, or racing it against recovery, can't count anything twice.
  - Sizes come from the latest stored record.
- **`recoverDeletions()`.** Re-checks the journal and the pending items. It never deletes. A journal without a recorded OS result is treated as "unknown", so under limited access missing items stay uncertain. Journals written by earlier versions in the old `{ids, started}` shape are handled conservatively.
- **`deleteMarked()`.** Recovers any leftovers first, re-reads each item, and won't send items that were restored or are no longer marked. If an error happens after the journal is written, it re-checks before surfacing the error.
- **Provider.**
  - Recovery runs at native startup before syncing, again on returning to the foreground, and before each deletion. It's protected by the same flag that blocks sync and scan during a deletion.
  - When an interrupted deletion is resolved, the user sees one accurate message from `recoveryMessage()`.
- **Repository.**
  - Undo, decide, and restore are refused for items in an unresolved deletion.
  - Restoring a pending item, or deciding to keep it, stops tracking it.

### Regression tests (`tests/deletion.test.cjs`)

These run the real SQLite adapter on `node:sqlite`. Each "restart" is a fresh process booted on the same database (`tests/native-harness.cjs`).

- A completed deletion is counted once.
- Restored items aren't sent, and cancellation keeps the queue.
- **Interrupted before the OS request:** the queue is kept and nothing is counted.
- **Interrupted during OS confirmation:** with full access, missing items are confirmed. With limited access they stay pending and uncounted, with the decision kept. Once full access is granted later, they're confirmed exactly once.
- **Interrupted after OS confirmation:** the recorded OS success confirms the items under limited access.
- **Interrupted during the local write:** a write failure injected into the final transaction rolls it back completely. Three later recoveries count the items exactly once.
- Journals from earlier versions are recovered conservatively.
- Queue edits are blocked while a deletion is unresolved, and restoring releases pending items.
- **Recovery racing a live deletion never double counts.** This test was added after a mutation check showed the idempotence filter was untested. It also found that the live path would have told the user "Nothing was deleted" after recovery had already applied the result, and that was fixed.
- A unit test caught a bug in `summarize()` where a stale `status` field could override the newly computed one. That was fixed too.

## PIC-003 — Native compilation and platform integration

**Verdict: partially verified.** Android compiles in debug; iOS awaits its first real build through Draftbit Publishing.

### Android

- **Toolchain** (installed in the sandbox, outside the repo): Temurin JDK 17.0.21, Android SDK platform 36, build-tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1, Gradle 9.0.0, AGP 8.12.0, Kotlin 2.1.20. These match React Native 0.83.10's `libs.versions.toml`.
- **Project generation:** `CI=1 npx expo prebuild --platform android --no-install --clean` passed (exit 0). Namespace and applicationId are `com.trippinsoft.pictopia`; minSdk 24, targetSdk 36, compileSdk 36.
- **Debug compile: `./gradlew :app:assembleDebug --no-daemon --stacktrace --console=plain` → `BUILD SUCCESSFUL in 18m 25s`, 529 tasks, exit 0**, all four CPU architectures, no project fixes needed.
  - An earlier attempt was killed by the sandbox's 12 GiB memory cap. The successful run limited Gradle to 8 workers and native compilation to 8 jobs; peak memory was about 9.5 GiB.
  - A previous build's log was lost when the sandbox was recycled; the result above is from a fresh build.
- **Analysis module:** autolinking resolves `expo.modules.pictopiaanalysis.PictopiaAnalysisModule`, and the build log shows its tasks running with no errors or failed tasks. **Not separately confirmed:** the `compileDebugKotlin` line, its compiled classes, and its entry in the generated module list.
- **Release build: not run.** It was deferred by request to prioritise iOS. It is the next Android step (a single-architecture `assembleRelease` is enough to prove the release configuration compiles).
- **Manifest permissions** (source manifest): `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_VISUAL_USER_SELECTED`, and `READ_EXTERNAL_STORAGE`/`WRITE_EXTERNAL_STORAGE` limited to SDK 32; `requestLegacyExternalStorage="true"` for Android 10 deletion; `CAMERA`, `RECORD_AUDIO` and `READ_MEDIA_AUDIO` removed. The merged manifest was not inspected. `ACCESS_MEDIA_LOCATION` is not requested; the app doesn't use location data.

### iOS

- **First Draftbit Publishing build: failed during archiving** with a fatal Swift error: the compiler could not type-check the expression at `PictopiaAnalysisModule.swift:77` (grayscale conversion written as one untyped multi-term closure) in reasonable time. The expo-media-library warnings in the same log are warnings, not the failure.
  - **Fix:** the thumbnail metrics moved to `modules/pictopia-analysis/ios/PictopiaPixelAnalysis.swift`, which has small helper functions (`grayscale`, `differenceHash`, `laplacianVariance`, `meanBrightness`) with every intermediate value explicitly typed. The module now calls those four helpers. The podspec already includes all Swift files.
  - **Checked here with Swift 6.1.2 on Linux (not an iOS compile):** the old expression alone takes 383 ms to type-check even without Apple's extra `CGFloat` overloads, while the new file produces no slow-expression warnings at a 50 ms limit in Swift 5 or 6 mode. The new file was compiled and run: its output is bit-identical to the app's JavaScript `pixelAnalysis` on flat, gradient, checkerboard and random buffers, so cached scans stay valid.
  - **Status: awaiting a rebuild through Publishing.** iOS has still not compiled successfully.
- **Project generation** (not compilation): `CI=1 npx expo prebuild --platform ios --no-install --clean` passed. `PRODUCT_BUNDLE_IDENTIFIER = com.trippinsoft.pictopia`, `IPHONEOS_DEPLOYMENT_TARGET = 15.1`. Autolinking lists the `PictopiaAnalysis` pod.
- **Swift compatibility.** The analysis module mutated captured `var`s (SHA-256 digest, byte count, error, thumbnail) inside Photos callbacks. A stand-in reproduction with the Swift 6.1.2 Linux compiler showed this fails only if the SDK marks those callbacks `@Sendable` **and** the module compiles in Swift 6 language mode; the podspec pins Swift 5.9, so the real risk was low. The state now lives in small lock-protected reference boxes (`AnalysisState`, `ImageBox`), which typecheck in all four combinations (plain/`@Sendable` callbacks × Swift 5/6). Hash input order, including the Live Photo boundary marker, is unchanged, so cached hashes stay valid. Both Swift files pass `swiftc -parse` (a broken control file fails). **None of this is an iOS compile.**
- **Release readiness checks:** version 1.0.0, build number 1 (Publishing assigns the next number), `ITSAppUsesNonExemptEncryption: false`. The 1024×1024 icon has an alpha channel, but Expo's iOS icon generation removes transparency for the light icon, as App Store Connect requires. With no RevenueCat key, purchases stay unconfigured and Pro stays locked; the app does not crash.

### Identifiers

- Both platforms use **`com.trippinsoft.pictopia`**. The iOS ID is registered with Apple. The change was saved through Draftbit settings, which also removed the earlier `PICTOPIA_*` environment-variable overrides.
- Nothing depended on the previous `com.pictopia.app`: no publish history, no App Store Connect or Google Play configuration, no `google-services` file, and no signing credentials in the project. No credentials were created or replaced.
- Before the first Android store build, create the Google Play app (and RevenueCat apps, when purchases are configured) under this package.

### iOS photo permissions

- `NSPhotoLibraryUsageDescription` now reads: "Pictopia shows the photos and videos you allow it to access so you can review them, and deletes only the items you confirm. Your media stays on your device." It covers full and limited access and the deletion that read-write access is used for.
- `NSPhotoLibraryAddUsageDescription` now reads: "Pictopia never saves or adds photos or videos to your library." The old text described deletion, which this key does not cover.
- **The add-only key is kept, not removed.** Pictopia never requests add-only access or calls `saveToLibraryAsync`, so iOS never shows this prompt. But `expo-media-library` compiles in an add-only permission requester (`PHAccessLevel.addOnly`). Removing the key would require patching the library and risks Apple's automated missing-purpose-string check (ITMS-90683).
- Not changed: `PHPhotoLibraryPreventAutomaticLimitedAccessAlert` is unset, so iOS shows its own "select more photos" prompt in limited mode alongside Pictopia's Manage access button.
- Fallbacks can't pass for native: without the native module, the analysis service reports itself unavailable (tested), and the iOS/Android JavaScript bundles contain no browser-fallback strings.

## PIC-004 — Session persistence and interruption safety

**Verdict: partially confirmed.** The core design was sound:

- Decisions and session position commit in one transaction.
- All repository changes run one at a time.
- Sync and analysis read the latest record before writing.
- Timer checkpoints don't race.

The gaps I found and fixed:

- **A decision could land on the wrong item.**
  - `repository.decide()` applied the decision to whatever was current *in storage*.
  - For one render frame after a decision, the swipe screen still held the previous item with its image marked loaded. A gesture in that window decided the next item before the user had seen it.
  - Fix: `decide(decision, expectedId)` and `skip(expectedId)` are rejected unless the item matches what's displayed, and `app/(tabs)/swipe.tsx` passes the displayed id and ignores gestures on a stale item.
- **A scan could start during a deletion.**
  - `scanLibrary` didn't check whether a deletion was running.
  - Fix: it now refuses to start.
- **Decisions could change mid-deletion.**
  - Undo, restore, or a new decision could change an item while an OS deletion request was in progress.
  - Fix: these are now refused, as described under PIC-002.
- **Timer gating had no unit test.**
  - Fix: it was moved into a pure function, `countsAsReviewTime()` in `lib/pictopia/sessions.ts`, so the native "app inactive" path is unit-tested.

### Regression tests

`tests/session-safety.test.cjs`:

- Decisions persist and resume at the exact position after a simulated force-quit, and undo works across the restart.
- Rapid or double-fired swipes commit exactly once, in order, with no duplicates or skips. A stale skip is rejected.
- Sync, analysis, timer, and decision updates running at the same time keep both decisions and analysis intact. An item that becomes inaccessible can be skipped but not decided.
- The deletion queue matches recorded decisions after a partial deletion. Items mid-deletion are locked, and undo onto a deleted item is refused.
- Keeping a pending item stops tracking it.
- Timer gating: inactive app, hidden tab, media still loading, long gaps, and the clock moving backwards.

`tests/sessions-web.cjs` adds one browser check: the timer pauses while the tab is hidden and resumes when it's visible.

### Set-aside statistics (fixed)

- **Root cause:** the session summary, the in-session counter, Home and Insights showed `kept`/`marked` counters saved at swipe time. Restoring an item cleared its decision but never lowered them, and "Review set-aside items" could open an empty queue.
- **Fix:** `sessionTally()` (`lib/pictopia/sessions.ts`), `repository.tally()` and the `useSessionTally` hook count each session item from its current record. A restored item returns to unreviewed and counts as neither kept nor set aside. An item Pictopia verified as deleted still counts as set aside, using a new `deletedAt` stamp written by the deletion commit, so it's distinguished from items that are merely no longer visible. The saved counters stay as historical fields.
- **Tests:** a repository test on real SQLite (set aside, restore, verified deletion, restored-then-inaccessible, restore all), a pure-function test, and a browser check that after restoring the only set-aside photo, the summary no longer shows it and the review button is gone. The next Memory Lane batch correctly grows from 15 to 16, because the restored photo is unreviewed again.

## Changes made

| File | Change |
| --- | --- |
| `lib/pictopia/deletion.ts` (new) | Access level, per-item outcome rules, status summary, cancellation detection, deletion and recovery messages |
| `lib/pictopia/types.ts` | `AccessScope`, `Presence`, `OsDeletion`, `DeletionResult`, `DeletionAttempt`, `PendingDeletion`, `DeletionRecovery` |
| `lib/pictopia/sessions.ts` | `countsAsReviewTime()` |
| `services/deletion.ts` (new) | Journal, atomic `commit`, `recoverDeletions`, `deleteMarked` |
| `services/media.native.ts` | Per-item lookup with an access-level check; verified-only requests; no listing fallback; cancellation detection |
| `services/media.types.ts`, `services/media.web.ts` | `inspect()`; new `remove()` signature; browser can't prove deletion |
| `services/repository.ts` | Storage-key constants; `deletionGuard`; decide and skip tied to the expected item; undo, restore, and decide respect the journal and pending list |
| `components/pictopia/provider.tsx` | Recovery at startup, on foreground, and before deletion; `deleteQueue` returns `DeletionResult`; scan blocked during deletion |
| `app/queue.tsx` | Per-outcome deletion message |
| `app/(tabs)/swipe.tsx` | Passes the displayed id; ignores stale-item gestures; uses `countsAsReviewTime` |
| `tests/native-harness.cjs`, `tests/deletion.test.cjs`, `tests/session-safety.test.cjs` (new) | Simulated native runtime and the regression suites |
| `tests/core.test.cjs` | Three superseded deletion tests removed. One of them asserted the unsafe listing-fallback behaviour, and stricter versions now live in `deletion.test.cjs` |
| `tests/native-adapters.test.cjs`, `tests/sessions-web.cjs` | Native-fallback test; hidden-tab timer check |
| `tests/loader.cjs` | Dropped the unused `module` parameter so sources that declare `const module` can load |
| `lib/pictopia/sessions.ts`, `components/pictopia/use-session-tally.ts` (new), `app/(tabs)/home.tsx`, `app/statistics.tsx`, `services/repository.ts` | Live session tallies for set-aside statistics |
| `modules/pictopia-analysis/ios/PictopiaAnalysisModule.swift`, `PictopiaPixelAnalysis.swift` (new) | Callback state moved into lock-protected boxes; pixel metrics split into typed helpers after the first iOS build timed out type-checking |
| `app.config.js` | Accurate iOS photo purpose strings (identifiers were changed separately through Draftbit settings) |
| `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/RELEASE_READINESS.md`, `docs/DEVICE_QA.md`, `docs/HISTORY.md` | Current-state documentation |

## Test results

All commands were re-run in this workspace on 2026-10-25 after the final changes.

| Command | Result |
| --- | --- |
| `node --test tests/*.test.cjs` | **66 passed, 0 failed** (39 before this phase) |
| `yarn typecheck` | exit 0 |
| `yarn lint` | exit 0 |
| `node tests/web.cjs` | exit 0, 13 PASS |
| `node tests/sessions-web.cjs` | exit 0, 7 PASS; 3 consecutive passing runs |
| `node tests/video.cjs` | exit 0, 1 PASS |
| `node tests/appearance-web.cjs` | exit 0, 6 PASS |
| `npx expo export --platform ios --platform android` | exit 0; JavaScript bundles only, run before the statistics change |
| `./gradlew :app:assembleDebug` | `BUILD SUCCESSFUL`, exit 0 (native Android compile) |
| Mutation checks | Seven reintroduced defects (six deletion/session defects plus counting restored items as set aside) all fail the new tests |

- `sessions-web.cjs` had a pre-existing race: leaving Swipe flushes the timer's final sub-second tick asynchronously, and the "pauses on Home" check sometimes read the saved session first. The test now waits for that write to settle before asserting no time accrues; the assertion itself is unchanged.
- The OS photo libraries in unit tests are test doubles modelled on the expo-media-library 55.0.21 native source. Real PhotoKit and MediaStore behaviour has not been exercised.

## Native build results

| Platform | Project generation | Native compile | JavaScript bundle |
| --- | --- | --- | --- |
| Android | **Passed** (`com.trippinsoft.pictopia`) | **Debug: BUILD SUCCESSFUL.** Release: not run (deferred) | Passed |
| iOS | **Passed** (generation only, `com.trippinsoft.pictopia`) | **First Publishing build failed** (Swift type-check timeout, fixed); rebuild pending | Passed |

## Device testing still required

Use internal builds from Draftbit Publishing, disposable test media, and a backup.

1. **Full access, iOS and Android.** Delete 3 queued items and approve. The message says 3 confirmed, the items are gone from Photos and the app, and Insights goes up by 3.
2. **Cancel the OS sheet.** On iOS and Android, the message is "Deletion cancelled…", the queue is unchanged, and Insights is unchanged.
3. **iOS "Selected Photos" and Android 14 limited access.** Queue items both inside and outside the selection, then delete. Only selected items reach the OS sheet, and the others are reported as unavailable and stay marked.
4. **Android partial failure.** If you can reproduce it, for example with a file on removable storage, check that only the items that were actually deleted leave the queue.
5. **Revoke access while the OS sheet is open.** Through Settings or the limited-access picker. Nothing is counted, and the items are reported as unverified.
6. **Force-quit with the sheet open, before approving.** Relaunch: the message says nothing was deleted, and the queue is intact.
7. **Force-quit right after approving.** Relaunch: with full access, the items are confirmed once. With limited access, they're "could not be verified" and uncounted. Relaunch twice more and check that Insights doesn't change.
8. **Recovery after granting full access.** After step 7 under limited access, switch to full access and relaunch. The items are confirmed exactly once.
9. **Rapid swipes.** Swipe 20 items as fast as possible, then force-quit and relaunch. The position, history, and queue count match, and undo works.
10. **Timer.** It pauses on lock, on backgrounding, and while the OS deletion sheet is open.
11. **iCloud-only photos.** They can be queued and deleted. They no longer block the batch.
12. **Set-aside statistics.** Set aside three photos, restore one from the queue, then check the session summary, Home and Insights: two set aside, and the restored photo appears again in a later session.
13. **Permission prompts (iOS).** On first launch, the photo prompt shows the new text. No "add photos" prompt ever appears. In limited mode, note whether iOS's own "select more photos" prompt is acceptable.

## Remaining release blockers (by severity)

1. **Critical:** iOS has not compiled yet. The first Publishing build failed on a Swift type-check timeout, which is now fixed in code; the rebuild is the next real compile of the Swift module.
2. **Critical:** no physical-device testing. The checklist above hasn't been run.
3. **High:** Android release build not yet run, and the analysis module's Kotlin compile not separately confirmed.
4. **High:** the iOS limited-access confirmation (rule 2) assumes the photo selection can't change while the OS sheet is open. Confirm on a device.
5. **Low:** iOS's automatic limited-access prompt isn't suppressed.
6. **Existing, unchanged:** Google Play app and RevenueCat setup for `com.trippinsoft.pictopia`, genuine store sandbox purchases, publisher and legal setup, and trademark review of the name. Pricing, free-tier limits, ads and packaging remain TBD and were not touched.

## Git status

- Branch: `main-working-be0ea644-5a4a-4dbc-b361-f959f11d5b63` on the Draftbit repository. Phase start: `33cdeb6`. The workspace commits and pushes each saved file automatically.
- **Not yet on GitHub.** `github.com/trippinsoft/pictopia` is updated by Draftbit's GitHub Export (branch `main`) when you **Save** in Draftbit; its `main` is a separate export snapshot. There is no GitHub credential in this sandbox, so nothing was pushed to GitHub directly. No pull request was opened.
