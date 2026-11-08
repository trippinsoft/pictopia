# Product quality corrections and verification

Physical-iPhone acceptance is still open. No native simulator/device tools are available in this workspace, and no physical-device logs were provided. This work does not establish identical v1.0.21 swipe feel, native rendering performance, cloud retrieval, haptics or native playback correctness. Publishing is the path for delivering a native build for those checks. No originals were modified, uploaded, favorited or deleted during this work.

## Current interaction rollback

The review interaction is restored from the app-version 1.0.21 snapshot `30952df`, including the original card motion, live-feed removal/re-anchoring, next-photo preparation/slide, controller and forward flight lifecycle. Marked photos leave the rendered feed and remain available through Undo and the trash tray. Canonical ordered snapshot IDs, pending marks and meaningful review history are retained. Inline faded marked slots and reverse-trash Restore are removed as part of this explicit rollback; there is no extra interaction toggle or alternate review engine.

`tests/v21-source-parity.test.cjs` checks SHA-256 equality against original native gesture/pager/flight-math files and the card-motion, forward-flight-clock and discard-controller blocks. The retained differences are media failure/retry/video safeguards, passing an already painted URI to the media boundary, allowance checks, position flushes and error wording. Persistence and modern completion stay outside animation motion. The feed stays mounted through the final discard and all-marked resume uses the same completion screen.

No version tag links the snapshot conclusively to the user's installed 1.0.21 binary. Source equality is not device-performance evidence. No local or actual photo library was reset; no OS deletion was requested.

## Physical iPhone verification still required

Use Publishing to deliver the change. Compare slow drags, fast flicks, rapid alternating left/right discards, next-photo arrival and vertical scrolling with 1.0.21. Test Undo during flight, trash-tray Restore, exit/resume, background/foreground, marking every photo and the last photo, failed/cloud media, and the global 150/day Free gate. Verify one completion destination and no accidental native deletion. Exact feel remains unaccepted until the user confirms it on the physical iPhone.
