import { requireOptionalNativeModule } from "expo-modules-core";
import { Analyzer } from "./analysis.types";
import { mediaService } from "./media";
import { Analysis } from "@/lib/pictopia/types";
const module = requireOptionalNativeModule<{
  cancel(): void;
  canScan(): Promise<boolean>;
  analyze(id: string, uri: string, isVideo: boolean): Promise<Omit<Analysis, "version">>;
}>("PictopiaAnalysis");
export const analyzer: Analyzer = {
  available: !!module,
  cancel() {
    module?.cancel();
  },
  async canScan() {
    return module ? module.canScan() : false;
  },
  async analyze(m) {
    if (!module)
      throw Error("Local analysis requires a native build with Pictopia’s analysis module.");
    const resolved = await mediaService.resolve(m);
    return module.analyze(m.id, resolved.uri, m.type === "video");
  },
};
