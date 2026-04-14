import { describe, expect, it, vi } from "vitest";

import { CommandRouter } from "../../../src/core/command-router";

describe("CommandRouter flow hardening", () => {
  it("rejects fill steps that do not target a fillable control", async () => {
    const flowService = {
      saveFlow: vi.fn(async () => ({ ok: true, site: "demo", flowId: "search-open" }))
    };
    const sessionStore = {
      set: vi.fn(async () => undefined),
      get: vi.fn(async () => ({
        status: "success",
        path: ".fast-browser/sessions/events.jsonl",
        at: new Date().toISOString()
      })),
      delete: vi.fn(async () => undefined)
    };
    const traceStore = {
      current: vi.fn(async () => ({
        startMarker: {
          id: "m1",
          at: "2026-04-07T10:00:00.000Z",
          kind: "marker",
          command: "trace.mark",
          input: [{ type: "goal_start", label: "demo" }],
          ok: true,
          durationMs: 0,
          marker: { type: "goal_start", label: "demo" }
        },
        entries: [
          {
            id: "m1",
            at: "2026-04-07T10:00:00.000Z",
            kind: "marker",
            command: "trace.mark",
            input: [{ type: "goal_start", label: "demo" }],
            ok: true,
            durationMs: 0,
            marker: { type: "goal_start", label: "demo" }
          },
          {
            id: "o1",
            at: "2026-04-07T10:00:01.000Z",
            kind: "command",
            command: "open",
            input: ["https://example.com/login"],
            ok: true,
            durationMs: 10,
            output: { ok: true, url: "https://example.com/login", title: "Login", signal: { settled: true, urlChanged: true, titleChanged: true } }
          },
          {
            id: "f1",
            at: "2026-04-07T10:00:02.000Z",
            kind: "command",
            command: "fill",
            input: ["@e3", "demo", { timeoutMs: 3000 }],
            ok: true,
            durationMs: 20,
            output: {
              ok: true,
              url: "https://example.com/login",
              selector: "button[aria-label=\"Show password\"]",
              selectorCandidates: ["button[aria-label=\"Show password\"]"],
              ariaLabel: "Show password",
              signal: { settled: true, urlChanged: false, titleChanged: false }
            }
          },
          {
            id: "m2",
            at: "2026-04-07T10:00:03.000Z",
            kind: "marker",
            command: "trace.mark",
            input: [{ type: "goal_success", label: "demo" }],
            ok: true,
            durationMs: 0,
            marker: { type: "goal_success", label: "demo" }
          }
        ]
      })),
      getPath: vi.fn(() => ".fast-browser/sessions/events.jsonl")
    };
    const router = new CommandRouter({
      adapterManager: {} as any,
      adapterRegistry: {} as any,
      cache: {} as any,
      runtime: {} as any,
      guideService: {} as any,
      flowService: flowService as any,
      traceStore: traceStore as any,
      sessionStore: sessionStore as any
    });

    await expect((router as any).flowSaveFromTrace("demo", { id: "search-open", goal: "Search and open" })).rejects.toMatchObject({
      code: "FB_FLOW_001",
      stage: "flow",
      message: "Trace step fill cannot be converted into a stable flow target"
    });
    expect(flowService.saveFlow).not.toHaveBeenCalled();
  });

  it("prefers semantic selector candidates for fill targets", async () => {
    const flowService = {
      saveFlow: vi.fn(async () => ({ ok: true, site: "demo", flowId: "search-open" }))
    };
    const sessionStore = {
      set: vi.fn(async () => undefined),
      get: vi.fn(async () => ({
        status: "success",
        path: ".fast-browser/sessions/events.jsonl",
        at: new Date().toISOString()
      })),
      delete: vi.fn(async () => undefined)
    };
    const traceStore = {
      current: vi.fn(async () => ({
        startMarker: {
          id: "m1",
          at: "2026-04-07T10:00:00.000Z",
          kind: "marker",
          command: "trace.mark",
          input: [{ type: "goal_start", label: "demo" }],
          ok: true,
          durationMs: 0,
          marker: { type: "goal_start", label: "demo" }
        },
        entries: [
          {
            id: "m1",
            at: "2026-04-07T10:00:00.000Z",
            kind: "marker",
            command: "trace.mark",
            input: [{ type: "goal_start", label: "demo" }],
            ok: true,
            durationMs: 0,
            marker: { type: "goal_start", label: "demo" }
          },
          {
            id: "o1",
            at: "2026-04-07T10:00:01.000Z",
            kind: "command",
            command: "open",
            input: ["https://example.com/search"],
            ok: true,
            durationMs: 10,
            output: { ok: true, url: "https://example.com/search", title: "Search", signal: { settled: true, urlChanged: true, titleChanged: true } }
          },
          {
            id: "f1",
            at: "2026-04-07T10:00:02.000Z",
            kind: "command",
            command: "fill",
            input: ["@e3", "fast-browser", { timeoutMs: 3000 }],
            ok: true,
            durationMs: 20,
            output: {
              ok: true,
              url: "https://example.com/search",
              selector: "div.page > header > div.search > button",
              selectorCandidates: [
                "div.page > header > div.search > button",
                "input[name='q']",
                "form[role='search'] input"
              ],
              placeholder: "Search",
              signal: { settled: true, urlChanged: false, titleChanged: false }
            },
            locator: {
              rawTarget: "@e3",
              strategy: "snapshot_ref",
              resolvedSelector: "div.page > header > div.search > button",
              selectorCandidates: [
                "div.page > header > div.search > button",
                "input[name='q']",
                "form[role='search'] input"
              ],
              placeholder: "Search"
            }
          },
          {
            id: "m2",
            at: "2026-04-07T10:00:03.000Z",
            kind: "marker",
            command: "trace.mark",
            input: [{ type: "goal_success", label: "demo" }],
            ok: true,
            durationMs: 0,
            marker: { type: "goal_success", label: "demo" }
          }
        ]
      })),
      getPath: vi.fn(() => ".fast-browser/sessions/events.jsonl")
    };
    const router = new CommandRouter({
      adapterManager: {} as any,
      adapterRegistry: {} as any,
      cache: {} as any,
      runtime: {} as any,
      guideService: {} as any,
      flowService: flowService as any,
      traceStore: traceStore as any,
      sessionStore: sessionStore as any
    });

    await expect((router as any).flowSaveFromTrace("demo", { id: "search-open", goal: "Search and open" })).resolves.toEqual({
      ok: true,
      site: "demo",
      flowId: "search-open"
    });

    expect(flowService.saveFlow).toHaveBeenCalledWith("demo", expect.objectContaining({
      steps: [
        {
          type: "builtin",
          command: "open",
          with: { url: "https://example.com/search" }
        },
        {
          type: "builtin",
          command: "fill",
          with: {
            target: {
              selector: "input[name='q']",
              placeholder: "Search"
            },
            value: "fast-browser"
          }
        }
      ]
    }));
  });

  it("sanitizes volatile auth query params in trace-generated open steps", async () => {
    const flowService = {
      saveFlow: vi.fn(async () => ({ ok: true, site: "opencart", flowId: "login-route" }))
    };
    const sessionStore = {
      set: vi.fn(async () => undefined),
      get: vi.fn(async () => ({
        status: "success",
        path: ".fast-browser/sessions/events.jsonl",
        at: new Date().toISOString()
      })),
      delete: vi.fn(async () => undefined)
    };
    const traceStore = {
      current: vi.fn(async () => ({
        startMarker: {
          id: "m1",
          at: "2026-04-07T11:00:00.000Z",
          kind: "marker",
          command: "trace.mark",
          input: [{ type: "goal_start", label: "opencart" }],
          ok: true,
          durationMs: 0,
          marker: { type: "goal_start", label: "opencart" }
        },
        entries: [
          {
            id: "m1",
            at: "2026-04-07T11:00:00.000Z",
            kind: "marker",
            command: "trace.mark",
            input: [{ type: "goal_start", label: "opencart" }],
            ok: true,
            durationMs: 0,
            marker: { type: "goal_start", label: "opencart" }
          },
          {
            id: "o1",
            at: "2026-04-07T11:00:01.000Z",
            kind: "command",
            command: "open",
            input: ["https://example.com/admin/index.php?route=catalog/product&user_token=abc123&filter_name=Apple"],
            ok: true,
            durationMs: 10,
            output: { ok: true, url: "https://example.com/admin/index.php?route=catalog/product&user_token=abc123&filter_name=Apple", title: "Products", signal: { settled: true, urlChanged: true, titleChanged: true } }
          },
          {
            id: "m2",
            at: "2026-04-07T11:00:02.000Z",
            kind: "marker",
            command: "trace.mark",
            input: [{ type: "goal_success", label: "opencart" }],
            ok: true,
            durationMs: 0,
            marker: { type: "goal_success", label: "opencart" }
          }
        ]
      })),
      getPath: vi.fn(() => ".fast-browser/sessions/events.jsonl")
    };
    const router = new CommandRouter({
      adapterManager: {} as any,
      adapterRegistry: {} as any,
      cache: {} as any,
      runtime: {} as any,
      guideService: {} as any,
      flowService: flowService as any,
      traceStore: traceStore as any,
      sessionStore: sessionStore as any
    });

    await expect((router as any).flowSaveFromTrace("opencart", { id: "login-route", goal: "Open admin product list" })).resolves.toEqual({
      ok: true,
      site: "opencart",
      flowId: "login-route"
    });

    expect(flowService.saveFlow).toHaveBeenCalledWith("opencart", {
      id: "login-route",
      kind: "flow",
      goal: "Open admin product list",
      steps: [
        {
          type: "builtin",
          command: "open",
          with: { url: "https://example.com/admin/index.php?route=catalog%2Fproduct&filter_name=Apple" }
        }
      ],
      success: [{ type: "titleNotEmpty" }]
    });
  });

  it("rejects trace-generated flows that cross the login-state boundary", async () => {
    const flowService = {
      saveFlow: vi.fn(async () => ({ ok: true, site: "react-admin", flowId: "login-filter-route" }))
    };
    const sessionStore = {
      set: vi.fn(async () => undefined),
      get: vi.fn(async () => ({
        status: "success",
        path: ".fast-browser/sessions/events.jsonl",
        at: new Date().toISOString()
      })),
      delete: vi.fn(async () => undefined)
    };
    const traceStore = {
      current: vi.fn(async () => ({
        startMarker: {
          id: "m1",
          at: "2026-04-07T12:00:00.000Z",
          kind: "marker",
          command: "trace.mark",
          input: [{ type: "goal_start", label: "react-admin" }],
          ok: true,
          durationMs: 0,
          marker: { type: "goal_start", label: "react-admin" }
        },
        entries: [
          {
            id: "m1",
            at: "2026-04-07T12:00:00.000Z",
            kind: "marker",
            command: "trace.mark",
            input: [{ type: "goal_start", label: "react-admin" }],
            ok: true,
            durationMs: 0,
            marker: { type: "goal_start", label: "react-admin" }
          },
          {
            id: "o1",
            at: "2026-04-07T12:00:01.000Z",
            kind: "command",
            command: "open",
            input: ["https://marmelab.com/react-admin-demo/"],
            ok: true,
            durationMs: 10,
            output: { ok: true, url: "https://marmelab.com/react-admin-demo/", title: "Login", signal: { settled: true, urlChanged: true, titleChanged: true } }
          },
          {
            id: "f1",
            at: "2026-04-07T12:00:02.000Z",
            kind: "command",
            command: "fill",
            input: ["input[name=username]", "demo", { timeoutMs: 3000 }],
            ok: true,
            durationMs: 20,
            output: {
              ok: true,
              url: "https://marmelab.com/react-admin-demo/",
              selector: "input[name=username]",
              selectorCandidates: ["input[name=username]"],
              signal: { settled: true, urlChanged: false, titleChanged: false }
            }
          },
          {
            id: "f2",
            at: "2026-04-07T12:00:03.000Z",
            kind: "command",
            command: "fill",
            input: ["input[name=password]", "demo", { timeoutMs: 3000 }],
            ok: true,
            durationMs: 20,
            output: {
              ok: true,
              url: "https://marmelab.com/react-admin-demo/",
              selector: "input[name=password]",
              selectorCandidates: ["input[name=password]"],
              signal: { settled: true, urlChanged: false, titleChanged: false }
            }
          },
          {
            id: "o2",
            at: "2026-04-07T12:00:04.000Z",
            kind: "command",
            command: "open",
            input: ["https://marmelab.com/react-admin-demo/#/customers"],
            ok: true,
            durationMs: 10,
            output: { ok: true, url: "https://marmelab.com/react-admin-demo/#/customers", title: "Customers", signal: { settled: true, urlChanged: true, titleChanged: true } }
          },
          {
            id: "m2",
            at: "2026-04-07T12:00:05.000Z",
            kind: "marker",
            command: "trace.mark",
            input: [{ type: "goal_success", label: "react-admin" }],
            ok: true,
            durationMs: 0,
            marker: { type: "goal_success", label: "react-admin" }
          }
        ]
      })),
      getPath: vi.fn(() => ".fast-browser/sessions/events.jsonl")
    };
    const router = new CommandRouter({
      adapterManager: {} as any,
      adapterRegistry: {} as any,
      cache: {} as any,
      runtime: {} as any,
      guideService: {} as any,
      flowService: flowService as any,
      traceStore: traceStore as any,
      sessionStore: sessionStore as any
    });

    await expect((router as any).flowSaveFromTrace("react-admin", { id: "login-filter-route", goal: "Login then open customers" })).rejects.toMatchObject({
      code: "FB_FLOW_001",
      stage: "flow",
      message: expect.stringContaining("login-state boundary")
    });
    expect(flowService.saveFlow).not.toHaveBeenCalled();
  });
});
