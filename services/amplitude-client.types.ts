export interface AmplitudeClient {
  initialize(apiKey: string, region: "US" | "EU"): Promise<void>;
  track(event: string, properties: Record<string, string | number | boolean>): void;
  flush(): void;
}
