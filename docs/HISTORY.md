- Pictopia uses local SQLite/media references on native and IndexedDB for user-selected browser files; cleanup requires no backend or account.
- Native SHA-256 and thumbnail quality analysis run in an autolinked local Expo module; browser and store limitations are explicit.
- RevenueCat uses one `pro` entitlement across monthly, annual, and lifetime; real product pricing is supplied by the stores.
- Smart Sessions center cleanup on Quick Wins, Memory Lane, and Best of the Bunch, with short active-time targets, resume-first continuity, and voluntary completion.
- The product is named Pictopia throughout UI, source modules, build defaults, and release materials; legacy persistence identifiers stay stable for continuity.
- Appearance follows live System changes, persists explicit choices, shares theme variables with web dialogs, and synchronizes native chrome without interrupting navigation.
- Deletion is journaled and verified per item; unprovable outcomes (notably under limited photo access) stay pending and uncounted rather than being reported as deleted.
- Native identifiers moved to `com.trippinsoft.pictopia` on iOS and Android before any store release; session statistics now reflect current decisions so restores are not counted as set aside.
- The swipe deck became an explicit per-photo state machine with bounded waits, and the review timer moved to lifecycle signals with periodic saves, after TestFlight showed locked controls and a frozen timer.
- Vertical exploration uses a separate restore-only local experiment record and fixed 200-photo snapshot; it never writes production decisions or requests original deletion.

- Vertical exploration uses fixed native page slots for interactive peeking; sideways discards keep the snapshot mapping and unlock only after persisted position and actual pager alignment agree.

- Browser vertical exploration supports axis-locked pointer dragging and held peeks on its existing scroll surface, alongside wheel/trackpad scrolling.
- Browser page-drag ownership lasts through release snapping, with bounded recovery for interrupted scrolling, so feed settlement cannot return to the old page or strand input.
- Vertical exploration no longer locks input for persistence: settled pages save in the background in order, and only sideways discards briefly hold the feed.
- Vertical Explore discards now leave the feed (derived from the original order by stable ID) and a tap on the photo undoes the latest one, restoring it from its exit side.
- Vertical Explore sideways swipes are recognized on every loaded photo and claimed from the live scroll offset, so the first swipe after rapid scrolling discards instead of scrolling.
- Home became the Adventure Home: two truthful, preview-free Adventure choices that open the vertical explorer, Choose your own adventure, and one progress line; Swipe and Smart Clean moved behind Settings.
- Navigation became Home | Explore | Settings; Adventures are ~18 photos chosen by an explainable curation engine (scored, paired, sequenced), with a developer Adventure Lab, an understated finish, and tap-to-undo accepted like a swipe after scrolling.

- Pictopia uses a shared ivory/teal illustration system, fresh-pair Home refresh, and read-only Pit Stops with real photos; dates require native metadata and location play stays unavailable until reliable location data exists.

- Photo adventures and Pit Stops exclude identified screenshots before sampling; screenshot cleanup remains separate, and legacy mixed snapshots retain their review history without continuing as photo adventures.
- Which Came First uses vertically stacked photo answers with capture-date feedback and a 1.8-second advance, with untimed feedback for screen readers.
- Adventures always use a black viewing theme, keep a fixed photo total, end when the last photo is set aside, and support pinch-to-zoom that pauses paging and discards while zoomed.
- Memory Match mismatches turn back automatically; Adventure swipes say “Discard” with a thumbs-down so setting aside never reads as deleting; double tap zooms in Adventures.
- Adventures use painted WebP artwork (portrait Home covers, wide transparent finish headers), resized and compressed to ~40 KB each; kinds without art keep the SVG illustrations.
- Duplicates artwork is held for a future Duplicates Adventure rather than borrowed by another kind; Hidden Corners keeps its drawn illustration.

- Memory Match uses a remembered four/six-pair choice, minimal photo cards with real flips, restrained match feedback and inline completion; photo eligibility and other Pit Stops stay unchanged.

- Adventure review keeps every thumbnail reachable, queues only explicit discards atomically, finishes with Done, preserves legacy marks without auto-enqueuing, and teaches browsing through resumable contextual hints.

- Photo review drops the thumbnail filmstrip for one navigation model: scroll to browse, swipe to discard. The swiped photograph flies continuously into a persistent trashcan whose count, tray and Restore share the existing deletion queue state; running out of photographs is an empty sequence, not a finished adventure.
- Adventure review uses original-order photo counts and a moving fixed-center rail, and finishes after a deliberate forward scroll past the last photo or the final discard; the deletion queue remains separately confirmed.
- Final-photo discard waits for its saved trash flight before completion even if earlier photos remain; review actions are haptic-free, and flight scale advances linearly in time.

- Review discards now complete on the final original photograph after a shorter linear flight, with direct Undo, live progress, and accessible photo actions.
- The supplied painted adventure art now covers every current curated theme, and Home gives both choice covers more room while keeping them equally weighted.
- Pit Stop choices use the supplied square illustrations as optimized WebP artwork on Explore and the full Pit Stops screen.
- Adventure completion returns to the standard light/dark app theme while photo review retains its black viewing theme.
- Home now falls back to a truthful library selection when enough eligible photos miss every themed plan, keeps browser files distinct despite equal modified times, and refreshes after photo import finishes.
- The progress rail no longer prompts an explanatory review tip; its indicators remain visible during browsing.
- Home offers a short Adventure from real browser-selected photos when the usual curation minimum or prior exploration would otherwise leave its preview empty.
- Short browser photo libraries retain two Home choices by pairing a library detour with a dated selection while excluding queued photos.
- On This Day, Time Machine, and Detour use compressed photorealistic art with live photo windows drawn from each Adventure’s saved library selection.
- Personal Adventure photos now sit in separate white-bordered cards over clean photorealistic backgrounds, so their placement does not depend on baked-in blank frames.
- Personal Adventure prints preserve each library photo's full portrait or landscape composition instead of cropping it to a fixed frame.
- The Unexpected Detour cover places a two-photo stack with perspective on the stone below the camera.
- Pit Stop menus use compressed photorealistic scenes with eligible library photos shown in their printed photo areas.
- Pit Stop menu scenes omit baked-in blank prints so real library photos can sit in separate scene-specific cards with realistic size, overlap, and shadows.
- Memory Match menu artwork retains the original tabletop and hand-held cards so library photos align with their printed perspective; Guess the Year uses a larger photo print.

- Native photo review coordinates scroll and horizontal pan simultaneously, with UI-thread ownership and immediate page claims rather than competing snap animations.

- Keep the photo accessibility wrapper materialized across active-state changes to preserve native gesture ancestry while retaining screen-reader actions.

- Home experiments with resume/start cleaning, compact Featured adventures and direct cleanup rows while preserving existing curation, review sessions and deletion safeguards.

- Unified photo exploration persists first-seen history independently of decisions; Home has a compact percentage ring and one most-recent Continue, with Library Progress in More.

- Meaningful photo encounters use foreground visibility evidence rather than paging/preload state; delayed saves retain the original photo and earliest timestamp without changing decisions or navigation.

- Primary exploration measures the accessible photo library; lifetime exploration stays separate. Full chronological and direct photo collections share first-seen history and resume independently in bounded scrolling-review batches.

- Home / Explore / Progress separates rediscovery, collections and accomplishments; Settings moves to the Progress gear, with purple/sunset themes and existing artwork. Review, progress, resume and purchase rules remain unchanged.
- Purchases move to native StoreKit 2 / Play Billing (expo-iap, monthly and annual Pro, no server or accounts); videos play inside the shared review; albums and a developer Device checks report support early on-device validation.
- Playful Adventure foundation: ten saved pastel themes, Fredoka, three tabs with Settings sheet, fixed adventure catalog, calendar-day streaks with Restore Streak, seven badge families, and a 150/day free swipe allowance enforced in the shared review.
- Theme set: Stone restored and Seafoam retired (saved Seafoam choices switch to Mint); Cloud kept.
- Shared review redesign: ✕/progress header, always-visible Undo, two-step coach, end card Finish, recap card on exit, Completion → Ready to delete → Result with confirmed-only wording; the daily limit pauses a review and the paywall returns to it.
- Collections gained Albums (iOS) / Folders (Android), Videos (oldest first, largest first) and continuous 120-photo stretches.
- Duplicate Hunt is built and Pro-gated but closed for release until scanning and keeper suggestions are verified on devices (Lab can open it per device).
- Review-state fix: a review's saved place is always a real photo (never “past the end”); marks act on the visible photo; page saves are verified. Review header uses a back arrow, drops the daily countdown, and shows month/year top-right.

- Progress and badges share retained serialized snapshots; adventure achievements require supported distinct completion evidence, preserve legacy awards for audit, and explain earned versus next levels.

- Explore uses compact two-column album cards, accessible-member cover fallbacks and wrapping video rows; album names wrap fully when opened, while membership and review calculations stay unchanged.

- Secondary screens share upper-left Back controls, wrapping titles and relevant header actions; Help/legal navigation stays visible, review exits preserve their callbacks and cleanup alone opts into the queue shortcut.

- All decorative artwork returns to the existing designed SVG illustration system across Home, Explore, Settings, Pit Stops and completion; real photos remain in library content, never decorative scene overlays.

- Badge details use a centered enlarging, two-sided medal dialog instead of a bottom sheet, with reversible rotation, scrollable achievement facts and Reduce Motion support.

- Consolidated QA separates verified badges from archived claims, locks the approved 150-item daily allowance, strengthens completion/Undo evidence, isolates video playback from posters, adds local-only size metadata, and clarifies session progress, potential savings and collection actions.

- Time Machine is now The Yearbook: choose a year from Home or Explore and independently resume saved years; internal IDs, artwork and Time Capsule behavior remain unchanged.

- Explicit review Finish uses the current end-card state and revision-checked encountered endpoint, tolerates a lagging native position save, and reports rejected writes without changing pending deletions.

- Home has an unboxed, gently tilted daily “Did you know?” note with ten offline tips, persisted once-per-local-day rotation and no effect on review activity or allowance.

- Tapping Home’s daily tip advances to the next saved tip; automatic local-day rotation and offline persistence remain active.

- Home guidance is “For the Journey...” with a compass and fifteen approved guide messages, replacing all prior tips; daily-only offline rotation replaces tap-to-cycle.

- Removed the vague “Feeling adventurous?” guide message and restored tap-to-cycle for the fourteen remaining Journey notes, preserving daily rotation and offline persistence.

- Yearbook uses one canonical active snapshot per year; shared photo loading uses full asset IDs/local-first resolution, and video review/preview explicitly own player lifecycle. Failed media are excluded from allowance charging; no legacy migration or Photos-library reset is added.

- Visit recaps reserve space below the focused screen header instead of floating over Home; regular-view card styling keeps background and padding intact through animation.

- Home dynamically tightens measured section gaps and bottom padding to fit the pending-deletion pill when comfortable; smaller screens and larger text retain scrolling without shrinking content.

- Review segments retain marked slots and exact resume positions; larger Adventures continue in the same journey, while On This Day uses exact dates with seven-day Pro history.

- Segment boundaries lead directly to one completion screen; the two Pit Stops stay read-only and separate from cleanup progress and review allowances.

Adventure and collection summaries use result counts and one progress line instead of hero artwork, retaining at most two continuation/exit actions.

Loaded foreground photos count as reviewed immediately, including rapid scroll passes; no minimum viewing duration applies, and revisits or failed loads add no credit.

Fixed-slot review retains the 1.0.21 next-photo preparation and 300 ms vertical arrival, independently of persistence.

The review interaction uses the original 1.0.21 live feed: marked photos leave scrolling and are restored through Undo/trash; canonical snapshot IDs and deletion safeguards remain intact.
- Monetization will follow SwipeWipe/Picnic: onboarding ends in a subscription paywall with a 7-day free trial.
- Paid tier renamed from "Pro" to "Pictopia+"; declining the onboarding trial keeps a limited free tier.
- Pictopia acts as the user's guide: no onboarding questions; it always offers the next best adventure to avoid decision fatigue.
- Home leads with one recommended adventure plus a lighter alternative; equal two-postcard choice and shuffle removed.
- Tabs become Home | Timeline | Explore | Progress; "Library" avoided as a name because Apple/Google use it for the photo collection.
- No ads at launch; opt-in rewarded videos may be added later based on data.
- Adventures are whole sets with one "% reviewed" (no rounds/segments); only Surprise Me (20) and big piles like screenshots are subsets. Yearbook, Time Capsule, classic Swipe and Smart Clean retired; Pit Stops move to Progress.
- Streaks earn one-day milestone gifts (day 3/7/14…), not a permanently higher daily limit.
- Subscriptions follow the leaders: weekly + yearly with a 7-day trial; dark mode deferred past 1.0.
- Discarded photos stay in the review feed, faded with Restore; the review counts 'scrolled past' as reviewed; adventures are whole sets (On This Day = whole date, Surprise Me 20, Screenshot Sweep 50).
- Illustration style: Storybook landscape (flat layered scenes); Home keeps tilted postcards with a larger 'Pictopia's pick' card plus one alternative.
