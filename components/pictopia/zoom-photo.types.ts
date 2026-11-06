import { Media } from "@/lib/pictopia/types";
export interface ZoomPhotoProps {
  media: Media;
  onSettled?: (state: import("./media-image").MediaSettled) => void;
}
