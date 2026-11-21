import { Platform } from "react-native";
import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";
import type { MosaicNativeService, MosaicViewportComponent } from "./mosaic-lab.types";

const module = Platform.OS === "ios"
  ? requireOptionalNativeModule<MosaicNativeService>("PictopiaAnalysis")
  : null;
export const mosaicNative = typeof module?.mosaicStart === "function" ? module : undefined;
export const MosaicViewport: MosaicViewportComponent | undefined = mosaicNative
  ? requireNativeViewManager("PictopiaAnalysis", "PictopiaMosaicView")
  : undefined;
