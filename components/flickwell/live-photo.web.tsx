import { Empty } from "./ui";
import { LivePhotoProps } from "./live-photo.types";
export function LivePhoto(_props: LivePhotoProps) {
  return (
    <Empty
      icon="Image"
      title="View motion on iOS"
      description="Live Photo motion plays in the native iOS app. The still image is available in this preview."
    />
  );
}
