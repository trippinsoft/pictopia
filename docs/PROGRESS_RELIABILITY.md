# High-priority progress and achievement reliability investigation

Part of the review-state reliability investigation; release remains dependent on the iPhone scenarios below. The reported 396-photo / 25-adventure state is user-reported. This workspace cannot inspect the phone's local SQLite database or establish whether those 25 endings were genuine.

## Confirmed code defects and fixes

- `useLibraryProgress` cleared its state on every focus/revision/readiness change. Normal refreshes and native sync's temporary `libraryReliable=false` therefore replaced good numbers with dashes; cancelled focus reads could never publish. The badge screen separately retained its previous result. A shared last-successful snapshot now survives tab blur/remount, foreground refresh, sync and query/save errors. Initial loading and failure are distinct; retry errors explicitly say when saved statistics remain visible.
- Progress, calendar totals and badges previously ran independent reads, including reads outside the mutation serializer. The Progress snapshot now reads through the repository serializer, supplies the same photo/calendar facts to the badge calculation, and publishes the whole successful result. New revisions arriving during an in-flight read trigger a follow-up instead of being swallowed. Home and Progress subscribe to this same resource.
- Adventurer trusted `adventures:v1.finished`, a feedback-pacing counter. `adventureStore.finish` accepted metadata without checking the saved session, and metadata/counter were separate writes. Finish now checks nonempty distinct IDs, a saved finish, meaningful activity, and endpoint evidence. Metadata, proof and pacing counter save atomically. Badge totals deduplicate indexed adventure IDs and verify metadata/session evidence, never the pacing counter.
- The reducer accepted a finish action anywhere. It now requires the final surviving photo or a queued original endpoint (the existing final-discard behavior). A stale callback from the middle does not finish. This closes a path by which review-state corruption could have credited endings; it does not establish which phone records were affected.
- Validated completion proofs survive later Undo/reopening. Historical proofs and badge backfills save atomically. Old unsupported awards remain intact, are marked for verification, and do not supply activity credit toward new levels. No history, decisions or awards are reset.

## Definitions and historical limits

| Measure | Authoritative evidence |
| --- | --- |
| Lifetime photos explored / Explorer | One media row per library asset ID with `firstSeenAt`; includes inactive/deleted history. Repeated visits, overlapping adventures and sync do not create new IDs or credits. |
| Library percentage | Currently accessible explored photos / currently accessible photos. Empty access has no percentage. This intentionally differs from lifetime exploration after access changes/deletions. |
| Videos explored | Distinct accessible video IDs with `firstSeenAt`, displayed separately; excluded from Explorer, photo calendar and photo-deletion badges. |
| Adventurer | Distinct adventure IDs with matching saved metadata and supported completion, or a validated durable completion proof. Merely entering the ending state, an empty snapshot, or an aggregate counter is insufficient. Separate legitimately completed adventures can include the same photos. |
| Complete months/years/decades | Accessible photo calendar, zero remaining; unknown dates excluded. A full year means all accessible photos in that year, not twelve populated months. Earned calendar tiers remain permanent when library access/content changes. |
| Confirmed photo deletions / Declutterer | Distinct photo rows with `deletedAt`, set by verified deletion processing; estimates use known sizes. |
| Pending deletions | Reversible queue decisions, separate from verified deletions. The pending pill includes photos and videos, from the same saved snapshot. |
| Streak | Ten distinct photo/video views that day OR a confirmed deletion. Repeat views cannot inflate a day's unique count. Best streak includes eligible explicit restored days. Historical first-seen backfill does not manufacture past streak days. |

Explorer I requires 100 photos; 396/500 is progress toward II. Adventurer IV requires 25 supported completions; 25/50 is progress toward V. Awards were silently backfilled when badges were introduced, which can explain an award without a celebration. It does not prove the old completion counter was accurate.

The existing idempotent exploration migration uses saved encounters, decisions/deletion evidence and classic decision history. It does not infer exploration from preload, visits, or completion counts. Old data without reliable display/endpoint evidence cannot be reconstructed. Existing previously awarded levels are preserved with the distinction between saved awards and currently verified totals.

## Regression verification

`tests/progress-reliability.test.cjs` exercises the actual progress hook using simulated focus/AppState callbacks, shared resource race/failure/retry behavior, real SQLite badge/history evaluation, duplicate IDs, unsupported endings, backfill rollback, atomic completion rollback/restart/retry, photo/video separation, repeated encounters, failed discard persistence, consistent snapshot/badge totals and every family’s threshold boundaries. Existing review/collection fixtures now reach their actual endpoint before Finish. Existing encounter, migration, deletion replay, daily activity and limited-access tests cover the underlying records.

Verification: type check and changed-file lint pass. The full host suite passes 328 of 329 tests; the remaining unrelated navigation assertion expects a retired hidden Settings tab that the existing tab layout does not declare. The Progress browser capture loads saved empty-library statistics without console errors; no phone library was supplied.

Host tests simulate lifecycle and SQLite persistence; they are not physical-device validation. No browser library or phone achievement data is invented.

## iPhone acceptance checks still required

1. With a real library and existing achievements, alternate Home / Explore / Progress repeatedly; start/leave/finish an adventure and return. Saved numbers must stay visible during refresh and converge on the same totals.
2. Background during sync and review writes; lock/unlock; reopen and force-quit/relaunch. Initial native sync may load neutrally; an already displayed valid snapshot must not blink to placeholders during routine refresh. Across process termination, re-read saved evidence rather than inventing totals.
3. Inspect Explorer details: earned I at 100, 396 verified lifetime photos, next II at 500, 104 remaining (for the reported library). Inspect Adventurer details: verified distinct completions versus the legacy counter; preserve and flag IV if evidence does not support 25.
4. Revisit the same photo/adventure, restore/requeue a photo, cancel deletion, and retry an interrupted operation. Unique exploration/completion totals must stay unchanged; pending and confirmed deletion totals stay separate.
5. Try a stale ending after returning to an earlier photo and a final sideways discard with earlier survivors. Only the legitimate final flow completes; the daily limit never finishes. Check VoiceOver, both appearances and badge-dialog dismissal on the device.

## Secondary Explore layout and cover reliability

Album cards previously lived in a horizontal ScrollView with default cross-axis stretching, a fixed 128 px width and a one-line title. Their aspect-only thumbnail had no explicit width. Explore now uses a content-height two-column wrapping grid with top-aligned cards, explicit full-width square thumbnails, a consistent two-line title area, and adjacent count/percentage labels. One or an odd number of albums retains the same card width. The all-albums list and opened album header allow full names to wrap.

The cover loader previously chose only `members()[0]`. A missing stored item gave an empty cover; a resolution/decode error used the full review error view inside the thumbnail. This was a confirmed selection/fallback gap, not evidence that WhatsApp has a particular permission defect. The new decorative reader scans live album membership in bounded media batches, skips absent/inactive/deleted entries and tries the next member after rendering fails. Empty membership, denied lookup or exhausted candidates leaves an illustrated placeholder while the card still opens its original album scope. It neither requests new permissions nor changes membership or first-seen records. WhatsApp's exact failure mode remains unverified without the phone.

Video rows now reserve nonshrinking icon and chevron columns, allow text to wrap with a minimum width of zero, and grow vertically to fit their content. Video poster failures use a compact fallback behind the play icon. All videos retains oldest-first ordering; Largest videos retains size ordering. The review renderer’s normal error presentation remains unchanged.

Verification: 59 targeted cover, collection, review and progress tests pass; type check and changed-file lint pass. New cover/component tests check skipped/unavailable members, fallback beyond the first batch, videos in albums, exhausted fallbacks, cancellation, stale async results, navigation with full titles, unchanged progress and the two distinct video destinations. Temporary, explicitly labeled component samples verified one/two/many album layouts and video links at 320 px light and 430 px dark widths without console errors; those samples were removed afterward.

Before release, verify the real WhatsApp album under full and limited iPhone access, including a missing/cloud-only first member, subsequent accessible members, no accessible covers and opening long-named albums. Confirm All videos/Largest videos alignment with large system text on iPhone and Android, and repeat the higher-priority review/progress scenarios above. These native checks remain unexecuted.

## App-wide navigation consistency

The UI audit found independent headers with Back below titles, unlabelled close icons, missing Help navigation and an unconditional queue shortcut on generic pages. Secondary screens now share `ScreenHeader` and `NavigationBack`: an upper-left 48 pt chevron alongside a wrapping title, optional relevant trailing actions and guarded history/fallback navigation. Standard content screens keep the header outside scrolling content. The root tabs retain their Settings entry point; onboarding intentionally has no prior-step navigation. Photo review, the prototype and games reuse the same Back control with their existing exit callbacks, without changing gestures, saves or decisions. Completion and deletion-result screens offer the same header exit while retaining their existing primary actions.

The audit also fixed narrow plan-card price overflow and visibly disabled preview actions when no media exists. The navigation contract test now reflects Settings as the existing stack modal, rather than expecting a retired Settings tab.

Verification: all 339 host tests passed after the shared-header migration, including four new shared-navigation tests for history/fallback, custom review exits, wrapping titles/actions and persistent Page headers with context-only queue shortcuts. Existing review-state screen contracts now check the shared control. Type check and changed-file lint pass. Browser captures verified Help, Privacy, Settings, Months & Years, Pro, preview and the queue without console errors. The final price/disabled-state layout adjustments also pass type check and changed-file lint. Physical-device safe-area, large-text and native Back scenarios remain in `docs/DEVICE_QA.md`.

## Current consolidated rules

The [consolidated QA report](CONSOLIDATED_QA.md) supersedes earlier award-preservation/display notes: legacy claims remain archived but are excluded from confirmed earned-family counts. Current explicit Finish actions are revision checked; old partial endings/proofs cannot verify themselves. Undo preserves encounter history, and confirmed-deletion activity commits atomically with deletion totals. The approved daily limit is fixed at 150, with same-day IDs rather than historical exploration deciding free revisits. The consolidated report includes current test results and the required native acceptance pass.
