import { describe, it, expect } from "vitest";
import { BrainCfg, PositronicCfg } from "./config.js";
describe("config zod", () => {
    it("parses balanced lexical", () => {
        const cfg = PositronicCfg.parse({ brains: { kairos: { profile: "balanced", embed: "lexical" } } });
        expect(cfg.brains.kairos.profile).toBe("balanced");
        expect(cfg.engram_tag).toBe("v0.2.0");
    });
    it("rejects invalid profile", () => {
        expect(() => BrainCfg.parse({ profile: "nonexistent", embed: "lexical" })).toThrow();
    });
});
