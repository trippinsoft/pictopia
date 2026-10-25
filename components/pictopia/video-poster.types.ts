export interface VideoPosterProps {
  uri: string;
  fit: "cover" | "contain";
  onReady?: () => void;
}
