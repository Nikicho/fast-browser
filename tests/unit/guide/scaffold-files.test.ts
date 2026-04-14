import { describe, expect, it } from "vitest";

import { scaffoldFiles } from "../../../src/guide/steps/scaffold-files";
import type { AdapterManifest } from "../../../src/shared/types";

describe("scaffoldFiles", () => {
  it("does not duplicate input binding for zero-arg network commands", () => {
    const manifest: AdapterManifest = {
      id: "demo",
      displayName: "demo",
      version: "0.1.0",
      platform: "demo",
      description: "Fetch dashboard status",
      homepage: "https://example.com/dashboard",
      commands: [
        {
          name: "status",
          description: "Fetch dashboard status",
          args: [],
          example: "fast-browser site demo/status"
        }
      ]
    };

    const files = scaffoldFiles(manifest, "status", "https://example.com/api/status", [], {
      finalUrl: "https://example.com/dashboard",
      homepageTitle: "Dashboard",
      suggestedEndpoints: ["https://example.com/api/status"],
      resourceUrls: [],
      interactiveSelectors: [],
      formSelectors: [],
      notes: [],
      pageKind: "generic",
      suggestedCommandName: "page",
      suggestedArgs: []
    });

    const commandSource = files["src/adapters/demo/commands/status.ts"];
    const matches = commandSource.match(/const input = params;/g) ?? [];

    expect(matches).toHaveLength(1);
  });
});