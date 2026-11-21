import { createInstance } from "@amplitude/analytics-react-native";
import type { AmplitudeClient } from "./amplitude-client.types";

const client = createInstance();

export const amplitudeClient: AmplitudeClient = {
  async initialize(apiKey, region) {
    await client.init(apiKey, undefined, {
      serverZone: region,
      autocapture: false,
      trackingSessionEvents: false,
      attribution: { disabled: true },
      migrateLegacyData: false,
      remoteConfig: { fetchRemoteConfig: false },
      trackingOptions: {
        adid: false,
        appSetId: false,
        idfv: false,
        ipAddress: false,
        country: false,
        carrier: false,
        language: false,
        deviceManufacturer: false,
        deviceModel: false,
      },
    }).promise;
  },
  track(event, properties) {
    void client.track(event, properties).promise.catch(() => {});
  },
  flush() {
    void client.flush().promise.catch(() => {});
  },
};
