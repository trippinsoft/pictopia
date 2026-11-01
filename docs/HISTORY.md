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
- The Unexpected Detour cover now shows a three-photo stack from its saved selection when three photos are available.
