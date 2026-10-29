# About this app

This file describes this app's stack, structure, and conventions. **Keep it updated and short**: when the app gains a backend, new conventions, or significant structure, edit this file (and the README) in place so future sessions inherit that knowledge. This file is loaded into every session, so it describes the current state only. Never add dated or per-task entries, change logs, or test results, even if earlier ones exist. Put notable decisions in `docs/HISTORY.md` as one line each, and keep this file under about 200 lines.

## Stack

- Expo cross-platform app (iOS / Android / Web), TypeScript (strict), Expo Router (file-based routing under `app/`)
- NativeWind (Tailwind for RN) for styling
- Yarn Berry (v4.x) — check `.yarnrc.yml` for the linker; with Plug'n'Play there is no traditional `node_modules`. Patching dependencies is a last resort; use `yarn patch`, never hand-edit.
- React Query available for server state when a backend is wired
- Path aliases are defined in `tsconfig.json` `paths` — use them instead of long relative imports.

## Theming

Keep colors and typography centralized in the app's existing theme setup (Tailwind config, theme files, or CSS variables) and use them through NativeWind classes — never hardcode per screen. When changing colors/typography, update the central definitions. Support both light and dark with readable contrast if the app supports both.

## Conventions

- **Reuse first:** use the app's existing component, icon, and styling libraries and patterns before adding new ones. Check `package.json` and existing components before introducing a dependency.
- **Icons:** use the app's existing icon approach. If icons need NativeWind classes, make sure they go through a wrapper or interop that applies them.
- **Navigation:** set an explicit human-friendly `title` for every screen header — never let route names like `(tabs)` or `products/[id]` appear in the UI. Keep `app/index.tsx` for redirects, not feature UI; use `_layout.tsx` files for stacks/tabs.
- **API routes:** server-only logic can live in Expo Router API routes (`+api.ts` files under `app/`). They require `web.output: "server"` in the app config and run in the preview; secrets they read use unprefixed environment variables, never `EXPO_PUBLIC_`.
- **Fonts:** load through the `expo-font` config plugin (declared in the app config) or `useFonts` in the root layout — follow whichever the app already uses.
- **Screens:** wrap in SafeAreaView (react-native-safe-area-context) and handle scrolling/gestures correctly. Keep bottom tab bars compact — pad content inside screens, not via `tabBarStyle`.
- **Components:** keep components small and focused, follow the app's existing folder structure, and reuse before creating.
- **Performance:** `FlatList`/`SectionList` for long lists — never `ScrollView` + `.map()` for large collections.

## Critical files

- `app/_layout.tsx` — root layout and app-wide providers
- `tailwind.config.js` and `global.css` — NativeWind config and global styles
- `app.config.*` — Expo app config

## Draftbit starter structure (if present)

Apps created from the Draftbit starter ship with the pieces below. Follow them where they exist; don't add them to apps that don't have them.

- **Theming:** `theming/ThemeProvider.tsx` injects theme objects (colors + typography) as CSS variables via NativeWind's `vars()`; typography is flattened (`h1.fontSize` → `--h1-fontSize`). Theme shape in `theming/Theme.ts`, concrete themes in `theming/themes/light.ts` and `dark.ts`, mapped to classes (`text-foreground`, `bg-background`, `text-h1`, `border-border`, …) in `tailwind.config.js`. `lib/useColorScheme.tsx` syncs the system preference. Use `useTheme()` only for raw values; change colors/typography in the theme files.
- **Components:** React Native Reusables (shadcn-style, `@rn-primitives/*`) in `components/ui/`, layout pieces in `components/layout/`, `cn` helper in `lib/utils.ts`. Build higher-level components on these primitives. Without `components/ui/` and `@rn-primitives/*` in `package.json`, compose React Native primitives with NativeWind instead and don't pull `@rn-primitives/*` in unless asked.
- **Icons:** `lib/icons/LucideIcon` wraps Lucide so NativeWind classes apply — `<LucideIcon name="Home" className="h-6 w-6 text-foreground" />`. Don't import from `lucide-react-native` directly, and validate `name` against the wrapper's registry.
- **Portals:** web uses `WebPortalContext`, native uses `PortalHost` from `@rn-primitives/portal`, both set up in `app/_layout.tsx`; the `components/ui/` primitives rely on them.
- **Alias:** `~/*` maps to the project root, e.g. `import { useTheme } from '~/theming/ThemeProvider';`.

## Current state

- Pictopia photo/video cleanup app; no backend/account needed. Expo SDK 55, React Native 0.83, iOS 15.1+ and Android API 24+ configuration.
- Four tabs under `app/(tabs)/`: Home, Swipe, Smart Clean, Settings. Stack routes include onboarding, full preview (with a Keep / Set aside bar for decided items), this session's photos (`session-review`), safe deletion queue, comparisons, Pro paywall, insights, help, and legal drafts.
- `components/pictopia/provider.tsx` coordinates permission, paginated sync, sessions, preferences, scan state, and current Pro entitlement. Repository mutations are serialized; read the latest asset inside the serialized mutation to preserve decisions during sync/analysis.
- `services/*.{native,web}.ts` share `.types.ts` interfaces and `.d.ts` declarations. Native uses Expo MediaLibrary and SQLite schema v1. Web uses real selected files and IndexedDB schema v1, with no original-file deletion or simulated store purchases. Browser dates are last-modified dates.
- `lib/pictopia/` holds typed records, calendar grouping, stable shuffle, decisions/undo, entitlement expiry, genuine quality heuristics, and Smart Session names/timing. Home prioritizes Quick Wins, Memory Lane, and Best of the Bunch with 2/5/10-minute batches (12/30/60 items); Best uses validated Pro scan groups only.
- `modules/pictopia-analysis/` is an autolinked Swift/Kotlin Expo module: off-thread streaming original SHA-256, 32px difference hash/Laplacian variance, favorites/screenshot metadata, scan cancellation and resource checks. Requires a native build, not Expo Go. iOS Live Photo motion uses a native PhotosUI view; still preview and paired hashing also exist.
- Unfinished reviews resume before any new collection can start. Sessions may finish early; timer expiry never makes decisions. Two-step onboarding carries the chosen duration into Swipe.
- Swipe deck: `lib/pictopia/swipe-machine.ts` (pure reducer) + `deck-controller.ts` (watchdogs: settle 6 s, fly-out 700 ms, save 8 s) behind `components/pictopia/use-swipe-deck.ts`. Readiness is tracked per photo id and never reset by provider refreshes; controls unlock when the photo's media settles (loaded, failed placeholder, or timeout). Each `SwipeCard` owns its Reanimated values; the next photo renders underneath; buttons call the same fling as gestures. Physics in `swipe-physics.ts`.
- Review timer: `lib/pictopia/review-clock.ts` counts only while focused + AppState active + page visible + photo ready; `use-review-clock.ts` saves every ~4 s and immediately on blur/background. Provider decisions resolve on save; library totals refresh in the background.
- Native photos display straight from `media.uri` (`ph://` on iOS, which expo-image loads with iCloud access); `mediaService.resolve` is a fallback and is still used for video, analysis and file sizes.
- Native favorites added in Pictopia are app-local. OS favorite metadata is read when supported; never imply the app changes OS favorite flags.
- Legacy database identifiers and the Live Photo hash boundary marker remain stable across branding changes so existing cleanup data and cached hashes are preserved. Native identifiers are `com.trippinsoft.pictopia` on iOS (registered with Apple) and Android; changing them after release breaks store continuity and local data.
- Native media references are never copies of full-resolution originals. Marking is local only; deletion requires explicit confirmation and OS authorization. Storage numbers are estimates from known sizes, not measured free-space changes.
- Deletion safety (`services/deletion.ts`, rules in `lib/pictopia/deletion.ts`): only items verified visible and unchanged are sent to the OS; a `deletionAttempt` journal is persisted before the request and its OS result after; outcomes (confirmed / remaining / uncertain / skipped) and `confirmedCleanup` are applied in one transaction, processing only still-tracked ids so replays never double count. Absence proves deletion only under full access, or under limited access with a recorded OS success and unchanged scope; everything else goes to `deletionPending`. `recoverDeletions` runs at native startup, on foreground, and before each deletion; it never deletes. Decisions on items in an in-flight journal are refused; restoring/keeping a pending item stops tracking it. Verified deletions set `deletedAt` on the record.
- Swipe decisions and skips pass the displayed item id; the repository rejects them if the session has moved on.
- Copy uses Keep / Set aside / Restore / Delete consistently; counts go through `plural()` in `lib/pictopia/text.ts`.
- Session kept/set-aside numbers shown in Swipe, Home and Insights come from `repository.tally` / `useSessionTally` (current decisions; restored items drop out, verified deletions still count). The `kept`/`marked` fields saved on a session are historical counters, not display values.
- iOS photo purpose strings: read-write access is described as review plus confirmed deletion; the add-only string states Pictopia never saves to the library (the key stays because expo-media-library's binary references add-only access).
- RevenueCat (`react-native-purchases`) uses entitlement `pro` and store-localized Monthly/Annual/Lifetime packages. Public keys: `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`. Publisher fields: `EXPO_PUBLIC_SUPPORT_EMAIL`, `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`. No keys/products configured by default; never simulate successful purchases.
- Appearance uses the existing light/dark theme tokens and native Appearance subscription. Browser System mode releases explicit overrides; a small `pictopia.appearance` localStorage mirror only bootstraps first paint while IndexedDB stays authoritative. Root CSS variables theme body-mounted dialogs; native root backgrounds/navigation styles use `services/system-appearance.*` and Expo SystemUI/NavigationBar. Navigation remains mounted during live theme changes.
- Branding assets under `assets/images/`; theme palette/Inter typography in `theming/themes/`. Native gestures and browser pointer wrappers live in `components/pictopia/`.
- `docs/RELEASE_READINESS.md` records feature status and external release blockers; `docs/DEVICE_QA.md` holds unexecuted physical-device scenarios; `docs/UX_STABILIZATION.md` explains the deck/timer design, its root causes and device checks. Real native build/device/store verification and publisher/legal setup are required before commercial release.
- Tests: `node --test tests/*.test.cjs` (`tests/native-harness.cjs` simulates restarts on real SQLite with full/limited/no photo access), browser `node tests/appearance-web.cjs`, `node tests/web.cjs`, `node tests/sessions-web.cjs`, `node tests/interaction-web.cjs`, `node tests/explore-web.cjs`, and `node tests/video.cjs`, plus `yarn typecheck` / `yarn lint`. Host SQLite metadata benchmarks are not device stress tests.
