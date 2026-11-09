module.exports = {
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#ddefe7"
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
    supportsTablet: true,
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
  "expo-iap",
  "expo-system-ui",
  ["expo-navigation-bar", { enforceContrast: false }],
  [
  "expo-splash-screen",
  {
    image: "./assets/images/splash.png",
    imageWidth: 160,
    resizeMode: "contain",
    backgroundColor: "#f8f3e8",
    dark: { backgroundColor: "#10191d" }
  }],


  [
  "expo-router",
  {


  }]],




  scheme: "pictopia",
  slug: "pictopia",
  userInterfaceStyle: "automatic",
  version: "1.0.29",
  web: { bundler: "metro", output: "single", favicon: "./assets/images/favicon.png" },
  platforms: ["ios", "android", "web"]
};
