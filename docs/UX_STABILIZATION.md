# Native UX stabilization — interaction, swipe, timer, session results

Scope: the TestFlight findings on iPhone (Keep / Set aside intermittently unresponsive, clunky swipe, timer frozen after leaving the app) and the P1 session-results and UX items. No monetization, gating, identifiers or Phase 2 work was touched, and no App Store build was started.

**Nothing here has been verified on a device yet.** Everything below needs the next TestFlight build.

## Root causes

### Keep / Set aside becoming unresponsive

The controls were gated on one boolean, `imageReady`, set only by the photo's `onLoad` callback. Several things could leave it false while the photo looked ready, or keep the controls locked for a long time:

1. **Readiness was thrown away on every provider refresh.** The swipe screen reloaded its item whenever `revision` changed. That reset `imageReady`, replaced the whole deck with a loading state and re-mounted the photo. `revision` changes after every decision, undo and skip, at the end of every background sync (each time the app returns to the foreground or the photo library changes), and after deletion recovery. Each reload depended on a fresh `onLoad`.
2. **`onLoad` is not guaranteed.** In expo-image 55.0.11's iOS view (`ImageView.swift`), a load that is cancelled or interrupted emits neither `onLoad` nor `onError` (`guard finished else { return }`, and cancellation errors are swallowed). Rapid re-mounts make cancellation likely, and a lost event left the controls disabled with no recovery path.
3. **Failed media never reported readiness.** If `mediaService.resolve` failed (for example an iCloud-only photo, which it rejects) or a video thumbnail failed, the placeholder appeared but `onReady` never fired, so Keep / Set aside stayed disabled for that photo.
4. **Controls waited on a whole-library recount.** The provider's `decide` awaited `refresh()` (library stats plus a per-month query for every month) before releasing the buttons. The save itself also queued behind any in-flight sync or analysis page in the shared write queue. Duration varied with library size and background work, which made the delay feel random.
5. **Swipes inside a scroll view.** The deck sat inside the page `ScrollView`. On iOS a slightly vertical drag could hand the touch to the scroll view, cancelling the pan and leaving the card off-centre.

The exact trigger on the test iPhone could not be reproduced here (no device logs), but every path above ends in the same symptom, and all of them are removed.

### Timer frozen at about 1:15 after returning

The timer only counted while `imageReady` was true. Returning from the background triggers a library sync, whose closing refresh bumped `revision`, which reset `imageReady` and re-mounted the photo (cause 1). If that reload's `onLoad` was lost or failed (causes 2–3), `imageReady` never came back, so the timer stayed paused and the controls stayed disabled together. That matches the report of both symptoms. Separately, every tick wrote to the database once a second through the same write queue as sync, so the on-screen value (read from the saved session) could stall while a sync ran.

## What changed

**Deterministic interaction model**
- `lib/pictopia/swipe-machine.ts` is a pure reducer: browsing → ready → committing (fly-out and save in parallel) → next photo. Every event carries the photo id it belongs to, so a late event for an earlier photo is ignored. Readiness is remembered per id and is never cleared by refreshes.
- `lib/pictopia/deck-controller.ts` runs transitions synchronously, so two presses in one frame can't both commit. It bounds every wait:
  - media settle: 6 s
  - fly-out: 700 ms, which covers interrupted animations
  - save: 8 s, after which the same photo returns to ready with a message
- A recorded save is final: a later rejection, such as a retry losing the race to the original, can't roll the card back. Repository `expectedId` checks still prevent decisions on the wrong photo.
- `MediaImage` reports a settled state for every outcome (`onLoad`, `onDisplay`, failure, fallback). Native photos display straight from the library reference (`ph://` on iOS, loaded by expo-image with iCloud access), so cloud-only photos show instead of failing. Video posters report failures too.
- Provider refreshes no longer unmount the photo. Records are cached by id and refreshed in place.
- The provider's `decide` resolves when the save commits; library totals refresh in the background. Home's Resume button is no longer disabled during background syncs.

**Swipe feel**
- Each `SwipeCard` owns its Reanimated values. The pan updates position on the UI thread; a release past about 28% of the width (max 120 px), or a quick flick, commits; otherwise the card springs back.
- Committed cards fly fully off-screen (240 ms ease-out). The next photo is already rendered underneath at 94% and grows as the top card leaves, so there is no flash or reload. The photo after that is prefetched.
- The buttons call the same fling as the gesture. Undo slides the photo back in from the side it left.
- Haptics: a selection tick for Keep and a light impact for Set aside, following the Haptics setting.
- Reduce Motion: no rotation or fly-out; the card fades and springs are replaced with instant moves.
- The active deck no longer scrolls, and vertical drags fail the pan instead of fighting it.

**Timer**
- `lib/pictopia/review-clock.ts` counts only while four signals are true: the screen is focused, AppState is active, the page is visible, and a usable photo is in front of the user. Any signal change closes the current interval first, so nothing is double-counted. Gaps over 3 s (a suspended or stalled JS thread) are dropped.
- `components/pictopia/use-review-clock.ts` feeds it real AppState, focus and visibility events, shows unsaved time immediately, and saves every ~4 s plus immediately on blur, inactive or background. It resumes by itself when the app becomes active, because readiness no longer gets lost.

**Session results**
- The completion screen's Kept and Set aside numbers are tappable tiles, and the running "kept • set aside" line in Swipe is tappable.
- They open `app/session-review.tsx`: this session's photos by current decision, tap to see larger, one-tap Keep / Set aside to change. Set-aside photos lead to the existing deletion review, whose confirmation is unchanged.
- The full preview shows a Keep / Set aside bar for photos that already have a decision.

**UX polish**
- Consistent Keep / Set aside / Restore / Delete wording, and `plural()` for counts ("1 item", not "1 items").
- A clear next action on completion: "Review N items set aside", then "Done for now". The headline still says "That's progress worth keeping" after restores.
- Unavailable photos explain themselves and highlight Skip instead of silently disabling Keep / Set aside.
- Momentary locks between photos no longer dim the buttons.
- Single photos in the queue and session grids keep tile size.
- The swipe card has a defined surface in light and dark mode.

## Tests

- `tests/interaction.test.cjs` (15 tests):
  - stale and foreign events
  - readiness surviving refreshes
  - save/animation ordering
  - duplicate commits
  - repeated presses in one frame
  - rapid swipes through a batch
  - slow media (watchdog)
  - interrupted animation
  - slow, failed and unanswered saves
  - late saves after a timeout
  - swipe physics
  - pluralization
- `tests/review-clock.test.cjs` (7 tests): iOS lifecycle sequences (active → inactive → background → active after 5 minutes), screen lock and app switcher, a missed lifecycle event or stalled thread, no double counting, flush chunking and retry, and elapsed time surviving termination and relaunch on the real SQLite adapter.
- `tests/session-safety.test.cjs`: changing decisions from the session list keeps totals and the queue accurate and respects in-flight deletions.
- `tests/interaction-web.cjs` (browser, 6 checks):
  - a burst of presses records each photo once
  - button and swipe give the same result, and short drags spring back
  - undo returns a ready photo
  - session totals open the photos, and changes from the list and preview update the totals
  - set-aside photos lead to the deletion review
  - no runtime errors
- Existing browser suites were updated only for renamed labels, the ~4 s save cadence, and the restored photo returning to the next batch.
- Mutation check: nine reintroduced failure modes (readiness reset on refresh or re-sync, no settle / animation / save watchdog, duplicate commits, background time counted, suspension gap credited, late rejection rolling back a success) each fail at least one test.

## Needs the next TestFlight build

Native-only behaviour can't be exercised in this workspace: real iOS gestures, frame rate, haptics, Reduce Motion, AppState transitions, expo-image `ph://` loading (including iCloud originals) and VoiceOver. On the device, check:

1. **Unresponsive controls:**
   - Review 30+ photos, mixing swipes, button taps and rapid double taps. Keep / Set aside never stay disabled while a photo is visible, and no photo is decided twice or skipped.
   - Leave the app mid-session (home gesture, lock, app switcher), return after a few seconds and after 5+ minutes. The controls respond at once.
2. **iCloud photos:** with Optimize iPhone Storage on, older cloud-only photos appear (possibly after a short spinner) and can be decided. Where one can't be shown, the placeholder explains it and Skip works.
3. **Swipe feel:**
   - The card tracks the finger and doesn't stutter.
   - Short drags spring back, and committed swipes leave the screen fully.
   - The next photo is already there, with no flash.
   - A slightly diagonal swipe still works, and vertical scrolling elsewhere isn't hijacked.
4. **Buttons:** Keep / Set aside animate exactly like swipes. Haptics fire when enabled and stay silent when off.
5. **Reduce Motion** (Settings → Accessibility): no rotation or fly-out; transitions are quick fades.
6. **Timer:**
   - Start a 2-minute session, review for 30 s, then leave. Return after 10 s and after 5 minutes: it resumes counting on its own and hasn't advanced while away.
   - Lock and unlock the phone mid-session.
   - Force-quit and relaunch: it resumes within a few seconds of where it was.
7. **Session results:**
   - Tap Kept and Set aside on the completion screen and on the running totals.
   - Open a photo larger and change its decision.
   - Totals update, and deletion still asks for confirmation.
8. **Undo:** the previous photo slides back in from the side it left and can be decided again.
9. **VoiceOver:** the card underneath isn't announced, and buttons announce their state.
