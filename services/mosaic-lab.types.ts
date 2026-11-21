import type { ComponentType } from "react";
import type { NativeSyntheticEvent, ViewProps } from "react-native";
import type { MosaicPhoto } from "@/lib/pictopia/mosaic-match";

export interface MosaicRender {
  natural: string;
  adjusted: string;
  missing: number;
  renderMs: number;
  peakBytes: number;
}

export interface MosaicNativeService {
  mosaicStart(token: string, limit: number): Promise<{
    available: number;
    selected: number;
    limited: boolean;
    startBytes: number;
    peakBytes: number;
  }>;
  mosaicScan(token: string): Promise<{
    photos: MosaicPhoto[];
    hits: number;
    processed: number;
    peakBytes: number;
  }>;
  mosaicRender(token: string, scene: number, ids: string[], targets: number[], columns: number): Promise<MosaicRender>;
  mosaicInspect(token: string, id: string): Promise<string>;
  mosaicClear(token: string): void;
}

export type MosaicViewportComponent = ComponentType<ViewProps & {
  imageUri: string;
  onTile: (event: NativeSyntheticEvent<{ x: number; y: number }>) => void;
}>;
