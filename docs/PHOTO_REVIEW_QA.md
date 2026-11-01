# Photo review: implementation and acceptance

## UX decisions

- The redesign applies to Adventure reviews, including chosen Pit Stop photo adventures. The separate classic timed Swipe flow, Pit Stop games and isolated 200-photo prototype retain their existing semantics.
- Both sideways directions queue a photo and send it flying into the trashcan; it leaves the scrolling sequence. Main scrolling never keeps or deletes. Recover with the immediate Undo pill, the trash tray's Restore, or Undo in the quiet ellipsis menu. There is no thumbnail filmstrip.
- After discarding: the next unmarked photo appears. Discarding the final forward photo opens completion after its flight lands, even when earlier photos remain. A forward scroll beyond the final photo also completes; merely viewing it does not. The count and rail use the original order even when photos are marked. Repeated viewing does not inflate distinct explored counts, and skipping past photographs does not count them as seen.
- Prior adventure-only set-aside marks are preserved without being silently enqueued. Their actions explain the distinction. Swiping one again explicitly adds it to the queue.
- The flight is one continuous transform of the photograph the user swiped: the overlay takes over at the card's exact frame and offset, and the card only stops drawing once the flight is painted. Travel eases along the curve; scale advances linearly in time and reaches its minimum at landing. Input unlocks at the handoff, except that final-photo completion waits for landing and the saved mark. Reduced motion replaces the flight with a 160 ms fade in place and still updates the count.
- The trash count is this adventure's pending marks only, and a photograph counts when it lands. The tray, the immediate Undo and the deletion queue share one authoritative state: the media record's queue decision.
- The existing black Adventure theme remains independent of app appearance. Portrait/landscape photos use contain, in the feed and in the tray carousel. Adventures remain still-photo snapshots; Live Photos display/share the still resource. Existing video collections/playback remain separate; native sharing adapters accept image or video MediaStore/PhotoKit assets.

## Automated verification

Focused host tests: review, feed and browser drag suites pass (53 tests), including final-photo flight timing, resumed completion, linear scale and 20/100/200-photo rail cases. Type checking and changed-file lint pass.

Coverage includes actual SQLite transactions with simulated iOS/Android library access: queue+session atomic commit, injected write failure rollback, reopen/relaunch, queue restoration elsewhere, explicit confirmed-deletion reconciliation, blocked changes during in-flight deletion, no OS calls from review, legacy migration, distinct seen counts, rapid jumps, discard animation waits, last/all-marked photos, undo of an earlier explicit Keep, guidance persistence/reset, and favorite-adapter rejection/cancellation/missing-capability cases. These are host tests with simulated native APIs, not device verification.

## Browser inspection

The Home empty-library screen opened at 375×667 in light mode with no console errors. The existing artwork component preview opened at 320×568 with no console errors. This browser has no selected photo library, so the updated two-card Home layout, review layout, and interactive review flow remain visually unverified here.

## Native behavior and limits

- iOS uses PhotoKit read/write access, `PHAssetChangeRequest.isFavorite` inside `performChanges`, and re-reads the asset after success. Limited access only permits visible assets; denied/canceled/unavailable mutations do not update the heart as a success. Source: [Apple favorite API](https://developer.apple.com/documentation/photos/phassetchangerequest/isfavorite).
- Android 11/API 30+ uses the system `MediaStore.createFavoriteRequest` approval and queries `IS_FAVORITE` after RESULT_OK. Android 7–10 have no supported native-favorite edit here. Device MediaStore state is not a promise of Google Photos cloud favorites. Source: [Android MediaStore API](https://developer.android.com/reference/android/provider/MediaStore#createFavoriteRequest(android.content.ContentResolver,%20java.util.Collection%3Candroid.net.Uri%3E,%20boolean)).
- iOS shares a temporary original/full-size PhotoKit resource through UIActivityViewController, supports iCloud download, and removes the export after completion/cancellation. Navigating away cancels a pending presentation; terminated-process remnants are removed on the next share. Android shares the original authorized content URI with a temporary read grant, without copying. Android can report opening a chooser, not that a destination received the file.
- The 160 px native thumbnail helpers remain in the module but no screen uses them now that the filmstrip is gone. Review photos, the flight and the tray carousel all come from the same cached full images, so the flying copy is already decoded when it takes over.
- Browser favorites never masquerade as native favorites. Web sharing is feature-detected and depends on browser/iframe policy; cancellation is quiet and unsupported sharing explains the limitation.
- New Swift/Kotlin source requires a build through Publishing. It was inspected against installed Expo SDK interfaces, but native compilation and runtime execution were not available here.

## Outstanding acceptance on physical iOS and Android

1. Through Publishing, install the native build. Check full/limited/denied access and OS authorization cancellations.
2. Browse forward/back, then discard either direction, including several in a row as fast as possible. Verify each photograph flies to the actual trashcan without flicker, the right photograph is marked, the count follows the landings, and the sequence and counter agree, including delayed saves/loading and device rotation.
3. Revisit and Restore marked photos; undo rapidly; restore from the queue or set-aside screen and return. Exit/reenter during save or fly-out. No decision should be applied to another asset, and no real deletion may occur before queue confirmation.
4. View the last photo, scroll backward, then scroll forward beyond it; completion should open only after the latter gesture. Repeat for one-photo and resumed adventures. Discard the last forward photo with earlier photos still active; it should complete after landing without showing an earlier photo. Repeat after discarding every photo. Restore from the tray and check that Journey counts do not inflate.
5. Start guidance with real photos, complete each action, skip individual/all tips, leave midway, relaunch and replay from Help. No prompt requires discarding, favoriting or sharing. Check VoiceOver/TalkBack and largest text, and disable motion while using the app.
6. Favorite and unfavorite existing/new native favorites, including repeated taps. Confirm the result directly in Apple Photos or Android MediaStore-aware gallery, relaunch and check the heart. Verify Favorite, Share, discard, Restore and trash arrival make no haptic feedback and do not shift the action row. Android cloud favorites must not be implied.
7. Share portrait/landscape, HEIC/JPEG, an iCloud original, and a video through the adapters where used. Check native destinations, cancel, unavailable/removed media, iPad popover placement and export cleanup. Verify original resolution/format at the destination.
8. Check the larger Home covers and review layout on small/standard iPhones, Android 7–10 and 11+, landscape, older hardware, both app appearances and reduced motion. Inspect paging/zoom/flight frame performance with several photographs in the air at once, the original-order rail while scrolling and restoring, and the trash tray carousel with portrait and landscape originals.

These checks have not been performed on devices. Browser screenshots and host storage tests do not establish native performance, authorization, sharing or favorites correctness.
