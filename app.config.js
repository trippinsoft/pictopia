const splashImage = "./assets/images/splash.png";
const androidSplashImage = "./assets/images/splash-android.png";
const launchBackground = "#FFFFFF";

module.exports = {
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: launchBackground
    },
    package: "com.trippinsoft.pictopia",
    versionCode: 1,
    blockedPermissions: [
    "android.permission.RECORD_AUDIO",
    "android.permission.CAMERA",
    "android.permission.READ_MEDIA_AUDIO"]

  },
  assetBundlePatterns: ["**/*"],
  experiments: { typedRoutes: true, tsconfigPaths: true },
  icon: "./assets/images/icon.png",
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.trippinsoft.pictopia",
    buildNumber: "1",
    infoPlist: { ITSAppUsesNonExemptEncryption: false }
  },
  name: "Pictopia",
  orientation: "default",
  plugins: [
  ["expo-dev-client", { launchMode: "most-recent" }],
  "expo-font",
  "expo-asset",
  "expo-video",
  "expo-web-browser",
  "expo-image",
  [
  "expo-media-library",
  {
    photosPermission:
    "Pictopia accesses the photos and videos you choose so you can browse, update favorites and share selected items. Deletion happens only for items you explicitly confirm.",
    savePhotosPermission: "Pictopia never saves or adds photos or videos to your library.",
    granularPermissions: ["photo", "video"]
  }],


  "expo-sqlite",
  "expo-secure-store",
  "expo-iap",
  // Local reminders only: no push server, so no remote-notification capability.
  [
  "expo-notifications",
  {
    icon: "./assets/images/notification-icon.png",
    color: "#1C2457",
    enableBackgroundRemoteNotifications: false
  }],


  "expo-system-ui",
  ["expo-navigation-bar", { enforceContrast: false }],
  [
  "expo-splash-screen",
  {
    resizeMode: "contain",
    backgroundColor: launchBackground,
    dark: { backgroundColor: launchBackground },
    ios: {
      image: splashImage,
      dark: { image: splashImage },
      enableFullScreenImage_legacy: true
    },
    android: {
      image: androidSplashImage,
      imageWidth: 180,
      dark: { image: androidSplashImage }
    }
  }],


  [
  "expo-router",
  {


  }]],




  scheme: "pictopia",
  slug: "pictopia",
  userInterfaceStyle: "automatic",
  version: "1.0.74",
  web: { bundler: "metro", output: "single", favicon: "./assets/images/favicon.png" },
  platforms: ["ios", "android", "web"]
};
