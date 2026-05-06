import { describe, expect, it } from "vitest";

import {
  encodeFileSidePanelTabId,
  parseDiffRouteSearch,
  resolveNextSidePanelTab,
} from "./diffRouteSearch";

describe("parseDiffRouteSearch", () => {
  it("parses valid diff search values", () => {
    const parsed = parseDiffRouteSearch({
      diff: "1",
      diffTurnId: "turn-1",
      diffFilePath: "src/app.ts",
    });

    expect(parsed).toMatchObject({
      sidePanel: "1",
      sidePanelTab: "review",
      sidePanelTabs: "review",
      diff: "1",
      diffTurnId: "turn-1",
      diffFilePath: "src/app.ts",
    });
  });

  it("treats numeric and boolean diff toggles as open", () => {
    expect(
      parseDiffRouteSearch({
        diff: 1,
        diffTurnId: "turn-1",
      }),
    ).toMatchObject({
      sidePanel: "1",
      sidePanelTab: "review",
      sidePanelTabs: "review",
      diff: "1",
      diffTurnId: "turn-1",
    });

    expect(
      parseDiffRouteSearch({
        diff: true,
        diffTurnId: "turn-1",
      }),
    ).toMatchObject({
      sidePanel: "1",
      sidePanelTab: "review",
      sidePanelTabs: "review",
      diff: "1",
      diffTurnId: "turn-1",
    });
  });

  it("drops turn and file values when diff is closed", () => {
    const parsed = parseDiffRouteSearch({
      diff: "0",
      diffTurnId: "turn-1",
      diffFilePath: "src/app.ts",
    });

    expect(parsed).toEqual({});
  });

  it("preserves file value when turn is not selected", () => {
    const parsed = parseDiffRouteSearch({
      diff: "1",
      diffFilePath: "src/app.ts",
    });

    expect(parsed).toMatchObject({
      sidePanel: "1",
      sidePanelTab: "review",
      sidePanelTabs: "review",
      diff: "1",
      diffFilePath: "src/app.ts",
    });
  });

  it("parses side panel summary state", () => {
    const parsed = parseDiffRouteSearch({
      sidePanel: "1",
      sidePanelTab: "summary",
    });

    expect(parsed).toEqual({
      sidePanel: "1",
      sidePanelTab: "summary",
    });
  });

  it("parses side panel expanded state only while the panel is open", () => {
    expect(
      parseDiffRouteSearch({
        sidePanel: "1",
        sidePanelExpanded: "1",
        sidePanelTab: "summary",
      }),
    ).toEqual({
      sidePanel: "1",
      sidePanelExpanded: "1",
      sidePanelTab: "summary",
    });

    expect(
      parseDiffRouteSearch({
        sidePanelExpanded: "1",
      }),
    ).toEqual({});
  });

  it("encodes and parses file tabs", () => {
    const fileTab = encodeFileSidePanelTabId("src/app.tsx");
    const parsed = parseDiffRouteSearch({
      sidePanel: "1",
      sidePanelTab: fileTab,
      sidePanelTabs: fileTab,
    });

    expect(parsed).toEqual({
      sidePanel: "1",
      sidePanelTab: fileTab,
      sidePanelTabs: fileTab,
    });
  });

  it("resolves the next active tab when closing the active tab", () => {
    expect(
      resolveNextSidePanelTab({
        closingTabId: "review",
        activeTabId: "review",
        tabIds: ["summary", "review", "browser"],
      }),
    ).toBe("browser");

    expect(
      resolveNextSidePanelTab({
        closingTabId: "browser",
        activeTabId: "browser",
        tabIds: ["summary", "browser"],
      }),
    ).toBe("summary");
  });

  it("parses file tree search values", () => {
    const parsed = parseDiffRouteSearch({
      fileTree: "1",
    });

    expect(parsed).toEqual({
      fileTree: "1",
    });
  });

  it("preserves diff and file tree when both are open", () => {
    const parsed = parseDiffRouteSearch({
      diff: "1",
      fileTree: "1",
      diffFilePath: "src/app.ts",
    });

    expect(parsed).toMatchObject({
      sidePanel: "1",
      sidePanelTab: "review",
      sidePanelTabs: "review",
      diff: "1",
      fileTree: "1",
      diffFilePath: "src/app.ts",
    });
  });

  it("normalizes whitespace-only values", () => {
    const parsed = parseDiffRouteSearch({
      diff: "1",
      diffTurnId: "  ",
      diffFilePath: "  ",
    });

    expect(parsed).toMatchObject({
      sidePanel: "1",
      sidePanelTab: "review",
      sidePanelTabs: "review",
      diff: "1",
    });
  });
});
