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
