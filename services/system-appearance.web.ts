import { SystemAppearanceService } from "./system-appearance.types";
// Browser surfaces are synchronized by RootContent and the appearance polyfill.
export const systemAppearanceService: SystemAppearanceService = {
  async sync() {},
};
