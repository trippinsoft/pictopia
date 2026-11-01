# Memory Match verification

## Automated checks

`tests/memory-match.test.cjs` exercises the production controller with a deterministic clock: both deck sizes, unique eligible photographs, saved preferences, duplicate/rapid taps, every reveal/mismatch/flip-back/match phase, completion after settling, exit/restart cancellation (including stale callbacks), background pause, unavailable media locks, screen-reader timing and reduced-motion timing. Layout calculations cover 320×568, 375×667, 390×844, 393×852 and 360×640 with safe-area allowances; shorter windows retain a scrollable minimum card height.

The focused run also includes `pitstops.test.cjs`, `photo-eligibility.test.cjs` and `order-round.test.cjs`: 32 passing tests. Type checking and changed-file lint pass.

## Browser inspection

The real entry/empty-library state rendered at 375×667. Isolated component previews showed both card-back grids at 320×568 and 390×844 across light/dark themes, and the completion state at 375×667, with no console errors. The temporary component-preview route was restored afterward. These captures verify layout, not photo loading or interaction: the capture browser had no selected photos and no click/type tools were available. No sample photos were inserted into the library.

## Still requires interactive/device acceptance

- Complete both sizes using actual photos in the browser and on iOS/Android; inspect intermediate flip frames for mirroring/flicker and image recognition, including portrait, landscape and iCloud photos.
- Feel the soft match haptic on hardware; verify Settings disables it. Browser and unsupported hardware intentionally stay silent.
- Confirm frame smoothness, match highlight/settle and final transition on slower devices, in both themes and with reduced motion enabled.
- Rapid-tap through reveals and mismatch flip-backs; restart, navigate back/swipe-back, background and resume at every animation phase. No old game should advance or emit feedback afterward.
- Check VoiceOver/TalkBack focus, photo-number labels and the three-second mismatch hold. Test largest text and landscape scrolling.
- Confirm the chosen pair count survives leaving setup and relaunching, and loading failures allow a fresh set.

Use Draftbit’s Pro simulators or a native build from Publishing; physical hardware is needed for haptic feel.
