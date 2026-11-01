import type { ReactNode } from "react";
export interface ZoomChoiceProps {
  children: ReactNode;
  /** A deliberate single tap at the original zoom; pinches, pans and double taps never call it. */
  onSelect(): void;
  onPressChange?(pressed: boolean): void;
}
