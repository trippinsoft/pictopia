# Native photo review handoff

## Version comparison and correction

The user verified 1.0.12 works and 1.0.13 fails on a physical iPhone. Draftbit publish history identifies 1.0.12 (13) at 2026-11-01 04:18:45 UTC and 1.0.13 (14) at 13:58:31 UTC; the matching version/config commits are `3ba345a` and `df7331e`. The only application-code commit between those snapshots is `7e5135e` (the other commit changes config whitespace).

Between these snapshots, `explore-gesture.native.tsx`, `explore-pager.native.tsx`, gesture thresholds, the pre-discard `ExploreCard.begin`/`discard` logic, package dependencies and lockfile are unchanged. Changes to flight timing, Undo during flight, final-original-photo completion, live selected-photo reporting and accessibility account for the review differences.

The change in `7e5135e` at the root of `ExploreCard` is:

```tsx
// 1.0.12
<View style={styles.fill}>
// 1.0.13
<View style={styles.fill} accessible={active} accessibilityRole="image" ...>
```

This creates an active-dependent native ancestor around `ExploreGesture`. The installed React Native 0.83 `ReactCommon/react/renderer/components/view/ViewShadowNode.cpp` includes `viewProps.accessible` in `formsStackingContext`, which also sets `FormsView`. This outer wrapper has only `flex: 1`; its accessibility label, role, actions and action handler do not independently set that native-view trait on iOS. It can therefore be flattened when inactive and materialized when active. The installed `Differentiator.cpp` explicitly reparents children with Remove/Insert mutations during flatten/unflatten; iOS `RCTViewComponentView.mm::unmountChildComponentView` calls `removeFromSuperview`.

The first horizontal activation calls `ExploreCard.begin` → `ExploreFeed.claim` → `controller.claim` → `show` → `onPage` → `setActiveId`. When the controller still refers to the pre-scroll photo, that claim publishes `active=true` for the touched photo while its pan is already running. Fabric can then remove/reinsert its gesture-bearing child under the newly materialized accessibility wrapper. Native touch continuity can be lost, and End/Finalize cancellation springs the photo back. The second attempt sees the claimed photo already active and does not trigger this native ancestry transition. Native X/Y updates preceding the JS claim explain why the first photo visibly moves. Updating the selected-photo label during scroll does not update the feed controller's separate active ID.

The correction is limited to `collapsable={false}` on that outer wrapper. Its native presence no longer depends on `active`, restoring the stable native ancestry of 1.0.12 while retaining the accessibility actions introduced in 1.0.13. Thresholds, gestures, flight duration/curve, queue mutations, Undo, completion logic, artwork and visible UI are preserved. No package or configuration change is required.

This is a source-supported regression mechanism, not completed physical-device validation. The exact cancellation event on the affected iPhone has not been captured. If the correction does not restore first-attempt discards, the retained trace is needed to establish the actual device event sequence. Earlier host tests exercised native callbacks and controller claims separately and missed changes in the native hierarchy. The prior momentum/recognizer explanation was not established; its adjustments could not make this accessibility ancestor stable.

The added render regression checks retain shared drag values across inactive → active publication, require a materialized ancestor in both states, and preserve active-photo accessibility actions. They use host hook doubles and do not execute Fabric or UIKit. Native verification remains mandatory.

## On-device diagnostic capture

1. Save the work and install a new native build through Draftbit Publishing. The diagnostic export must contain marker `review-trace-1`.
2. Open an Adventure, scroll once, swipe horizontally until the failure occurs, then swipe the same photo again successfully. Repeat once if practical.
3. Without force-quitting, go to Settings. Hold the version line to enter the existing Adventure Lab. Hold the existing **Developer only** text to open the native text share sheet. Copy its contents and paste them into the conversation. No new visible controls are added.
4. The report includes the app/native build, platform/OS, native handler state transitions, translation/velocity, native and JavaScript offsets, page/controller/stored IDs as local aliases, claim decisions, card resets, programmatic scrolls, lifecycle changes, and reducer/save results. Native pan samples are buffered until Finalize; no per-frame JavaScript logging, file writes or network calls are added.
5. The report is a bounded 1,200-event in-memory buffer with a bounded alias map. It survives normal navigation/backgrounding, but clears when the process restarts. It includes no photograph pixels, original library IDs, filenames or paths and is shared only when the user invokes the share sheet.

Read the trace by its capture timestamps and receipt sequence: `pan.end`/`pan.finalize` with state 3 and `success: false` identifies native cancellation; successful End with no direction identifies the distance/velocity branch; `claim.rejected`, `feed.canBegin` and `card.begin` identify JavaScript acceptance failures; `feed.settle`/`feed.scrollTo` identify a competing page move; `card.action.rejected` and `store.reduce`/`store.saved` identify controller or save rejection. Compare both attempts' aliases, offsets, states and decisions before choosing a fix. A missing trace marker means the installed build has not supplied the new diagnostics.

## Coordination

- Keep the native vertical FlatList and existing stable photo IDs, page window and serialized writes.
- Run horizontal and native scroll recognizers simultaneously. Retain the ±12 pt X activation/Y failure criteria, one-pointer limit, and existing discard criteria: 64 pt deliberate displacement, or at least 16 pt with 650 pt/s velocity in the same direction.
- Once horizontal intent activates, set shared ownership on the UI thread. The native list's animated `scrollEnabled` prop holds vertical movement only for this activated drag. Normal browsing and momentum are enabled; no React render is needed for the handoff.
- Capture the UI-thread scroll offset at activation and pass that snapshot to page claiming. Stop at the selected page without creating a competing vertical animation.
- Finalization releases ownership. Only a pan that actually activated can cancel/reset a card; a valid commit remains locked through its existing flight handoff. Failed activation during normal scrolling never schedules a reset.
- Preserve the curved 300–350 ms flight (about 325 ms), reduced-motion fade, existing exactly-once save guards, next-photo handoff, Undo, restoration, final-photo completion and explicit permanent deletion confirmation. No haptics are added.

Host callback tests exercise the actual native gesture definition with delayed JS callbacks. Controller and SQLite tests cover serialized queue updates, rapid discards, Undo/restore, counts and completion. They cannot model UIKit arbitration or certify device gesture feel.

## Required physical iPhone acceptance

Use a build supplied by Draftbit Publishing with real photographs. This checklist has not been executed here. Repeat on a small and a current iPhone; include portrait/landscape, reduced motion, and a long library.

1. Scroll several photos and immediately flick the visible photograph left, then right. Repeat before momentum settles. Each valid gesture must discard that photograph on its first attempt.
2. Alternate fast scrolling and discarding at least 30 times, including backward scrolling. Confirm no snap-back, stale-photo discard, duplicated queue mark, or loss of vertical scrolling.
3. Try short fast flicks and long slow drags in both directions. Small diagonal motions, short slow movements, and pinch/zoom must not accidentally discard. Interrupt a partial sideways drag and resume vertical scrolling.
4. Discard several photos rapidly while earlier flights/save operations remain in progress. Confirm continuous curved flights, no haptics, one queue mark per photo, and immediately usable next photos.
5. Undo during a flight and after landing; restore through the trash tray. Confirm the correct photo returns once, counts and rail stay synchronized, and Favorite/Share still work.
6. Discard the final original photograph with earlier photographs remaining. Completion must wait for its flight and saved mark. Test final-photo forward scrolling too.
7. Navigate away and return, then repeat scroll → flick. Background and reopen during momentum, a partial drag, and a flight; repeat. No stuck input or duplicate decision is acceptable.
8. Open the deletion queue. Marking alone must never invoke permanent deletion; confirmation and OS authorization remain required.

Any recurring first-swipe failure keeps this release blocker open. Capture native recognizer lifecycle/claim rejection events on that device before further changes; passing host tests or browser gestures is insufficient.
