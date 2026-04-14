import { describe, expect, it, vi } from "vitest";

import { registerGuideCommand } from "../../../src/cli/commands/guide";
import { createProgram } from "../../../src/cli/parser";

describe("guide CLI command", () => {
  it("passes normalized plan options to the router", async () => {
    const router = {
      guidePlan: vi.fn(async () => ({ platform: "demo", files: [], strategy: { source: "dom" } }))
    } as any;
    const program = createProgram().exitOverride();
    registerGuideCommand(program, { router });

    await program.parseAsync([
      "node", "fast-browser", "guide", "plan",
      "--platform", "demo",
      "--url", "https://example.com",
      "--capability", "Search demo",
      "--strategy", "dom",
      "--command", "search",
      "--ttl-seconds", "60",
      "--no-requires-login",
      "--cacheable",
      "--run-test"
    ]);

    expect(router.guidePlan).toHaveBeenCalledWith({
      platform: "demo",
      url: "https://example.com",
      capability: "Search demo",
      strategy: "dom",
      commandName: "search",
      ttlSeconds: 60,
      requiresLogin: false,
      cacheable: true,
      runTest: true
    });
  });


  it("fills guide plan boolean options with non-interactive defaults", async () => {
    const router = {
      guidePlan: vi.fn(async () => ({ platform: "demo", files: [], strategy: { source: "dom" } }))
    } as any;
    const program = createProgram().exitOverride();
    registerGuideCommand(program, { router });

    await program.parseAsync([
      "node", "fast-browser", "guide", "plan",
      "--platform", "demo",
      "--url", "https://example.com",
      "--capability", "Search demo",
      "--strategy", "auto",
      "--command", "search",
      "--ttl-seconds", "60"
    ]);

    expect(router.guidePlan).toHaveBeenCalledWith({
      platform: "demo",
      url: "https://example.com",
      capability: "Search demo",
      strategy: "auto",
      commandName: "search",
      ttlSeconds: 60,
      requiresLogin: false,
      cacheable: true,
      runTest: false
    });
  });

  it("rejects guide plan when required non-interactive flags are missing instead of prompting", async () => {
    const router = {
      guidePlan: vi.fn()
    } as any;
    const program = createProgram().exitOverride();
    registerGuideCommand(program, { router });

    await expect(program.parseAsync([
      "node", "fast-browser", "guide", "plan",
      "--platform", "demo",
      "--url", "https://example.com",
      "--strategy", "auto",
      "--ttl-seconds", "60"
    ])).rejects.toThrow(/requires non-interactive flags/i);

    expect(router.guidePlan).not.toHaveBeenCalled();
  });

  it("rejects invalid guide strategy values", async () => {
    const router = {
      guidePlan: vi.fn()
    } as any;
    const program = createProgram().exitOverride();
    registerGuideCommand(program, { router });

    await expect(program.parseAsync([
      "node", "fast-browser", "guide", "plan",
      "--platform", "demo",
      "--url", "https://example.com",
      "--capability", "Search demo",
      "--strategy", "manual",
      "--command", "search",
      "--ttl-seconds", "60"
    ])).rejects.toThrow(/strategy/i);
    expect(router.guidePlan).not.toHaveBeenCalled();
  });

  it("rejects non-positive ttl seconds", async () => {
    const router = {
      guideScaffold: vi.fn()
    } as any;
    const program = createProgram().exitOverride();
    registerGuideCommand(program, { router });

    await expect(program.parseAsync([
      "node", "fast-browser", "guide", "scaffold",
      "--platform", "demo",
      "--url", "https://example.com",
      "--capability", "Search demo",
      "--strategy", "auto",
      "--command", "search",
      "--ttl-seconds", "0"
    ])).rejects.toThrow(/ttl/i);
    expect(router.guideScaffold).not.toHaveBeenCalled();
  });
  it("requires url for guide inspect", async () => {
    const router = {
      guideInspect: vi.fn()
    } as any;
    const program = createProgram().exitOverride();
    registerGuideCommand(program, { router });

    await expect(program.parseAsync(["node", "fast-browser", "guide", "inspect"])).rejects.toThrow(/requires --url/i);
    expect(router.guideInspect).not.toHaveBeenCalled();
  });
});

