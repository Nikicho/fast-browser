import { describe, expect, it } from "vitest";

import { applyGlobalSessionIdArg, parseJsonInput, parseSiteTarget, parseValue } from "../../../src/cli/parser";

describe("cli parser helpers", () => {
  it("parses site targets", () => {
    expect(parseSiteTarget("github/search")).toEqual({
      adapterId: "github",
      commandName: "search"
    });
  });

  it("coerces primitive option values", () => {
    expect(parseValue("true")).toBe(true);
    expect(parseValue("42")).toBe(42);
    expect(parseValue("text")).toBe("text");
  });

  it("extracts a global --session-id flag before commander parsing", () => {
    const env: NodeJS.ProcessEnv = {};
    expect(applyGlobalSessionIdArg(["node", "fast-browser", "--session-id", "task-zhihu-1", "list"], env)).toEqual([
      "node",
      "fast-browser",
      "list"
    ]);
    expect(env.FAST_BROWSER_SESSION_ID).toBe("task-zhihu-1");
  });

  it("extracts a global --session-id=value flag before commander parsing", () => {
    const env: NodeJS.ProcessEnv = {};
    expect(applyGlobalSessionIdArg(["node", "fast-browser", "--session-id=task-bili-2", "list"], env)).toEqual([
      "node",
      "fast-browser",
      "list"
    ]);
    expect(env.FAST_BROWSER_SESSION_ID).toBe("task-bili-2");
  });

  it("parses json input payloads", () => {
    expect(parseJsonInput('{"query":"fast-browser","page":2}')).toEqual({
      query: "fast-browser",
      page: 2
    });
  });
});
