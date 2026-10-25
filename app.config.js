module.exports = {
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#ddefe7"
    },
    package: process.env.FLICKWELL_ANDROID_PACKAGE || "com.flickwell.app",
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
    bundleIdentifier: process.env.FLICKWELL_IOS_BUNDLE_ID || "com.flickwell.app",
    buildNumber: "1",
    infoPlist: { ITSAppUsesNonExemptEncryption: false }
  },
  name: "FlickWell",
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
    "FlickWell reads photos and videos you choose so you can review and safely clean your library. Your media stays on your device.",
    savePhotosPermission:
    "FlickWell requests your authorization to delete only the photos and videos you explicitly confirm.",
    granularPermissions: ["photo", "video"]
  }],


  "expo-sqlite",
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




  scheme: "flickwell",
  slug: "flickwell",
  userInterfaceStyle: "automatic",
  version: "1.0.0",
  web: { bundler: "metro", output: "single", favicon: "./assets/images/favicon.png" },
  platforms: ["ios", "android", "web"]
};
