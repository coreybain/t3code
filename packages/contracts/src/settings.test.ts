import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

import { ClientSettingsPatch, ClientSettingsSchema, DEFAULT_CLIENT_SETTINGS } from "./settings.ts";

describe("client settings", () => {
  it("defaults follow-up sends to queue", () => {
    expect(DEFAULT_CLIENT_SETTINGS.followUpSendMode).toBe("queue");
    expect(Schema.decodeSync(ClientSettingsSchema)({}).followUpSendMode).toBe("queue");
  });

  it("accepts follow-up send mode patches", () => {
    expect(Schema.decodeSync(ClientSettingsPatch)({ followUpSendMode: "queue" })).toEqual({
      followUpSendMode: "queue",
    });
    expect(Schema.decodeSync(ClientSettingsPatch)({ followUpSendMode: "steer" })).toEqual({
      followUpSendMode: "steer",
    });
  });
});
