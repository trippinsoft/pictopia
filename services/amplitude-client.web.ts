import { createInstance } from "@amplitude/analytics-browser";
import type { AmplitudeClient } from "./amplitude-client.types";

const client = createInstance();

export const amplitudeClient: AmplitudeClient = {
  async initialize(apiKey, region) {
    await client.init(apiKey, undefined, {
      serverZone: region,
      autocapture: false,
      remoteConfig: { fetchRemoteConfig: false },
      enableDiagnostics: false,
      identityStorage: "localStorage",
      trackingOptions: { ipAddress: false, language: false },
    }).promise;
  },
  track(event, properties) {
    void client.track(event, properties).promise.catch(() => {});
  },
  flush() {
    void client.flush().promise.catch(() => {});
  },
};
