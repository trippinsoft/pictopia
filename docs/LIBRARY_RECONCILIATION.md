# Library and On This Day accounting

The reported iPhone observations are 15,284 during indexing, 14,159 in the onboarding photo summary, and 35 On This Day items versus 43 in two other apps. No device census from that library has been supplied. The 1,125 difference and the eight missing date items remain unverified; neither is a measured video count.

## Count definitions

- The old progress label received Expo MediaLibrary's accumulated enumeration count and `totalCount` for **photos and videos**, with 200 metadata rows per page.
- The old reveal used `stats.photos || stats.total`. On a mixed library its 14,159 meant **active indexed photos**, including screenshots and Live Photos. It excluded video rows. The fallback mislabeled a video-only library as photos.
- The numerical identity is 15,284 − 14,159 = 1,125. It equals videos only if the enumeration was complete, the library stayed unchanged, all IDs were unique, and indexed total equaled enumeration total. Historical observations alone cannot prove those conditions.
- New onboarding uses active indexed total, explicitly labels photos and videos, and displays both counts. Per-year animation remains a photo breakdown; undated media still contributes to the overall total. Full completion requires a successful enumeration, unique-ID/total checks, reconciliation, and a matching database count. Cancellation or failure never completes onboarding. A resumed onboarding does not use a partially indexed cache as a ready library.
- `libraryIndex:v1` records indexing/completion state, discovered and unique indexed counts, final database statistics, and IDs whose iOS favorite/screenshot metadata lookup failed. Missing optional metadata does not discard a base enumeration row. Older builds have no retrospective record.

## Enumeration boundary

The installed Expo SDK 55 implementation (`expo-media-library/ios/MediaLibraryUtilities.swift`, `getAssets`) fetches user-library images/videos, excludes hidden assets and additional burst frames, and excludes cloud-shared/computer-synced sources. This is an enumeration boundary, not evidence that those assets were deleted or imported unsuccessfully. Onboarding explains the boundary.

The existing native PhotoKit census now returns a complete metadata inventory alongside its date list, with exact membership in a second fetch that mirrors production Expo options. The audit compares identifiers across the entire active index and this inventory. It reports photos, videos, other media, screenshots, Live Photos, missing dates, enumerable-but-not-indexed IDs, items outside production enumeration with reasons, and stale index rows. Screenshots and Live Photos are subsets of photos, not extra additive categories. A Live Photo remains one photo; its paired motion resource is not an additional library video.

The census fetch includes all authorized sources, hidden assets and burst frames. Full Photos permission does not promise access to every album/content type in another app. Limited access restricts the census too. The report is gathered over time, not under a lock on the Photos app; avoid library edits or permission changes while auditing.

Cloud residency is **unknown** in this inventory. PhotoKit metadata enumeration does not require downloading originals and includes authorized cloud-backed records. Metadata presence does not prove local availability, decoding or video playback. The audit does not download private media just to classify cloud status.

## On This Day

Selection includes active supported photos, Live Photos, videos and screenshots with a capture date matching the exact local month/day across years. Verified deletions, inactive records, and in-flight/pending-verification deletion records are excluded. Previously reviewed, kept and marked-but-not-deleted media remain eligible. February 29 has no substitute date. Missing/zero dates never become January 1; negative valid timestamps remain dates. A time-zone change needs sync to recompute indexed calendar keys; the live audit exposes disagreement.

Earlier code excluded videos and screenshots, limited curation to 500 references, and then silently truncated the saved review to 200 references. The production constructor now retains all selected unique references, and date selection has no total cap or screenshot exclusion. The 500 value remains only a nominal scoring reference to preserve offer ranking; it does not restrict selection. Other adventures retain their existing sizes. The isolated prototype still selects at most 200 photos.

Large dates retain a single resumable set; the existing pager mounts a five-page window and retrieves display media incrementally. No new segmentation or total cap is introduced. On reopening an older date journey, newly eligible IDs append without replacing original ordering, saved position, marks or Undo history; a finished review reopens at the additions. A failed live metadata lookup is reported but does not silently remove an indexed date item before the review can load it and offer retry.

The audit distinguishes the live date inventory, indexed date rows, mutually exclusive eligibility exclusions, lookup failures, saved IDs, current feed count, saved encounter evidence and unavailable flags. Encounter evidence is not a retrospective record of every playback attempt. Shared reports include every identifier rather than cutting off at 60; the screen folds long lists. Nothing uploads automatically; Share is explicit.

Free remains 100 distinct loaded media per local day across adventures, collections, classic and preview; Pro remains unlimited. Seven past calendar dates remain Pro-only. Queue recovery, Restore, Undo, confirmation and OS authorization are unchanged.

## Required iPhone evidence

Create a new native build using Publishing → Testing Builds (iPhone installation uses TestFlight). Existing binaries do not contain the expanded census. Do not delete/reinstall just for this audit; preserving the old snapshot helps compare.

1. Grant Full Photos access, let sync finish, then open Settings, long-press the version, and open **On This Day audit** in Adventure Lab.
2. Audit the date with the observed 35/43 difference **before** reopening its review. Share the metadata report. It must show full inventory availability; otherwise the native binary is too old.
3. Confirm `discovered = uniqueIndexed = active index total`, and `photos + videos = active index total`. Inspect metadata failures, enumerable missing rows and all outside-enumeration categories. This establishes whether 1,125 really represents videos on this library; it cannot reconstruct the deleted installation's past state.
4. Record native date photos/videos/screenshots, each exclusion, lookup failures and saved-review missing IDs. Reopen the date, then audit again. Compare actual IDs, not just totals. Repeat one past date with Pro.
5. Exercise local/cloud photo and video loading, no-network recovery, unsupported codecs, first-frame allowance charging, pause on background/blur, rapid navigation, discard/Restore/Undo and confirmed deletion. Failed loads must remain retryable and must not charge allowance.
6. Test a date exceeding 200 and, if available, 500 eligible items: verify list total, saved IDs and complete feed agree, scroll beyond the old boundaries, resume and inspect memory on device. Exhaust 100 Free reviews across surfaces; Pro continues. Historical dates remain gated.
7. Check onboarding on a fresh test installation, including video-only, screenshots/Live Photos, missing dates, limited access, interrupted sync and a library changed while indexing. No partial run should say ready.

The eight-item discrepancy remains open until this device report identifies the actual assets. Videos, screenshots, hidden/burst/shared/synced boundaries, date drift and lookup failures are hypotheses with concrete audit evidence paths, not a claimed explanation. Host tests cannot validate PhotoKit enumeration, actual iCloud residency, codec support or physical playback.

## Adventure screenshot policy

| Existing experience | Selection rule |
| --- | --- |
| On This Day (`day`) | Every eligible exact-date photo, Live Photo, supported video and screenshot; no total cap; pending marks remain eligible. |
| The Yearbook, formerly Time Machine (`year`/`month`), and Time Capsule (`capsule`) | Photographs by default; system screenshots excluded before query limits. Existing media behavior otherwise unchanged. |
| Surprise Me (`detour`/legacy `random`) and Hidden Corners (`corners`, Lab) | Photos and supported videos, with selective screenshots. Ranked candidates generally contribute at most floor(target × 0.2) screenshots; skipped screenshots fill remaining slots only if ordinary media cannot fill the target. IDs remain unique and ordering is deterministic. Surprise Me prefers non-recent candidates. |
| Recent Photos and chronological/album collections | Screenshots participate normally in their existing photo review scopes. |
| Duplicate Hunt / Smart Clean | Screenshots remain candidates, but only existing scan/hash/perceptual grouping can establish a duplicate/similar group. No classification based on screenshot status. |
| Screenshot Sweep (`screenshots`) | Screenshot images only, retaining its existing favorite/selection rules. |
| Classic Quick Wins / other cleanup flows | Existing screenshot eligibility unchanged. |
| Pit Stops / game review | Unchanged screenshot exclusion. |

Destination, Forgotten Moments, Then & Now and Big Cleanup are not implemented as distinct experiences in this codebase. No new kinds, routes or aliases were created for them. Memory defaults also apply to legacy memory curation kinds; chronological collections remain full library views rather than curated Yearbooks.

Memory planning uses photograph-only month capacity, while mixed planning uses all-media month capacity. This avoids screenshot-heavy libraries suppressing mixed Adventures or inflating photographic Yearbook availability. Started reviews, or snapshots with saved review evidence, remain resumable even if later metadata identifies a screenshot. Unstarted memory offers still enforce their screenshot-free default. Existing On This Day snapshots append newly eligible screenshots on opening/choosing the date, preserving original IDs/order, marks, current position and Undo; repeated opening does not append duplicates. New date sets are chronological; additions to old sets append deliberately to preserve existing positions.

No native classification, permissions, media retrieval, allowance, deletion or Pit Stop implementation changed. Validate actual screenshot metadata and cloud decoding/playback on iPhone through a current published build. Browser imports still use file-modified dates and cannot establish PhotoKit subtype accuracy.
