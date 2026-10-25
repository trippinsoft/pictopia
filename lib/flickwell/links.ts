import { Linking, Platform } from "react-native";
import { router } from "expo-router";
export async function openLegal(page: "privacy" | "terms") {
  const url =
    page === "privacy" ? process.env.EXPO_PUBLIC_PRIVACY_URL : process.env.EXPO_PUBLIC_TERMS_URL;
  if (url) await Linking.openURL(url);
  else router.push({ pathname: "/legal", params: { page } });
}
export async function manageSubscription(url?: string | null) {
  if (url) {
    await Linking.openURL(url);
    return;
  }
  if (Platform.OS === "web")
    throw Error(
      "Manage subscriptions in your App Store or Google Play account. Native Settings opens the appropriate store.",
    );
  await Linking.openURL(
    Platform.OS === "ios"
      ? "https://apps.apple.com/account/subscriptions"
      : "https://play.google.com/store/account/subscriptions",
  );
}
