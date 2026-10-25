export interface SystemAppearanceService {
  sync(background: string, dark: boolean): Promise<void>;
}
