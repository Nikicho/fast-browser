import { describe, expect, it, vi } from "vitest";

import { registerCaseCommands } from "../../../src/cli/commands/case";
import { createProgram } from "../../../src/cli/parser";

describe("case CLI commands", () => {
  it("saves a case definition from file", async () => {
    const router = {
      caseSave: vi.fn(async () => ({ ok: true, site: "demo", caseId: "search-repo" }))
    } as any;
    const program = createProgram().exitOverride();
    registerCaseCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "case", "save", "--site", "demo", "--file", "fixtures/demo.case.json"]);

    expect(router.caseSave).toHaveBeenCalledWith("demo", "fixtures/demo.case.json");
  });

  it("saves a case draft from a flow reference", async () => {
    const router = {
      caseSaveFromFlow: vi.fn(async () => ({ ok: true, site: "demo", caseId: "search-repo" }))
    } as any;
    const program = createProgram().exitOverride();
    registerCaseCommands(program, { router });

    await program.parseAsync([
      "node", "fast-browser", "case", "save",
      "--site", "demo",
      "--id", "search-repo",
      "--goal", "Verify search route",
      "--flow", "search-open",
      "--url-includes", "/search",
      "--text-includes", "Results",
      "--selector-visible", ".result-list",
      "--title-not-empty"
    ]);

    expect(router.caseSaveFromFlow).toHaveBeenCalledWith("demo", {
      id: "search-repo",
      goal: "Verify search route",
      flowId: "search-open",
      urlIncludes: "/search",
      textIncludes: "Results",
      selectorVisible: ".result-list",
      titleNotEmpty: true
    });
  });

  it("lists cases for a site", async () => {
    const router = {
      caseList: vi.fn(async () => [{ site: "demo", caseId: "search-repo" }])
    } as any;
    const program = createProgram().exitOverride();
    registerCaseCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "case", "list", "demo"]);

    expect(router.caseList).toHaveBeenCalledWith("demo");
  });

  it("runs a case with json input", async () => {
    const router = {
      caseRun: vi.fn(async () => ({ ok: true, caseId: "search-repo", uses: [] }))
    } as any;
    const program = createProgram().exitOverride();
    registerCaseCommands(program, { router });

    await program.parseAsync(["node", "fast-browser", "case", "run", "demo/search-repo", "--input", '{"query":"fast-browser"}']);

    expect(router.caseRun).toHaveBeenCalledWith("demo/search-repo", { query: "fast-browser" });
  });

  it("rejects invalid json input for case run", async () => {
    const router = {
      caseRun: vi.fn(async () => ({ ok: true, caseId: "search-repo", uses: [] }))
    } as any;
    const program = createProgram().exitOverride();
    registerCaseCommands(program, { router });

    await expect(program.parseAsync(["node", "fast-browser", "case", "run", "demo/search-repo", "--input", "[]"]))
      .rejects.toThrow(/json input/i);
    expect(router.caseRun).not.toHaveBeenCalled();
  });

  it("runs a case with flag input and merges it over json input", async () => {
    const router = {
      caseRun: vi.fn(async () => ({ ok: true, caseId: "search-repo", uses: [] }))
    } as any;
    const program = createProgram().exitOverride();
    registerCaseCommands(program, { router });

    await program.parseAsync([
      "node", "fast-browser", "case", "run", "demo/search-repo",
      "--input", '{"query":"seed","page":1}',
      "--query", "override",
      "--page", "2"
    ]);

    expect(router.caseRun).toHaveBeenCalledWith("demo/search-repo", { query: "override", page: 2 });
  });
});
