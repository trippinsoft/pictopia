import type { ComponentProps } from "react";
import { Media } from "@/lib/pictopia/types";
import type { MediaImage } from "./media-image";
import type { ZoomState } from "./zoom-state";
export interface ZoomPhotoProps {
  media: Media;
  onSettled?: (state: import("./media-image").MediaSettled) => void;
  /** Gestures only on the photo being shown (default true). */
  active?: boolean;
  /** Shared zoom (native), so photos stacked together zoom as one. */
  zoom?: ZoomState;
  /** Called when the photo goes from fitted to zoomed in, and back. */
  onZoomChange?: (zoomed: boolean) => void;
  imageProps?: Partial<ComponentProps<typeof MediaImage>>;
}
