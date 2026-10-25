import { Media, Analysis } from "@/lib/flickwell/types";
export interface Analyzer {
  available: boolean;
  cancel?: () => void;
  canScan?: () => Promise<boolean>;
  analyze(m: Media): Promise<Omit<Analysis, "version">>;
}
