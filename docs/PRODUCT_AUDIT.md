# Product audit (interview)

Working record of the owner's answers about what each part of Pictopia should do. Decisions here guide later simplification work; nothing is changed in the app until a section is agreed.

## Agenda

1. The big idea — what Pictopia is for, and for whom
2. First launch and onboarding
3. Home
4. Explore (adventures, clean-up, months & years, videos, albums, Pit Stops)
5. The review screen (swiping, marking, undo, trash)
6. Deleting (Ready to delete, results)
7. Numbers and progress (counts, streaks, badges, Progress tab, daily limit)
8. Pro and the paywall
9. Settings and hidden extras (classic Swipe, Smart Clean, set-aside, Lab)

## Competitor reference (public sources, Nov 2026)

SwipeWipe (MWM) and Picnic (Picnic Ventures / MWM), from store listings, official sites and reviews; not hands-on.

- **SwipeWipe:** home is a grid of folders (Recents, Duplicates, one per month); one month per session with a countdown to zero; right keep / left delete, tap to go back, bookmark for "unsure"; end-of-session summary with space saved and restore; My Stats, streaks, On This Day. Complaints: escalating cooldowns, lost progress, re-shown photos, wrong counts (shipped "Fixed photo counts" in 3.5.3).
- **Picnic:** paywall before the first swipe; Sort / Have fun / Repeat structure; right keep / left archive, double-tap favourite, big colour overlay plus a brief Undo; one Archive emptied with one tap, then a storage-saved moment; streaks earn bonus swipes; ~100 free swipes/day. Complaints: shrinking free cap, ads, re-shown photos, delete glitches.
- **Copy:** one swipe meaning everywhere; one batch emptied with one tap; small finite units with a countdown; session summary with storage saved; a "maybe later" option; On This Day + streak as the daily hook.
- **Avoid:** changing or unclear limits, re-showing decided photos, stale counts, paywall before any value, ads in the loop, vague deletion wording.

## Answers

### 1. The big idea

- **Guiding principle:** learn from the leaders without copying them. The core mechanic (scroll & swipe instead of left/right decisions) is what makes review sessions less stressful. **Pictopia is the user's guide:** it always presents the next best adventure so people enjoy their photos and see progress without having to choose. Avoiding decision fatigue outranks offering options.

- **Purpose:** cleanup first. Pictopia is "the funner and faster way to review and clean your photo library."
- **Differentiator:** scrolling instead of keep/delete swiping. No decision fatigue: just scroll and enjoy your photos, and swipe away the clutter. Planned marketing line: "Keep or delete, keep or delete… Stop the decision fatigue and just scroll and enjoy your pictures again. Swipe away the clutter."
- **Audience:** mainly people with large libraries (10k+) who feel overwhelmed, while still working for someone with a few minutes a day.
- **First five minutes:** "Hey, this is different and creative," plus both "that was fun" and "that was fast."
- **Counts:** to be walked path by path.

### 2. First launch and onboarding

- **Onboarding is critical and currently missing.** Model it largely on SwipeWipe and Picnic, including social proof (as SwipeWipe does). Owner is sending competitor screenshots.
- **Core actions are Scroll and Swipe** (the owner considered naming the app "Scroll & Swipe").
- **Vocabulary:** the removal action is **Discard** everywhere, because nothing is deleted until the user confirms. (SwipeWipe says delete, Picnic says archive.) Completion wording, for example: "100% reviewed · 15 kept · 5 discarded" or "100% reviewed · 5 discarded". "Kept" = scrolled past without discarding.
- **Monetization follows the market leaders:** a paywall with a **7-day free trial** at the end of onboarding is a given. Price, ads and referrals are still undecided. **Declining the trial keeps a limited free tier** so people can experience the basic features (today: 150 items/day); the paywall returns at the limit or on paid features.
- **Paid tier is named "Pictopia+"**, not "Pro" ("Pro" suggests a separate professional version). Rename all user-facing copy; store product IDs `pictopia.pro.*` stay unchanged internally. Store display names should also say Pictopia+.
- **Onboarding shape agreed in principle:** hook → three-step story → social proof → permission primer → short quiz whose answers drive real behaviour → "planning your first adventure" with the user's own photos and library stats → paywall → straight into the first adventure. No gender/age questions. Social proof must be truthful.
- **Reminders: yes.** Daily streak reminders, On This Day notifications (only when that date has photos) and a trial-ending reminder. The owner believed the first two already existed; the code has in-app streaks but **no push notifications of any kind**, so all three need building.
- **Discard pile follows Picnic's Archive model:** one place, shown as a single row such as "58 MB to delete" with a count badge (34), opening the list with one Delete action. Section name: "Discarded".
- Picnic's Profile also shows three progress tiles (day streak, % sorted, GB saved); reference for area 7.
- **No questions in onboarding.** Asking first thing contradicts the "no decisions" promise; Pictopia picks the first adventure itself.
- **Rating request only after a few real uses**, never in onboarding: a light "Enjoying Pictopia?" check (thumbs down / thumbs up / two thumbs up); only positive answers lead to the store rating prompt. (Google Play's in-app review rules forbid asking opinion questions before its rating prompt, so Android may need the store prompt without the pre-question.)
- **Free daily limit lowers from 150 to 100.** Like Picnic, keeping a streak should earn extra free items (details to define; owner to share Picnic's streak screenshot).
- **Discarded lives on the Progress tab, with a link from Home.** Keep two scopes distinct: everything waiting in Discarded vs the photos discarded in the review just finished.
- **Read iCloud photo sizes (approved)** using PhotoKit's per-file size value, with an estimate fallback, so totals always show.
- **Sizes must always show a total**, like Picnic ("58 MB to delete"). Today Pictopia often says "Size unavailable", which undermines confidence. Cause: on iOS we only read sizes of files stored on the phone and deliberately avoid PhotoKit's undocumented per-file size value, so iCloud-only photos have no size.
- Open: honest social-proof source.
- **Decision: follow Picnic's onboarding more than SwipeWipe's,** because Pictopia has no social proof yet.

**Picnic onboarding teardown** (owner's iPhone screenshots, Nov 2026), in order:
1. Ad-tracking (ATT) prompt immediately on launch, used for measuring paid ads.
2. Logo + Continue, "By using Picnic, you agree to our Terms and Privacy Policy".
3. Promise: "In 2 mins a day, transform your messy photo library into organised memories." CTA "Let's sort my life out".
4. Permission primer: Photo Library + Notifications ("3× more likely to clean up"), "Your media stays… solely on your iPhone". Then the system photo prompt.
5. **Library reveal using the user's own photos:** a huge coloured year (2018, 2019, 2021, 2024…) with that year's photos flashing, a per-year bar chart with the current year highlighted, and the total (15,120). Skip is available. This is the "wow" moment.
6. "15,125 pics are ready to…" + Get started, with the App Store **rating prompt** shown before any use.
7. Paywall in three steps, each saying "No payment due now · 3 days free, then $7.99/week": (a) "We want you to try PicNic for FREE" with an animated phone demo; (b) "Set a reminder before your free trial ends" (bell; asks for notifications); (c) "Start your 3-day FREE trial to continue": a Today / In 2 days (reminder) / In 3 days (charged) timeline, "Try for $0.00".
8. Home ("Utilities"): streak flame and gift (referral) buttons; On This Day carousel of the last 7 dates with photo counts; Recents (Today 19, Yesterday 2, Last 7 days 108); Utilities (Shuffle, Favorites, Screenshots marked SUPER); three-tab bar.

**SwipeWipe onboarding teardown** (owner's iPhone screenshots, Nov 2026), in order:
1. Splash (logo, publisher).
2. Auto-advancing social proof, no buttons: "120+ App of the day", "4.7 ★ 1.5M+ ratings", "200M+ happy users", one quoted testimonial over a blurred photo, then the tagline "Declutter your Camera Roll with a Swipe".
3. Welcome: collage of stock photos, 4.7 laurels, "#1 Photo & Storage Cleaner", Get Started.
4. Three-screen feature story, each with Continue: "Cleanup your Camera Roll" (month by month) → "Swipe through your photos…" (right keep / left delete, KEEP stamp on a photo) → "…and enjoy the free space" ("400MB saved").
5. Permission primer: Photo Library + Notifications ("users with reminders are 5× more likely to clean up"), "Your media stays… solely on your iPhone". Continue fires the notification prompt, then the photo prompt.
6. Quiz intro: "What are your needs? 4 questions to set up the app for you", over a phone mock-up of the review screen.
7. Quiz with progress bar, Back and SKIP: gender, age group, "What do you want to clean first?" (multi-select photo grid: Screenshots, Duplicates, Old photos, Videos, Random, Albums), "What is your goal?" (multi-select: More space, Delete junk, See my best shots, Declutter, Save storage, See memories).
8. "Personalizing your interface…" progress bar while the user's **own photos** fan over the earlier screens. This is the most personal moment.
9. "Swipewipe was made for people like you": avatars, "200M Users' Choice", two 5-star testimonials.
10. Trial paywall: "We want you to try Swipewipe for free", animated phone demo (swipe → "success. 42 images deleted, 2.14 GB saved"), "No payment due now", "Try for $0.00", "3 days free, then $9.99/week". No visible close in the screenshots.

Current state found: a new user lands directly on Home ("There's a story in there." + Allow photo access). The two-step welcome screen is only reached from the hidden classic Swipe/Smart screens, and its copy teaches the old model ("Swipe right to keep. Swipe left to set aside").

### 3. Home

- **Unfinished adventures:** never ask. Pictopia decides whether to resume or offer something new; users should trust that its suggestion is the best next step.
- **No notifications exist yet; they are required** (see area 2).
- **Home leads with "Pictopia's pick for you":** one large recommended adventure with a one-line reason why and a Start button, plus one quiet "or try …" alternative. Rationale: a strong default avoids choice overload (Hick's law, defaults), the lighter alternative preserves autonomy and avoids single-option aversion, and explained recommendations build trust over time. The two equal postcards with "or" and the shuffle button are removed.
- **Keep library progress on Home** (owner pushback on an over-streamlined Home; progress is part of the promise).
- **No separate "Continue" card**: it can be confusing and neither leader has one. Resuming happens through Pictopia's pick; unfinished items show their progress where they live.
- **"For the Journey…" becomes "Did you know?"**: instructional and motivational tips.
- **Reason-line tone is a mix:** a warm headline that also says something meaningful and concrete (a real number or fact), never warmth alone.
- **Years and months need a prominent place** (Picnic gives them a whole tab; SwipeWipe's home is month folders). Pictopia already has a Months & Years screen with per-month progress, but it is buried behind "See all" in Explore.
- Observation: The Yearbook (a year in 18-photo segments), Months & Years (a whole month, "% explored") and Time Capsule (a random month) are three overlapping ways to review the same dates, each counted differently. This is a likely source of confusing counts.
- **Example of Continue confusion (owner screenshot):** Home showed "Resume your review · Surprise Me · Next segment" above a new "Surprise Me" postcard (or Hidden Corners). It isn't clear what is being resumed vs what is new. Also visible: "Next segment" is internal jargon; **Hidden Corners appears on Home although it is meant to be developer-Lab only** (Home's candidate planner still includes it); four competing start actions (resume, two postcards, shuffle).
- **Avoid "Library" as a tab or section name:** Apple Photos and Google Photos already use it for the photo collection itself. ("of your library" in progress copy refers to that same collection and is fine.)
- **Tabs: Home | Timeline | Explore | Progress.** Timeline holds years → months with progress (Picnic/SwipeWipe-style calendar backbone for big libraries).
- **Final Home, top to bottom:** streak + Settings; library progress bar ("68% of your library reviewed"); Pictopia's pick with a reason line and Start, plus one "or try …"; Discarded link when something is waiting ("19 to delete · 42 MB"); Did you know? tip.

### 4. Explore and Timeline

- **Free vs Pictopia+ (in progress).** The daily limit, not locked adventures, is the main free-tier gate, so free users can't simply keep tapping adventures forever.
- **Timeline is free for everyone** (as in Picnic and SwipeWipe); the daily limit is what limits it.
- **Pictopia+ (agreed):** unlimited daily reviewing; cleanups (Screenshots, Largest videos, later Duplicates); Videos; Albums; past On This Day dates. Free users see cleanup sizes ("312 screenshots · 1.2 GB") to show the value.
- **Free taste of cleanups (agreed):** one free Screenshot round (~18) before asking to upgrade.
- **Ads: owner is open to video ads** instead of, or in addition to, the free daily amount, but rejects SwipeWipe's forceful style (ads that are hard to close and push to the App Store). Recommended shape: opt-in rewarded videos only ("Watch a short video for 25 more today"), never forced mid-review. Trade-offs: an ad SDK needs Apple's tracking prompt or non-personalised ads, EU consent and changed privacy labels, which strains the "private, no account" positioning.
- **Ads decision: none at launch.** Launch with the trial, 100/day and streak bonuses; consider opt-in rewarded videos on the limit page in a later update if data shows free users leaving at the limit.
- **An adventure is simply the set Pictopia gives you. No rounds or segments.** Progress is one number for that set ("100% reviewed"), as in SwipeWipe and Picnic. Natural sets run whole: On This Day is every photo from that date (3 or 87); a Timeline month is the whole month; Recents, Screenshots, Videos and Albums are their whole sets. Only made-up mixes (Surprise Me) use a fixed size, now **20** (the old 18 was never an owner decision). The free daily limit can pause a large set; progress is kept and the pick offers to finish it.
- **Big piles are served in bite-sized sets.** Screenshots (often hundreds or thousands) must feel finishable, so each Screenshot Sweep is a subset; the same applies to other large piles such as videos. Each sweep is its own adventure at 100% when done; the pile itself shows a plain fact ("1,240 screenshots · 1.2 GB"), not a rounds counter. Sizes vary by type (agreed): Screenshots 50; Videos and Largest Videos 20; Albums run whole when small, otherwise 50.
- **Quick bursts merge only in Surprise Me** (the best shot of a burst within 90 s); everywhere else every photo is shown so counts match what you scroll.
- **Adventure set agreed.** Free: On This Day (today), Surprise Me (20), Recents, Timeline months. Plus: past On This Day dates, Screenshot Sweep (one free sweep), Largest Videos, Duplicate Hunt (hidden until ready), Videos, Albums. Retired: The Yearbook, Time Capsule, classic Swipe and Smart Clean; Hidden Corners stays Lab-only and leaves Home.
- **Favorites added** (free): photos already marked as favourites in Photos, for rediscovery.
- **Explore order (agreed):** On This Day; Recents; Surprise Me; Favorites; Cleanups ＋ (Screenshot Sweep with the first sweep free, Largest Videos); Videos ＋; Albums ＋. Tapping a ＋ item as a free user opens the trial offer.
- **Pit Stops move to Progress** as a "Take a break" reward.
- **Trust rule (proposed):** Pictopia's pick never recommends something the user can't open; the "or try …" link may occasionally show a Plus adventure with a ＋ badge.

### 5. The review screen

- **"Reviewed" = scrolled onto the screen**, however briefly, like social media. Anything else produces "Reviewed 17, discarded 2" after passing 20 photos and confuses people. Photos can be reviewed again later. Kept = reviewed − discarded.
- **Every review shows "23 of 45" at the top** (today not every review scenario does). The count includes discarded photos so numbers never jump. "% explored" is removed from this screen.
- **Trash icon shows the running size** (MB/GB) with a small animation and a "+2.4 MB" pop for each discarded photo; tapping it lists this adventure's discards.
- **Swipe either direction to discard** (unchanged). **Bottom bar keeps Undo, Favourite and Share.**
- **Discarded photos stay in the feed, faded, with a "Discarded" label and Restore,** so scrolling back never makes counts skip. The label and Restore must already be in place as the photo scrolls into view (an earlier version took a second or two to show them). **The swipe-to-trash flight must not change at all;** it feels right. (History: faded slots were removed when the 1.0.21 motion was restored; they must return without touching that motion.)
- **Completion:** "100% reviewed · 40 kept · 5 discarded (12 MB)", "Delete 5 now" (this adventure only), then Pictopia's next pick. There must be a way back to the photos instead of deleting.
- **Reopening a finished adventure** (e.g. On This Day) must let the user see the whole set and change their choices, as the leaders do. Today it returns straight to the final screen with no way to adjust, which is wrong.

- **No new review screen. One feed, one Discarded screen (agreed).** The existing deletion list becomes **Discarded** with two scopes: everything waiting (from Progress/Home) or only this adventure's discards (from its completion screen). Same actions in both: tap to restore, long-press to view, "Delete N".
- **Completion shows a small fanned stack of this adventure's discarded photos;** tapping it opens Discarded scoped to this adventure. Also "Delete N now", "Back to photos" and Pictopia's next pick.
- **Reopening a finished adventure reopens the feed from the top** with discarded photos faded and Restore ready; reaching the end shows completion again.

Previous state: vertical scrolling feed; swiping a photo sideways in either direction discards it, and it flies into a trash icon in the header; header shows "12 of 18" (collections: "34% explored") plus the trash count; footer has Undo, Restore, Favourite, Share; a two-step coach (browse, discard); an end card, then a completion screen.

### 6. Deleting

- **Delete everything in one go** (agreed): no 100-photo cap; one approval on iPhone, automatic batching on Android if needed.
- **After deleting, celebrate plus one honest line** (agreed): "🎉 58 MB cleared · 34 photos moved to Recently Deleted. Empty it in Photos to free the space now." Progress's "cleared" total counts at this moment.
- **One gentle reminder** (agreed) when discards wait for about 3 days: "34 photos (58 MB) are waiting in Discarded".

Previous state: "Ready to delete" list (tap to keep, long-press to view); "Delete N photos" sends at most 100 per request to the OS; the OS shows its own confirmation; a Result screen reports confirmed deletions with estimated sizes (iOS: moved to Recently Deleted). Cancel or failure keeps everything with "Nothing was deleted".

### 7. Numbers and progress

- **The counts the owner meant:** "N of M" disagreeing between an adventure's card (e.g. Home's resume ticket "2 of 18") and the review screen once opened ("5 of 18"). Likely cause: Home computes the position in the saved list, which includes discarded photos, while the feed has removed discarded photos from what it shows, so the two count differently (to be confirmed when fixing). Rule: "N of M" means the same position everywhere, counted over the whole set including discarded photos, and the card always shows the place the review will open at.
- **"% reviewed" includes photos and videos together** (agreed); no separate video progress.
- **Progress tab (agreed):** three headline numbers (🔥 day streak · % reviewed · GB cleared, with the photo count as a small line), then Discarded, streak calendar with Restore Streak, badges, Take a break (Pit Stops). Removed: "explored all-time", "months fully explored" (Timeline shows month rings), the separate video line, and the extra numbers in Settings "Your journey", Insights and Statistics.
- **Streak bonus = milestone gift for that day only (agreed).** The daily limit stays 100; reaching a milestone adds a one-day bonus with a small celebration, then the next day is back to 100. Unused items never carry over. Proposed amounts: day 3 +20, day 7 +40, day 14 +60, then every 7 days +60.
- **Badges: about six families, each with levels** (levelling up is fun), matched to the new app. Proposed: Explorer (reviewed), Declutterer (space cleared), Streak Keeper, Month Finisher, Screenshot Slayer, Time Traveller (On This Day completed); alternatives Video Wrangler, Memory Keeper. Awaiting confirmation.

### 8. Pictopia+ and the paywall

- **Plans: weekly + yearly, following the leaders** (replaces monthly + yearly). The 7-day trial leads into the weekly plan, with yearly shown as a per-week price. Needs a new weekly subscription in App Store Connect and Google Play (internal ID naming stays `pictopia.pro.*`). Prices: owner to set.
- Trial offer appears at the end of onboarding, at the daily limit, on ＋ features and in Settings (no objection raised).

### 9. Settings and hidden extras

- **Settings (proposed, no objection):** Pictopia+ (status, manage, restore); Reminders (new: daily streak, On This Day, Discarded waiting, each with an on/off switch, plus one time, default 7 pm); Theme (10 pastels, preview updated to the new Home); Photos & feel (photo access, Live Photos/videos playback, haptics); Help (tips, support, privacy, terms). Developer Lab stays hidden.
- **Removed:** classic Swipe, Smart Clean, the old set-aside list, Insights, Statistics and the compare screen (keep-or-delete era leftovers).
- **Dark mode deferred** past 1.0 (light only; dark colours kept).

### Illustration style and Home look

- **Art style: "Storybook landscape"** (mockup canvas `illustration-style`, option F): flat, layered scenes with hills, sun, sky, a dashed trail and small props, no outlines, warm sky backgrounds. It replaces the current shape-on-dots illustrations everywhere (adventure covers, badges, empty states, onboarding).
- **Home keeps the previous Playful look** the owner prefers: tilted sticker cards for streak and progress, "Where to today?", two tilted postcards with the tomato "or". The left postcard is larger and carries a "Pictopia's pick" ribbon; the right one is the alternative (this refines the earlier one-card proposal). The shuffle button stays removed. "Did you know?" tip and the Discarded pill follow.
