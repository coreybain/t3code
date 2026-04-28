import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { ProjectListEntriesInput } from "./project.ts";

const decodeProjectListEntriesInput = Schema.decodeUnknownSync(ProjectListEntriesInput);

describe("ProjectListEntriesInput", () => {
  it("decodes a valid workspace listing request", () => {
    const parsed = decodeProjectListEntriesInput({
      cwd: "/repo",
      limit: 25_000,
    });

    expect(parsed).toEqual({
      cwd: "/repo",
      limit: 25_000,
    });
  });

  it("rejects empty cwd", () => {
    expect(() =>
      decodeProjectListEntriesInput({
        cwd: "",
        limit: 100,
      }),
    ).toThrow();
  });

  it("rejects limits above the workspace listing cap", () => {
    expect(() =>
      decodeProjectListEntriesInput({
        cwd: "/repo",
        limit: 25_001,
      }),
    ).toThrow();
  });
});
