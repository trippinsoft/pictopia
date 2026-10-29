# Device acceptance matrix

All scenarios below are **not yet run on physical devices**. Use an internal native build from Draftbit Publishing, the registered test bundle/package IDs, and store sandbox accounts. Use disposable test media and a backup; never test deletion on the only copy of an important memory.

Repeat on minimum supported iOS/Android and a current maintained version; include a limited-access library, Android OEM variants, portrait/landscape rotation, large text, reduced motion, and screen readers.

| Scenario | Steps and required result |
| --- | --- |
| Appearance | Switch Light/Dark/System on iOS and Android; change OS appearance while open and backgrounded, reload/force-quit, and verify headers, status/navigation controls, permission dialogs, loading states and deletion confirmation. Confirm no screen/session resets or white startup flash. Include three-button and gesture navigation. |
| First launch | Open a fresh install, use onboarding, reach permission explanation without a paywall or account. |
| Full / limited / denied access | Grant each mode separately. Only authorized actual media appears. Denial offers Settings; limited access remains usable. |
| Photos and videos | Import fixture media into device Photos. Verify counts, creation months, ordering, representative thumbnails, video duration, unknown-size labeling. |
| Keep | Swipe right beyond threshold. Exactly one current ID gets a keep decision; original remains. |
| Set aside | Swipe left beyond threshold. Exactly one ID enters the queue; original remains. |
| Threshold and rapid input | Short drag springs back; repeated taps/rapid reversals do not double-apply or skip an ID. |
| Undo and skip | Undo restores the prior decision and counters. Skip does not create a decision. |
| Smart Sessions | Try Quick Wins, Memory Lane, and Best of the Bunch at 2/5/10 minutes; validate actual prioritization and suggested keepers. Finish early, undo, resume, and verify all originals remain until authorized deletion. |
| Session timer | Start a 2-minute session; leave via home gesture, lock and app switcher; return after 10 s and after 5+ minutes; force-quit and relaunch. The timer resumes on its own when a photo is on screen, never counts time away, and keeps its place within a few seconds after relaunch. At zero, users may finish or continue; no automatic decision or deletion. |
| Review controls | Review 30+ photos mixing swipes, button taps and rapid double taps, including right after returning from the background. Keep / Set aside never stay disabled while a photo is visible; nothing is decided twice or skipped; cloud-only photos display or explain themselves with Skip available. |
| Swipe feel | Card tracks the finger, short drags spring back, committed swipes leave fully, the next photo is already in place, buttons animate like swipes, haptics follow the setting, and Reduce Motion replaces motion with quick fades. |
| Process death | Kill after each decision, restart and reboot. Session position and queue match committed database state. |
| Full preview | Pinch, double tap, pan, rotate; play/pause/scrub portrait and landscape videos. Cloud/unavailable items explain failure. |
| Queue | Preview, restore one, restore all. Queue counts and sizes update correctly; originals remain. |
| Cancel deletion | Cancel in-app confirmation and OS authorization separately. No success or recovered-space claim appears. |
| Confirm deletion | Approve deletion on a disposable batch. Verify original IDs absent from OS enumeration and app. Explain Recently Deleted/Trash. |
| Partial results | Remove one asset externally during review; revoke permission during request. Only verified deletions leave local active state; ambiguous items retain history. |
| Limited-access deletion | iOS "Selected Photos" and Android 14 "Allow limited access": queue items inside and outside the selection, then delete. Only selected items are sent to the OS; unselected items are reported as unavailable and remain marked. Cancel the OS sheet once and confirm the "Deletion cancelled" message. |
| Restored items | Set aside several items, restore one from the queue, and check the session summary, Home and Insights: the restored item no longer counts as set aside and reappears in a later session. After confirming a deletion, deleted items still count as set aside in that session. |
| Interrupted deletion | Force-quit (app switcher) while the OS deletion sheet is open, once before and once after approving. Relaunch: the app reports the checked result; full access confirms absent items once; limited access reports unverified items without counting them. Relaunch again: counts in Insights do not change. |
| Exact duplicates | Include byte-identical originals, visually matching re-encodes, and matching filenames with different bytes. Only content-hash matches form exact groups. Live Photos require matching paired content. |
| Similar / best shot / blur | Use controlled nearby captures, rotated/cropped frames, sharp and low-detail images. Compare suggestions manually; no automatic deletion. |
| Scan interruptions | Pause, cancel, background, low-power mode, low memory, thermal pressure, process death. Resume without re-hashing unchanged successful originals. |
| Screenshots / large videos | Verify supported screenshot metadata and largest known file ordering; cloud/unknown sizes stay honest. |
| Quick Clean | Free account can review 30-item batches indefinitely; favorites and reviewed items are excluded by preference. |
| Purchase plans | With real store sandbox, buy monthly, annual, and lifetime independently. Native localized price and authorization shown. Only confirmed `pro` unlocks features. |
| Pending / cancel / restore | Cancel checkout, use Google pending approval, reinstall/second device with same store account, restore. No false success. |
| Expiry / refund | Expire sandbox subscription, revoke/refund a test purchase. Refresh CustomerInfo; premium gates close without clearing history. Lifetime remains non-renewing. |
| Offline | Review/undo/resume offline. Active cached entitlements work until their actual expiration; store operations report unavailable rather than simulating success. |
| Accessibility | VoiceOver/TalkBack action labels, touch targets, large text, contrast in both themes, reduced motion, alternative tap actions. |
| Stress | Repeat with 100 / 1,000 / 10,000 / 50,000+ actual media. Measure peak memory, query latency, swipe frame pacing, scan cancellation latency, and impact of very large/cloud assets. |
| Native launch | Confirm icons/splash, OS minimum versions, tablet/rotation, permissions, signing, store product ownership, and custom-module loading. |

Record device/build/OS, exact steps, observed results, screenshots, and failures in a separate QA record. Do not replace these with SDK mocks or host metadata benchmark claims.
