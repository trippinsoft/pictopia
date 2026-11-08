# Pictopia consolidated physical-device QA report

Code corrections are implemented and the host suite passes. Native video playback, iCloud behavior, codecs, local file-size lookup, permissions, safe areas and native gestures **have not been validated on a physical device in this workspace**. Native helper changes require a new build through Draftbit Publishing. This is not a release sign-off.

No library records, pending-deletion records, saved adventures, subscriptions or exploration history were reset. Older badge claims and completion proofs are retained for audit. No new backend, package, simulated purchase or demonstration library was introduced.

## All findings

“Fixed” means implemented with host/browser evidence, not an assertion of physical-device validation. “Needs Device Test” means code fixes exist but the reported native behavior remains unproven. “Needs Decision” means a product recommendation was made without changing the product.

| # | Finding | Status | Outcome / outstanding evidence |
| --- | --- | --- | --- |
| 1 | Review corruption / premature completion | Needs Device Test | Serialized stable-ID writes, retry/resync, revision-checked Finish, conservative legacy ending repair, and persistent Undo encounter history. Exact repeated-final-mark/back/Undo sequences pass host tests; reproduce on iPhone. |
| 2 | Disappearing Progress | Fixed | Shared serialized snapshots retain last-successful facts through refresh/focus/errors; newer revisions during reads cause a follow-up. Initial failure, loading, zero and empty access differ. Restart and 20,000-photo host coverage pass. |
| 3 | Incorrect badges | Fixed | All seven families have explicit thresholds. Legacy claims are archived separately and excluded from confirmed earned-family counts. Current facts and stronger completion evidence determine confirmation; confirmed tiers remain permanent. |
| 4 | Back arrow / saved exits | Fixed | Shared upper-left chevron retains guarded history/fallback navigation and existing review exit/recap callbacks. Exit does not finish or clear queue decisions. |
| 5 | Photo/video date position | Fixed | Month/year remains at the upper-right of the review media area, noninteractive and separate from lower actions. Invalid dates are omitted. |
| 6 | Ambiguous allowance labels | Fixed | No ambiguous running allowance label in review. Limit copy explicitly names free photo/video reviews; adventure position remains separate. |
| 7 | Contextual progress | Fixed | Recent/videos: distinct session encounters. Album/month/year: authoritative saved scope totals. Adventures: original snapshot position/total. Overall percentage is confined to Home/Progress. |
| 8 | On This Day stops at 3/7 | Needs Device Test | Reproduced the allowance case: 147 prior items plus three of a frozen seven exhausts 150. The fourth is blocked; total remains seven, session remains unfinished, revisits are free that day, next local day and Pro resume. The actual phone’s seven assets/allowance cannot be inspected here. |
| 9 | Daily-limit copy | Fixed | “You’ve reviewed 150 photos and videos today!”, explicit next-day/Pro explanation, “Unlock unlimited with Pro”, “Continue tomorrow”, and marked-item review. Both media types are named to avoid misdescribing video-only use. |
| 10 | Approved allowance rules | Fixed | Locked at 150 distinct displayed IDs per approved local day. First counts; same-day revisits free; marks/Undo do not charge; restart persists; Pro unlimited. Historical exploration cannot exempt an item forever. Remote/cached values cannot change 150. |
| 11 | Native video posters/playback | Needs Device Test | Native cached poster helper replaces thumbnail players; missing posters cannot block playback. Stable player plus async source replacement, readiness/error states, first-frame display evidence, explicit cloud download and blur/background pauses. Local MOV/HEVC/H.264/cloud/limited-access tests on hardware remain essential. |
| 12 | Video progress/metadata | Needs Device Test | Video session progress and first-frame encounters are separate from photo-only badges. Invalid/missing sizes are omitted, not rendered as 0.0 MB. Actual native first-frame and format behavior remains unverified. |
| 13 | File sizes / unknown labels | Needs Device Test | Public local-only PhotoKit file URLs and Android MediaStore SIZE queries; successful results cached with modification guards. Unknown labels are removed from main review; no download/hash solely for sizing. Live Photo paired-resource totals require existing measured scan evidence. JPG/HEIC/edited/cloud/native tests remain. |
| 14 | Potential savings | Fixed | Queue presents a prominent estimate, known-size subtotal and excluded-item count; restores remove items from the estimate. All queued metadata is read, not silently capped at 3,000 items. OS retention is explicit. |
| 15 | Cleanup result accuracy | Fixed | Pending marked items and known pending bytes are separate from verified photo deletions/bytes. Confirmed deletion activity now commits atomically with cleanup and journal updates; failure/recovery/replay tests pass. No immediate free-space promise. |
| 16 | Completion composition | Needs Device Test | Designed illustration reduced to 112 pt, spacing balanced around session statistics. Verify iPhone small-screen/large-text balance. |
| 17 | Collection-ending actions | Fixed | “Review more from this album/month/year” or “Review more photos/videos”. Offer disappears when saved scope facts show no remaining items. Batch, complete scope, fixed adventure and allowance interruption have distinct copy/actions. |
| 18 | Completion statistics | Fixed | “Reviewed” means distinct meaningful encounters in that saved review, not new lifetime exploration. Marks are not deletions. Undo removes marks while preserving encounter history. Streak activity requires its own rules. |
| 19 | Explore structure | Fixed | Removed “Clean up”. Adventures, Months & Years and Collections retain their existing launch paths/gates; videos and albums stay grouped as collections. Duplicate Hunt remains closed unless already enabled by developer flag and still Pro-gated. |
| 20 | Misleading Continue | Fixed | Requires a pending mark, more than one meaningful encounter, or meaningful viewing plus navigation beyond the first item. Opening/displaying the first photo alone is insufficient. Saved records remain intact. Position uses the original active ID, not encounter count. |
| 21 | The Yearbook vs Time Capsule | Fixed | Approved distinction: The Yearbook opens a user-directed year picker from Home and Explore; Time Capsule retains its automatic month surprise. Saved Yearbooks retain their IDs, year, frozen photos and position. Artwork unchanged. |
| 22 | Album layout / fallbacks | Fixed | Compact two-column square-cover cards, bounded labels, count/progress, accessible-member fallback and illustrated empty covers. Full titles wrap when opened. Membership remains platform-authoritative. Native WhatsApp acceptance still required. |
| 23 | Wording audit | Fixed | Removed ambiguous today/stretch/global-percent language; video playback errors are video-specific; missing storage data stays out of main totals; pending vs confirmed is explicit. |
| 24 | Validation | Needs Device Test | All 360 host tests pass; type check and changed-file lint pass. Browser UI checks show no console errors. Native builds/device tests were not executed. |

## Major root causes and corrections

### Review state and endings

Older controllers could persist “past the end” (`activeId: null`) after marking the final photo. A legacy read then interpreted that null as completion even when no reliable Finish flag existed. The shared controller already retries position saves, keeps stable photo IDs and refuses rejected discards; this pass added a captured revision to explicit Finish, so navigation/Undo saved afterward invalidates a stale completion request. The UI requires the actual end or empty marked feed before Finish. End-card actions read the current rendered state rather than a cached pager-cell closure. When the last surviving photo has a saved meaningful encounter but the native position save lags, explicit Finish identifies that endpoint while still requiring the captured session revision. Rejected completion writes show an actionable error instead of silently doing nothing. Finish never creates encounter or deletion records.

Ambiguous legacy null positions now resume on a real surviving photo. A legacy completion is retained only with matching completion metadata and complete snapshot encounter/unavailability evidence. Explicit modern finishes write durable session evidence; version-2 completion proofs or conservative full-coverage historical backfills support badge credit. Old partial endings and version-1 proofs cannot verify themselves. Original older proofs are retained when upgraded.

Undo previously restored the entire previous per-session record, potentially erasing the encounter created by a meaningful mark. It now reverses only the mark while preserving that encounter. Repository media first-seen history already survived Undo; the session tally now agrees.

### Progress and scope calculation

The previous hook cleared good statistics on focus, revision and sync readiness changes. Badge values used a separate retained read, explaining visible mismatches. The shared resource retains successful facts, serializes reads with writes and publishes one complete result. A save arriving during a read requests a second read rather than disappearing into a coalesced request.

Collection progress also added session encounters to an opening baseline. That counted previously explored assets again when revisited in another review. Scope percentages now read the saved collection summary. Recent Photos and open-ended videos show unique session review counts instead of percentages. On process restart, saved records are rehydrated; temporary initial native loading is not represented as a zero or 100% completion.

### Allowance and playback

A historical session `encountered` flag was treated as free access, incorrectly exempting assets on later days. Only the current day’s allowance-ID set now makes revisits free. Hydration and write errors are explicit; initial allowance loading gates the feed. Midnight refresh repeats across successive days. The approved 150 limit cannot be overwritten by a legacy cached/remote limit. Existing subscription processing is unchanged.

The video page was hidden when its poster failed. iCloud-only videos therefore lost the very control needed to request a download. Small native posters also created players and could show oversized loading text. Native video covers now use the existing cached platform thumbnail helper, and playback opens independently. A stable player uses asynchronous source replacement; URI resolution alone is not playback readiness, and readiness alone is not a displayed frame. First-frame evidence starts meaningful-view qualification. Offscreen, blur and background events pause playback; late async results cannot start a departed player. Codec/source errors are surfaced as video errors with retry.

### Size and deletion accounting

`File.size` cannot reliably measure PhotoKit `ph://` or Android `content://` references. Local size lookup now uses public [PhotoKit content input file URLs](https://developer.apple.com/documentation/photos/phcontenteditinginput/fullsizeimageurl) and [MediaStore size metadata](https://developer.android.com/reference/android/provider/MediaStore.MediaColumns#SIZE). PhotoKit network access is disabled, and Android performs a metadata query rather than opening/hash-streaming the original. Successful values are cached against media modification metadata, and sync invalidates cached byte sizes when an asset is edited while retaining exploration and queue decisions. Missing/nonpositive/nonfinite sizes are excluded from estimates.

A Live Photo still-file URL does not represent its paired motion bytes. Those totals remain unestimated unless the existing local scan has measured both resources. Cloud-only originals without local size metadata remain unknown until intentionally downloaded/otherwise available; no bytes are invented. Edited-resource sizes and OS Recently Deleted storage are estimates, not physical free-space measurements.

Confirmed-deletion streak activity used to save after the atomic deletion transaction. A crash between those writes could lose the activity. It now commits in the same transaction as verified deletions, cleanup totals and journal updates. The existing tracked-ID replay guards, full/limited-access proof rules, pending list and OS authorization remain unchanged.

## Counting contract

| Measurement | Rule |
| --- | --- |
| Daily free reviews | First display of an ID each local day, photo or video, including the first item. 150 maximum for free users. Same-day revisit/mark/Undo adds no independent charge. Pro is unlimited. Clock rollback never resets the day. |
| Meaningful review | A loaded foreground photo/poster/frame counts immediately, however briefly visible, or through an explicit valid mark. Preload, failed loading and Finish alone do not count. |
| Lifetime photos | One first-seen media record per stable photo ID, including saved inactive/deleted history; repeated sessions/adventures do not add another unique photo. |
| Videos | Their own stable IDs and first-seen history; excluded from photo progress and Explorer/Declutterer/calendar photo families. Video review waits for real poster/frame evidence. |
| Library percentage | Accessible explored photos / accessible photos. Empty access has no percentage; lifetime explored remains separate. |
| Recent/video header | Unique encounters in the current bounded saved review, not the whole library and not allowance usage. |
| Fixed-adventure header | Original snapshot position / original snapshot total, including positions removed into the trash. The allowance does not shrink this total. |
| Album/month/year | Authoritative accessible scope totals; “fully explored” requires zero remaining accessible photos/items under that collection’s existing rules. |
| Completion | Explicit, revision-checked legitimate end/empty review; rejected writes cannot finish it. Legacy flags require independent evidence for achievement credit. |
| Marked | Current canonical pending decisions, excluding in-flight marks from the icon count until their flight lands. Undo/restore reverses marks, not encounter history. |
| Deleted | Distinct, OS-verified tracked records with deletedAt. Pending decisions and uncertain deletion results do not count. |
| Storage | Sum only known positive local/measured sizes; count excluded sizes separately. Estimates are neither original downloads nor immediate free-space promises. |
| Streak | Ten distinct meaningful photo/video views that local day OR a newly verified deletion. Eligible explicit restored days can bridge the best streak. Starting/finishing alone earns no day. |

## Badge thresholds and reconciliation

| Family | Tier thresholds |
| --- | --- |
| Explorer | 100 / 500 / 1,000 / 5,000 / 10,000 / 25,000 / 50,000 unique photos |
| Declutterer | 10 / 50 / 100 / 500 / 1,000 / 5,000 confirmed photo deletions |
| Month Finisher | 1 / 6 / 12 / 36 / 120 fully explored accessible months |
| Time Traveller | 1 / 3 / 5 / 10 / 20 fully explored accessible years |
| Across the Decades | 2 / 3 / 4 decades containing a fully explored accessible year |
| Adventurer | 1 / 5 / 10 / 25 / 50 / 100 distinct supported completions |
| Streak | 3 / 7 / 14 / 30 / 50 / 100 / 200 / 365 best consecutive qualifying days |

A full accessible year means all accessible dated photos in that year, not twelve populated months. Unknown dates do not create calendar badges. Later library/access changes do not revoke a tier confirmed under the new evidence version.

On first evaluation, legacy earned records are archived under badge-state `legacy`, unchanged. Only current authoritative facts confirm tiers in `earned`; the state is marked `verification: 2`. Unsupported claims are retained with an explanation but excluded from confirmed earned-family counts. There is no celebration flood during reconciliation. Future verified awards are permanent. For example, 21 supported completions mean Level III earned and progress toward IV at 25; a legacy IV claim remains an unconfirmed archived claim, never progress toward V at 50.

Adventurer ignores the old aggregate feedback-pacing counter. Indexed IDs are deduplicated; starts, partial legacy endings, failed metadata saves and repeated completion visits do not add credit. Valid version-2 proofs survive later Undo/reopening; upgrades preserve prior proofs. First-seen exploration migrations remain idempotent and do not reconstruct unsaved past browsing or invent old streak days.

The actual iPhone database and its prior 396-photo/25-adventure records were not available here. Their precise historical truth cannot be reconstructed from screenshots. Reconciliation runs against the saved evidence on that device when this code opens it.

## The Yearbook / Time Capsule

The Yearbook (formerly Time Machine) opens a year picker from both Home and Explore. Only dated years with accessible photographs appear, with counts. Its existing curator spreads up to 18 eligible moments across months and days, chronologically; chosen years with one or two photos are supported. Quick-series collapse and eligibility safeguards remain unchanged. Saved sessions appear separately from new-year choices, retain their immutable `year:YYYY` source and independent IDs, and resume without regenerating their photos. Legacy titles normalize on read without rewriting session records or deleting history.

Time Capsule retains its automatic month selection: months with at least 20 photographs ranked using untouched capacity and recent-source avoidance. No month picker, artwork change, removal or repositioning was introduced.

## Validation and remaining risks

- Full host suite: **360 tests passed, 0 failed**. The consolidated additions exercise all-family reconciliation, stale finish tokens, 149→150/seven-photo interruption/restart/Pro/new day, actual allowance-hook historical views, contextual labels, local/cloud video state transitions and late results, native size bridge usage, missing-size aggregation, 20,000-photo uniqueness/restart, atomic deletion activity failure/recovery/replay, ambiguous legacy proof rejection and meaningful resume/Undo retention.
- Existing real-SQLite simulations cover final-photo re-mark/back/Undo, failed saves, deletion authorization scopes, recovery races, unique exploration, collection order, video size order, albums, purchases and entitlement transitions. No successful purchase was simulated in production UI.
- Host 20,000-photo aggregate: approximately 62 ms in one targeted run. This is not a native throughput or memory benchmark.
- Type check and changed-file lint pass. Browser captures of Progress, queue, Explore empty states and the labeled limit-layout preview showed no console errors. The temporary preview was removed. The browser held no phone library; populated phone screenshots and video decoding were not reproduced by those captures.
- The Swift/Kotlin additions were reviewed but not compiled into or exercised in a physical native build here. Public API use is not proof that every permission mode/asset provider behaves as intended. Device validation remains a release gate, especially for Live Photos, edited HEICs, cloud-only media, HEVC/HDR/slow-motion videos and constrained devices.
- Historical evidence is incomplete by nature. Unsupported claims are preserved for audit rather than converted into confirmed achievements or destructively deleted.

## Required iPhone acceptance pass

1. **State:** In The Yearbook, mark the final photo, go back, mark another, Undo/re-mark repeatedly, leave/return, lock/unlock and force-quit/reopen. Verify the exact stable photo, queue membership, no save error/false completion and correct Undo history.
2. **Progress/badges:** Alternate all tabs, finish/leave adventures and background during sync. Confirm no good values blink away; inspect all seven badges, legacy notices and next tiers. Check full and limited access, then restore access; legitimate denominator changes must be understandable.
3. **Allowance:** Observe 149→150 including a video. At the limit, revisit prior items, Undo, open/cancel the queue and exit. Reopen unchanged; next local day or an actual Pro entitlement must unlock the remaining seven-photo snapshot without shrinking it. Do not reset app data to test this.
4. **Video:** Test local H.264 MOV/MP4 and HEVC/HDR/slow-motion samples, then an iCloud-only video. A missing poster must not block tapping Play. Cloud download requires an explicit tap. Try retry, rapidly changing videos, discarding/Undo, backgrounding and leaving for another screen; no hidden audio or stale-player startup.
5. **Sizes/deletion:** Inspect local JPG/HEIC/video estimates, an unavailable size and a Live Photo. Queue known/unknown items, restore one and confirm the subtotal decreases. Cancel OS deletion, then use expendable test media for an authorized confirmation/relaunch/recovery pass. Pending items must never appear as confirmed cleanup; Recently Deleted retention must remain clear.
6. **Layout:** Check albums (one/two/many/WhatsApp/long names), completion, batch continuation, date placement, 150-limit copy and centered badge details at larger text and with VoiceOver/Reduce Motion.

Android additionally needs MediaStore SIZE across API 24–28 and 29+, scoped/limited permissions, thumbnail providers, HEVC playback and physical system Back/OS-delete dialog checks. Store subscription activation/restoration and app focus transitions must be exercised through the real native stores on both platforms.
