# FlickWell

Keep the memories. Lose the clutter.

FlickWell is an Expo SDK 55 / React Native 0.83 application with a working browser review flow and native media-library, SQLite, local-analysis, and RevenueCat integrations. **It is not yet verified for commercial release.** Native build compilation, device photo-library/deletion tests, and genuine store sandbox purchases remain required.

## Try the preview

Choose **Add photos** on Home to select your own photos or videos. Browser files are kept in IndexedDB locally; swipe decisions, undo, favorites, sessions, and preferences survive reloads. Browsers cannot delete originals or access the entire camera roll. No sample library, fake purchases, or simulated deletion is shipped. File collection dates in the browser use last-modified dates.

## Smart Sessions

Home offers Quick Wins (screenshots and easy candidates), Memory Lane (older unreviewed memories), and Best of the Bunch (validated Pro scan groups with a suggested keeper). Choose 2, 5, or 10 minutes for a bounded batch of up to 12, 30, or 60 items. Quick Wins and Memory Lane remain free; Best never substitutes unrelated photos for missing scan results.

Unfinished sessions resume before a new collection starts. Active review time is saved locally and pauses on other screens, in the background, and while media is unavailable. The timer is a gentle target: expiration never decides or deletes anything. Finish early for a summary and a path to the safe deletion queue. Remaining photos are still eligible for a future session; undo reopens the saved session. Two-step onboarding carries your selected session and duration directly into review.

## Native application

Use Draftbit **Publishing** for native builds. Expo Go does not contain the custom `FlickWellAnalysis` module or RevenueCat's native purchase implementation. The configured minimums are iOS 15.1 and Android 7.0 / API 24, subject to final build verification and maintained Expo support.

- `app/(tabs)/`: Home, Swipe, Smart Clean, Settings.
- Other routes: onboarding, preview, deletion queue, comparison, paywall, statistics, help, legal disclosures.
- `services/`: platform media, storage, analysis, and purchase adapters; serialized repository mutations.
- `lib/flickwell/`: typed models and deterministic review/analysis logic.
- `modules/flickwell-analysis/`: autolinked Swift/Kotlin local module for streaming original-file SHA-256, tiny-image difference hashes, Laplacian variance, metadata, cancellation, and battery/thermal/memory scan checks.
- Native SQLite schema version 1; browser IndexedDB schema version 1. No cleanup backend or user account is needed.
- Theme colors and typography live in `theming/themes/`; UI uses NativeWind and the existing Lucide wrapper.

Photos are referenced, not copied, on native devices. Browser selections are stored locally to support resuming. Native favorites added within FlickWell are app-local; system favorite metadata is read when supported. Live Photos display their still image; iOS original-content hashes include the paired video. iOS Live Photo motion playback uses a native PhotosUI view and still needs device verification.

## Store setup and release status

See [RELEASE_READINESS.md](docs/RELEASE_READINESS.md) for the feature-by-feature status and external setup; [DEVICE_QA.md](docs/DEVICE_QA.md) for device scenarios; [STORE_METADATA.md](docs/STORE_METADATA.md) for listing and privacy drafts. Public purchase keys and publisher contact/link names are in `.env.example`.

## Automated verification

Developer/CI entry points (the Draftbit user does not need a terminal):

- `yarn typecheck`
- `yarn lint`
- `node --test tests/*.test.cjs`
- `node tests/web.cjs` — preview at `localhost:17514`, Chromium at `CHROMIUM_PATH` or `/usr/bin/chromium`.
- `node tests/sessions-web.cjs` — onboarding, duration choices, paused timers, exact resumption, early completion, and honest scan empty states.
- `node tests/video.cjs` — real browser-generated video import and playback.

Repository tests use fake IndexedDB; native adapter tests exercise actual host SQLite and explicit SDK test doubles. These are not substitutes for native-device or store sandbox testing. Metadata benchmarks cover 100, 1,000, 10,000, and 50,000 rows on the host SQLite engine, not physical-device performance.
