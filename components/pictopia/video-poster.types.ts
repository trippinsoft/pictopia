export interface VideoPosterProps {
  uri: string;
  fit: "cover" | "contain";
  onReady?: () => void;
  /** Called when no frame can be shown and the placeholder is final. */
  onFailed?: () => void;
}
