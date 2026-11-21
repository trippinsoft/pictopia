import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Page, Text } from "@/components/pictopia/ui";
const privacy = [
  [
    "Your photos stay local",
    "Pictopia reads media you authorize to help you review and organize it. Photos and videos are not uploaded for analysis. No account is required.",
  ],
  [
    "Local information",
    "Media references, review decisions, scan results, preferences, and session progress are stored on your device. In the browser, files you select are stored in local browser storage so you can resume. Clearing browser data removes that local copy and progress, never the original file.",
  ],
  [
    "Purchases",
    "Native purchases are processed by Apple or Google through their store services. Pictopia checks subscription status with the store and saves access information locally. When enabled, Pictopia+ for Life verification sends store purchase evidence to Pictopia’s existing verification service. Photos and videos are not sent for purchase verification.",
  ],
  [
    "Your control",
    "You may limit or revoke photo access in system settings. Decisions and analysis caches can be reset in Pictopia. Original media is deleted only after your explicit confirmation and an authorized native deletion request.",
  ],
  [
    "Product analytics",
    "When configured, Pictopia uses Amplitude to understand app opens, returns to the app, and visits to named screens. Events include a random installation identifier, timestamps, platform and basic browser or operating-system information. Photos, videos, media identifiers, filenames, library dates, referral codes and screen parameters are not sent. Advertising identifiers, IP-based location enrichment, automatic interaction capture and session replay are disabled. No account or advertising SDK is added. See amplitude.com/privacy. The development preview is hosted by Draftbit and subject to its own platform policies.",
  ],
  [
    "Publisher details required",
    "This policy is a release draft. The publisher’s legal name, address, privacy contact, effective date, and public policy URL must be supplied before distribution.",
  ],
];
const terms = [
  [
    "Using Pictopia",
    "Pictopia helps you review your personal photo and video library. You retain ownership of your media and responsibility for your choices. Keep backups of important memories.",
  ],
  [
    "Deletion and suggestions",
    "Marking an item does not delete it. Native deletion requires confirmation and system authorization. Recently Deleted or Trash may retain deleted media. Analysis and best-shot recommendations are fallible suggestions and should always be reviewed.",
  ],
  [
    "Free and Pictopia+",
    "Manual review is available without a subscription. Pictopia+ unlocks local analysis and additional tools while an active store entitlement is present. An expired subscription does not erase your cleanup history.",
  ],
  [
    "Billing",
    "Prices and billing periods are shown by the store before purchase. Weekly, monthly and annual subscriptions renew automatically unless cancelled according to the store’s terms. Manage subscriptions through your store account. Refunds are handled under applicable store rules and law.",
  ],
  [
    "Availability",
    "Device capabilities, permissions, cloud availability, and store services may affect features. The browser preview cannot access your full photo library or delete original device files.",
  ],
  [
    "Publisher details required",
    "These terms are a release draft requiring publisher identity, jurisdiction, support contact, public terms URL, and legal review before release. Applicable consumer rights are not excluded.",
  ],
];
export default function Legal() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const isPrivacy = page === "privacy";
  return (
    <Page
      title={isPrivacy ? "Privacy policy" : "Terms of service"}
      subtitle="Release draft • Publisher details pending"
      fallback="/settings"
    >
      <View className="mx-auto max-w-2xl gap-7">
        {(isPrivacy ? privacy : terms).map(([title, body]) => (
          <View key={title}>
            <Text className="mb-3 text-h3 text-foreground">{title}</Text>
            <Text className="text-body leading-7 text-muted-foreground">{body}</Text>
          </View>
        ))}
      </View>
    </Page>
  );
}
