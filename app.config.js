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
    "Pictopia shows the photos and videos you allow it to access so you can review them, and deletes only the items you confirm. Your media stays on your device.",
    savePhotosPermission: "Pictopia never saves or adds photos or videos to your library.",
    granularPermissions: ["photo", "video"]
  }],


  "expo-sqlite",
  "expo-system-ui",
  ["expo-navigation-bar", { enforceContrast: false }],
  [
  "expo-splash-screen",
  {
    image: "./assets/images/splash.png",
    imageWidth: 160,
    resizeMode: "contain",
    backgroundColor: "#f9fbfa",
    dark: { backgroundColor: "#101820" }
  }],


  [
  "expo-router",
  {


  }]],





  scheme: "pictopia",
  slug: "pictopia",
  userInterfaceStyle: "automatic",
  version: "1.0.0",
  web: { bundler: "metro", output: "single", favicon: "./assets/images/favicon.png" },
  platforms: ["ios", "android", "web"]
};
