// Only fixed, public screen names may leave the device. Never send a raw URL,
// route parameter, media/library identifier, referral code, or arbitrary props.
const screens: Readonly<Record<string, string>> = {
  "/home": "Home",
  "/explore": "Explore",
  "/progress": "Progress",
  "/settings": "Settings",
  "/onboarding": "Onboarding",
  "/library": "Months and Years",
  "/albums": "Albums",
  "/collection-review": "Collection Review",
  "/vertical-explore": "Adventure Review",
  "/time-machine": "Yearbook",
  "/on-this-day": "On This Day",
  "/pit-stops": "Pit Stops",
  "/pit-stop": "Pit Stop Game",
  "/memory-wall": "The Big Picture",
  "/memory-wall-year": "The Big Picture Year",
  "/duplicate-hunt": "Duplicate Hunt",
  "/duplicate-group": "Duplicate Group",
  "/paywall": "Pictopia Plus",
  "/referrals": "Invite a Friend",
  "/queue": "Discarded",
  "/preview": "Media Preview",
  "/set-aside": "Set Aside",
  "/session-review": "Session Review",
  "/swipe": "Classic Review",
  "/smart": "Smart Clean",
  "/timeline": "Timeline",
  "/statistics": "Statistics",
  "/help": "Help",
  "/legal": "Legal",
  "/compare": "Compare",
};

export function analyticsScreen(path: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(screens, path) ? screens[path] : undefined;
}

export type AnalyticsEvent = "app_opened" | "app_foregrounded" | "screen_viewed" | import("./subscription-analytics").SubscriptionEvent | import("./onboarding-analytics").OnboardingEvent;
