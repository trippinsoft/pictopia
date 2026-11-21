# Home layout reliability

## Rule

Home's layout is a pure function of its content. Section gaps are flex spacers (`homeGap` in `lib/pictopia/home-spacing.ts`): each starts at its compact minimum, grows in proportion to its range (roomy − compact) and stops at its roomy size. The column fills the scroll viewport (`flexGrow: 1`), so the native layout engine shares any spare height among the gaps in a single pass: roomy gaps on tall screens, proportionally compressed gaps when the Discarded pill would otherwise fall below the fold, compact minimums and normal scrolling on short screens or with larger text. Home must never measure its sections with `onLayout`, hold layout in React state, or choose spacing in JavaScript.

## Root cause of the bouncing

Home used to measure each section with `onLayout`, store the heights in state and compute 4 pt-stepped gaps from them (`homeSpacing`). Rendering new gaps moved the sections, which produced new native layout events, which updated state again. The 4 pt quantisation made this unstable: a one-pixel (⅓ pt) difference in a measured height could switch every gap by 4 pt at once (up to 24 pt in total), accumulating down the page. The header and stickers above the first adaptive gap and the tab bar outside the ScrollView stayed still, while the heading, postcards and tip jumped between two arrangements. That matches the iPhone recording. Any measurement that alternates by a pixel between passes (text, `adjustsFontSizeToFit`, safe-area or viewport changes after Control Center or foregrounding) kept the cycle going. The earlier fix made the measurements independent of the gaps but kept the measure → state → layout loop.

## Evidence

`tests/home-layout.test.cjs` renders HomeContent's real tree and lays it out with `yoga-layout` (the engine React Native uses) at iPhone 3× pixel rounding. It confirms:

- Home has no `onLayout`, state or measured spacing.
- The section order is correct.
- Gaps are roomy, compressed or at their minimums as the design intends, and the content still scrolls.
- Across 11 iPhone screen heights and a wide range of content heights, a one-pixel change in any section never moves anything by more than that pixel, and the header never moves.
- Repeated layouts are identical.

These tests run the real layout engine on the host. They are not a device recording; confirm on an iPhone build (idle 30 s, Control Center, scroll, adventure return, tab switches, background/foreground, data refresh).
