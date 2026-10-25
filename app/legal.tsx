import { View, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Page, Text, Icon } from "@/components/flickwell/ui";
const privacy = [
  [
    "Your photos stay local",
    "FlickWell reads media you authorize to help you review and organize it. Photos and videos are not uploaded for analysis. No account is required.",
  ],
  [
    "Local information",
    "Media references, review decisions, scan results, preferences, and session progress are stored on your device. In the browser, files you select are stored in local browser storage so you can resume. Clearing browser data removes that local copy and progress, never the original file.",
  ],
  [
    "Purchases",
    "Native purchases are processed by Apple or Google and validated through RevenueCat. Store receipts, an anonymous customer identifier, entitlement status, and necessary purchase information may be processed by those services. Photos are not sent to RevenueCat. See revenuecat.com/privacy.",
  ],
  [
    "Your control",
    "You may limit or revoke photo access in system settings. Decisions and analysis caches can be reset in FlickWell. Original media is deleted only after your explicit confirmation and an authorized native deletion request.",
  ],
  [
    "No ads or tracking",
    "FlickWell’s application code adds no advertising SDK, photo-upload service, or behavioral analytics. The development preview is hosted by Draftbit and subject to its own platform policies.",
  ],
  [
    "Publisher details required",
    "This policy is a release draft. The publisher’s legal name, address, privacy contact, effective date, and public policy URL must be supplied before distribution.",
  ],
];
const terms = [
  [
    "Using FlickWell",
    "FlickWell helps you review your personal photo and video library. You retain ownership of your media and responsibility for your choices. Keep backups of important memories.",
  ],
  [
    "Deletion and suggestions",
    "Marking an item does not delete it. Native deletion requires confirmation and system authorization. Recently Deleted or Trash may retain deleted media. Analysis and best-shot recommendations are fallible suggestions and should always be reviewed.",
  ],
  [
    "Free and Pro",
    "Manual review is available without a subscription. Pro unlocks local analysis and additional tools while an active store entitlement is present. An expired subscription does not erase your cleanup history.",
  ],
  [
    "Billing",
    "Prices and billing periods are shown by the store before purchase. Monthly and annual subscriptions renew automatically unless cancelled according to the store’s terms. Lifetime is a one-time, non-consumable unlock of the current Pro entitlement. Manage subscriptions through your store account. Refunds are handled under applicable store rules and law.",
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
    >
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/settings"))}
        className="mb-5 self-start p-3"
      >
        <Icon name="ArrowLeft" className="text-primary" />
      </Pressable>
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
