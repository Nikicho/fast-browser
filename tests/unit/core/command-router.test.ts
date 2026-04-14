import { describe, expect, it, vi } from "vitest";



import { CommandRouter } from "../../../src/core/command-router";



describe("CommandRouter browser lifecycle", () => {

  it("forwards open options to the runtime", async () => {

    const runtime = {

      open: vi.fn(async () => ({ ok: true, url: "https://example.com" })),

      healthCheck: vi.fn(),

      snapshot: vi.fn(),

      click: vi.fn(),

      type: vi.fn(),

      fill: vi.fn(),

      press: vi.fn(),

      hover: vi.fn(),

      scroll: vi.fn(),

      screenshot: vi.fn(),

      evalExpression: vi.fn(),

      goBack: vi.fn(),

      goForward: vi.fn(),

      reload: vi.fn(),

      getUrl: vi.fn(),

      getTitle: vi.fn(),

      wait: vi.fn(),

      waitForSelector: vi.fn(),

      consoleLogs: vi.fn(),

      networkEntries: vi.fn(),

      cookies: vi.fn(),

      storage: vi.fn(),

      performanceMetrics: vi.fn(),

      browserStatus: vi.fn(async () => ({ ok: true, running: true, mode: "headed" })),

      browserClose: vi.fn(async () => ({ ok: true, closed: true }))

    } as any;



    const router = new CommandRouter({

      adapterManager: {} as any,

      adapterRegistry: {} as any,

      cache: {} as any,

      runtime,

      guideService: {} as any,

      flowService: {} as any,

      traceStore: {} as any

    });



    await router.open("https://example.com", { headless: false });



    expect(runtime.open).toHaveBeenCalledWith("https://example.com", { headless: false });

  });



  it("returns browser status from the runtime", async () => {

    const runtime = {

      browserStatus: vi.fn(async () => ({ ok: true, running: true, mode: "headed" }))

    } as any;



    const router = new CommandRouter({

      adapterManager: {} as any,

      adapterRegistry: {} as any,

      cache: {} as any,

      runtime,

      guideService: {} as any,

      flowService: {} as any,

      traceStore: {} as any

    });



    await expect(router.browserStatus()).resolves.toEqual({ ok: true, running: true, mode: "headed" });

  });



  it("returns workspace isolation hints", async () => {

    const previousRoot = process.env.FAST_BROWSER_ROOT;

    const previousSession = process.env.FAST_BROWSER_SESSION_ID;

    process.env.FAST_BROWSER_ROOT = "D:/AIWorks/skills/fast-browser";

    process.env.FAST_BROWSER_SESSION_ID = "shell:powershell-exe-26992";



    const router = new CommandRouter({

      adapterManager: {} as any,

      adapterRegistry: {} as any,

      cache: {} as any,

      runtime: {} as any,

      guideService: {} as any,

      flowService: {} as any,

      traceStore: {} as any

    });



    await expect(router.workspace()).resolves.toMatchObject({

      browserIsolationMode: "session-clone",

      sessionIdentitySource: "windows-shell",

      sessionIdentityReliable: false

    });



    if (previousRoot === undefined) {

      delete process.env.FAST_BROWSER_ROOT;

    } else {

      process.env.FAST_BROWSER_ROOT = previousRoot;

    }

    if (previousSession === undefined) {

      delete process.env.FAST_BROWSER_SESSION_ID;

    } else {

      process.env.FAST_BROWSER_SESSION_ID = previousSession;

    }

  });



  it("closes the browser through the runtime", async () => {

    const runtime = {

      browserClose: vi.fn(async () => ({ ok: true, closed: true }))

    } as any;



    const router = new CommandRouter({

      adapterManager: {} as any,

      adapterRegistry: {} as any,

      cache: {} as any,

      runtime,

      guideService: {} as any,

      flowService: {} as any,

      traceStore: {} as any

    });



    await expect(router.browserClose()).resolves.toEqual({ ok: true, closed: true });

  });



  it("pins the current session through the runtime", async () => {

    const runtime = {

      sessionPin: vi.fn(async () => ({ ok: true, pinned: true }))

    } as any;



    const router = new CommandRouter({

      adapterManager: {} as any,

      adapterRegistry: {} as any,

      cache: {} as any,

      runtime,

      guideService: {} as any,

      flowService: {} as any,

      traceStore: {} as any

    });



    await expect((router as any).sessionPin()).resolves.toEqual({ ok: true, pinned: true });

  });



  it("unpins the current session through the runtime", async () => {
    const runtime = {
      sessionUnpin: vi.fn(async () => ({ ok: true, pinned: false }))
    } as any;

    const router = new CommandRouter({
      adapterManager: {} as any,
      adapterRegistry: {} as any,
      cache: {} as any,
      runtime,
      guideService: {} as any,
      flowService: {} as any,
      traceStore: {} as any
    });

    await expect((router as any).sessionUnpin()).resolves.toEqual({ ok: true, pinned: false });
  });

  it("returns current session status through the runtime", async () => {
    const runtime = {
      sessionStatus: vi.fn(async () => ({ ok: true, session: { sessionId: "zhihu-a", lifecycleStatus: "idle" } }))
    } as any;

    const router = new CommandRouter({
      adapterManager: {} as any,
      adapterRegistry: {} as any,
      cache: {} as any,
      runtime,
      guideService: {} as any,
      flowService: {} as any,
      traceStore: {} as any
    });

    await expect((router as any).sessionStatus()).resolves.toEqual({ ok: true, session: { sessionId: "zhihu-a", lifecycleStatus: "idle" } });
  });

  it("lists session clone statuses through the runtime", async () => {
    const runtime = {
      sessionList: vi.fn(async () => ({ ok: true, sessions: [] }))
    } as any;

    const router = new CommandRouter({
      adapterManager: {} as any,
      adapterRegistry: {} as any,
      cache: {} as any,
      runtime,
      guideService: {} as any,
      flowService: {} as any,
      traceStore: {} as any
    });

    await expect((router as any).sessionList()).resolves.toEqual({ ok: true, sessions: [] });
  });
});

describe("CommandRouter flow operations", () => {

  it("saves a flow through the flow service", async () => {

    const flowService = {

      saveFlow: vi.fn(async () => ({ ok: true, site: "demo", flowId: "search-open" }))

    };

    const router = new CommandRouter({

      adapterManager: {} as any,

      adapterRegistry: {} as any,

      cache: {} as any,

      runtime: {} as any,

      guideService: {} as any,

      flowService: flowService as any,

      traceStore: {} as any

    });



    await expect((router as any).flowSave("demo", { id: "search-open" })).resolves.toEqual({ ok: true, site: "demo", flowId: "search-open" });

    expect(flowService.saveFlow).toHaveBeenCalledWith("demo", { id: "search-open" });

  });



  it("lists flows through the flow service", async () => {

    const flowService = {

      listFlows: vi.fn(async () => [{ site: "demo", flowId: "search-open" }])

    };

    const router = new CommandRouter({

      adapterManager: {} as any,

      adapterRegistry: {} as any,

      cache: {} as any,

      runtime: {} as any,

      guideService: {} as any,

      flowService: flowService as any,

      traceStore: {} as any

    });



    await expect((router as any).flowList("demo")).resolves.toEqual([{ site: "demo", flowId: "search-open" }]);

  });



  it("runs a flow through the flow service", async () => {

    const flowService = {

      runFlow: vi.fn(async () => ({ ok: true, flowId: "search-open", steps: [] }))

    };

    const router = new CommandRouter({

      adapterManager: {} as any,

      adapterRegistry: {} as any,

      cache: {} as any,

      runtime: {} as any,

      guideService: {} as any,

      flowService: flowService as any,

      traceStore: {} as any

    });



    await expect((router as any).flowRun("demo/search-open", { query: "fast-browser" })).resolves.toEqual({ ok: true, flowId: "search-open", steps: [] });

    expect(flowService.runFlow).toHaveBeenCalledWith("demo/search-open", { query: "fast-browser" });

  });

});



describe("CommandRouter case operations", () => {

  it("saves a case through the case service", async () => {

    const caseService = {

      saveCase: vi.fn(async () => ({ ok: true, site: "demo", caseId: "search-repo" }))

    };

    const router = new CommandRouter({

      adapterManager: {} as any,

      adapterRegistry: {} as any,

      cache: {} as any,

      runtime: {} as any,

      guideService: {} as any,

      flowService: {} as any,

      caseService: caseService as any,

      traceStore: {} as any

    });



    await expect((router as any).caseSave("demo", { id: "search-repo" })).resolves.toEqual({ ok: true, site: "demo", caseId: "search-repo" });

    expect(caseService.saveCase).toHaveBeenCalledWith("demo", { id: "search-repo" });

  });



  it("lists cases through the case service", async () => {

    const caseService = {

      listCases: vi.fn(async () => [{ site: "demo", caseId: "search-repo" }])

    };

    const router = new CommandRouter({

      adapterManager: {} as any,

      adapterRegistry: {} as any,

      cache: {} as any,

      runtime: {} as any,

      guideService: {} as any,

      flowService: {} as any,

      caseService: caseService as any,

      traceStore: {} as any

    });



    await expect((router as any).caseList("demo")).resolves.toEqual([{ site: "demo", caseId: "search-repo" }]);

  });



  it("runs a case through the case service", async () => {

    const caseService = {

      runCase: vi.fn(async () => ({ ok: true, caseId: "search-repo", uses: [] }))

    };

    const router = new CommandRouter({

      adapterManager: {} as any,

      adapterRegistry: {} as any,

      cache: {} as any,

      runtime: {} as any,

      guideService: {} as any,

      flowService: {} as any,

      caseService: caseService as any,

      traceStore: {} as any

    });



    await expect((router as any).caseRun("demo/search-repo", { query: "fast-browser" })).resolves.toEqual({ ok: true, caseId: "search-repo", uses: [] });

    expect(caseService.runCase).toHaveBeenCalledWith("demo/search-repo", { query: "fast-browser" });

  });

});

describe("CommandRouter console and network filters", () => {

  it("filters console logs after reading them from the runtime", async () => {

    const runtime = {

      consoleLogs: vi.fn(async () => ({

        logs: [

          { type: "log", text: "ready", time: 1 },

          { type: "error", text: "timeout reached", time: 2 },

          { type: "error", text: "other", time: 3 }

        ]

      }))

    } as any;



    const router = new CommandRouter({

      adapterManager: {} as any,

      adapterRegistry: {} as any,

      cache: {} as any,

      runtime,

      guideService: {} as any,

      flowService: {} as any,

      traceStore: {} as any

    });



    await expect(router.consoleLogs({ clear: true, type: "error", text: "timeout" })).resolves.toEqual({

      logs: [{ type: "error", text: "timeout reached", time: 2 }]

    });

    expect(runtime.consoleLogs).toHaveBeenCalledWith({ clear: true });

  });



  it("filters network entries after reading them from the runtime", async () => {

    const runtime = {

      networkEntries: vi.fn(async () => ({

        entries: [

          { url: "https://example.com/api/orders", method: "POST", status: 200, resourceType: "xhr", time: 1 },

          { url: "https://example.com/api/orders", method: "GET", status: 200, resourceType: "fetch", time: 2 },

          { url: "https://example.com/assets/app.js", method: "GET", status: 200, resourceType: "script", time: 3 }

        ]

      }))

    } as any;



    const router = new CommandRouter({

      adapterManager: {} as any,

      adapterRegistry: {} as any,

      cache: {} as any,

      runtime,

      guideService: {} as any,

      flowService: {} as any,

      traceStore: {} as any

    });



    await expect(router.networkEntries({ clear: true, urlIncludes: "/api/orders", method: "POST", status: 200, resourceType: "xhr" })).resolves.toEqual({

      entries: [{ url: "https://example.com/api/orders", method: "POST", status: 200, resourceType: "xhr", time: 1 }]

    });

    expect(runtime.networkEntries).toHaveBeenCalledWith({ clear: true });

  });

});





describe("CommandRouter trace current", () => {

  it("returns a distilled current trace view instead of raw entries", async () => {

    const traceStore = {

      getPath: vi.fn(() => ".fast-browser/sessions/events.jsonl"),

      current: vi.fn(async () => ({

        startMarker: {

          id: "m1",

          at: "2026-03-24T10:00:00.000Z",

          kind: "marker",

          command: "trace.mark",

          input: [{ type: "goal_start", label: "publish" }],

          ok: true,

          durationMs: 0,

          marker: { type: "goal_start", label: "publish" }

        },

        entries: [

          {

            id: "m1",

            at: "2026-03-24T10:00:00.000Z",

            kind: "marker",

            command: "trace.mark",

            input: [{ type: "goal_start", label: "publish" }],

            ok: true,

            durationMs: 0,

            marker: { type: "goal_start", label: "publish" }

          },

          {

            id: "c1",

            at: "2026-03-24T10:00:01.000Z",

            kind: "command",

            command: "click",

            input: ["@e1"],

            ok: true,

            durationMs: 40,

            output: {

              ok: true,

              url: "https://example.com/publish",

              selector: 'button[data-testid="publish-image"]',

              selectorCandidates: ['button[data-testid="publish-image"]']

            }

          },

          {

            id: "m2",

            at: new Date().toISOString(),

            kind: "marker",

            command: "trace.mark",

            input: [{ type: "goal_success", label: "publish" }],

            ok: true,

            durationMs: 0,

            marker: { type: "goal_success", label: "publish" }

          }

        ]

      }))

    } as any;



    const router = new CommandRouter({

      adapterManager: {} as any,

      adapterRegistry: {} as any,

      cache: {} as any,

      runtime: {} as any,

      guideService: {} as any,

      flowService: {} as any,

      traceStore

    });



    await expect(router.traceCurrent()).resolves.toEqual({

      path: ".fast-browser/sessions/events.jsonl",

      startMarker: expect.objectContaining({ id: "m1" }),

      endMarker: expect.objectContaining({ id: "m2" }),

      status: "success",

      rawEntryCount: 3,

      checkpoints: [],

      discarded: [],

      entries: [

        expect.objectContaining({

          entryId: "c1",

          command: "click",

          flowSafe: true,

          commandCandidate: true,

          locator: expect.objectContaining({

            rawTarget: "@e1",

            resolvedSelector: 'button[data-testid="publish-image"]'

          })

        })

      ]

    });

  });

});



describe("CommandRouter trace-backed save discipline", () => {

  it("persists the distilled trace current view into session state for later saves", async () => {

    const sessionStore = {

      set: vi.fn(async () => undefined),

      get: vi.fn(async () => null),

      delete: vi.fn(async () => undefined)

    };

    const traceStore = {

      getPath: vi.fn(() => ".fast-browser/sessions/events.jsonl"),

      current: vi.fn(async () => ({

        startMarker: {

          id: "m1",

          at: "2026-03-24T10:00:00.000Z",

          kind: "marker",

          command: "trace.mark",

          input: [{ type: "goal_start", label: "publish" }],

          ok: true,

          durationMs: 0,

          marker: { type: "goal_start", label: "publish" }

        },

        entries: [

          {

            id: "m1",

            at: "2026-03-24T10:00:00.000Z",

            kind: "marker",

            command: "trace.mark",

            input: [{ type: "goal_start", label: "publish" }],

            ok: true,

            durationMs: 0,

            marker: { type: "goal_start", label: "publish" }

          },

          {

            id: "m2",

            at: new Date().toISOString(),

            kind: "marker",

            command: "trace.mark",

            input: [{ type: "goal_success", label: "publish" }],

            ok: true,

            durationMs: 0,

            marker: { type: "goal_success", label: "publish" }

          }

        ]

      }))

    } as any;



    const router = new CommandRouter({

      adapterManager: {} as any,

      adapterRegistry: {} as any,

      cache: {} as any,

      runtime: {} as any,

      guideService: {} as any,

      flowService: {} as any,

      traceStore,

      sessionStore: sessionStore as any

    });



    await router.traceCurrent();



    expect(sessionStore.set).toHaveBeenCalledWith(

      "trace.lastCurrent",

      expect.objectContaining({

        status: "success",

        path: ".fast-browser/sessions/events.jsonl"

      })

    );

  });



  it("rejects flow saves until trace current has been consumed", async () => {

    const flowService = {

      saveFlow: vi.fn(async () => ({ ok: true, site: "demo", flowId: "search-open" }))

    };

    const sessionStore = {

      set: vi.fn(async () => undefined),

      get: vi.fn(async () => null),

      delete: vi.fn(async () => undefined)

    };

    const router = new CommandRouter({

      adapterManager: {} as any,

      adapterRegistry: {} as any,

      cache: {} as any,

      runtime: {} as any,

      guideService: {} as any,

      flowService: flowService as any,

      traceStore: {} as any,

      sessionStore: sessionStore as any

    });



    await expect((router as any).flowSave("demo", "demo.flow.json")).rejects.toMatchObject({

      code: "FB_FLOW_001",

      stage: "flow"

    });

    expect(flowService.saveFlow).not.toHaveBeenCalled();

  });



  it("allows case saves after a successful trace current snapshot was recorded", async () => {

    const caseService = {

      saveCase: vi.fn(async () => ({ ok: true, site: "demo", caseId: "smoke" }))

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

    const router = new CommandRouter({

      adapterManager: {} as any,

      adapterRegistry: {} as any,

      cache: {} as any,

      runtime: {} as any,

      guideService: {} as any,

      flowService: {} as any,

      caseService: caseService as any,

      traceStore: {} as any,

      sessionStore: sessionStore as any

    });



    await expect((router as any).caseSave("demo", "smoke.case.json")).resolves.toEqual({ ok: true, site: "demo", caseId: "smoke" });

    expect(caseService.saveCase).toHaveBeenCalledWith("demo", "smoke.case.json");

  });

});








describe("CommandRouter draft saves", () => {
  it("builds a flow from the latest successful trace with tab and interaction steps", async () => {
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
          at: "2026-04-02T10:00:00.000Z",
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
            at: "2026-04-02T10:00:00.000Z",
            kind: "marker",
            command: "trace.mark",
            input: [{ type: "goal_start", label: "demo" }],
            ok: true,
            durationMs: 0,
            marker: { type: "goal_start", label: "demo" }
          },
          {
            id: "s1",
            at: "2026-04-02T10:00:01.000Z",
            kind: "command",
            command: "site",
            input: ["demo/search", { query: "fast-browser" }, "text", true],
            ok: true,
            durationMs: 100,
            output: { success: true }
          },
          {
            id: "t1",
            at: "2026-04-02T10:00:02.000Z",
            kind: "command",
            command: "tabNew",
            input: ["https://example.com/detail"],
            ok: true,
            durationMs: 120,
            output: { ok: true, tab: { id: "tab-2", url: "https://example.com/detail", active: true } }
          },
          {
            id: "c1",
            at: "2026-04-02T10:00:03.000Z",
            kind: "command",
            command: "click",
            input: ["@e7", { timeoutMs: 5000 }],
            ok: true,
            durationMs: 30,
            output: {
              ok: true,
              url: "https://example.com/detail",
              selector: "button[type='submit']",
              selectorCandidates: ["button[type='submit']"],
              text: "??"
            }
          },
          {
            id: "f1",
            at: "2026-04-02T10:00:04.000Z",
            kind: "command",
            command: "fill",
            input: ["@e8", "fast-browser", { timeoutMs: 3000 }],
            ok: true,
            durationMs: 25,
            output: {
              ok: true,
              url: "https://example.com/detail",
              selector: "input[name='q']",
              selectorCandidates: ["input[name='q']"],
              placeholder: "??????"
            }
          },
          {
            id: "p1",
            at: "2026-04-02T10:00:05.000Z",
            kind: "command",
            command: "press",
            input: ["Enter"],
            ok: true,
            durationMs: 10,
            output: { ok: true, url: "https://example.com/detail" }
          },
          {
            id: "ts1",
            at: "2026-04-02T10:00:06.000Z",
            kind: "command",
            command: "tabSwitch",
            input: ["tab-1"],
            ok: true,
            durationMs: 15,
            output: { ok: true, tab: { id: "tab-1", active: true } }
          },
          {
            id: "m2",
            at: "2026-04-02T10:00:07.000Z",
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

    await expect((router as any).flowSaveFromTrace("demo", { id: "search-open", goal: "Search and open" })).resolves.toEqual({ ok: true, site: "demo", flowId: "search-open" });
    expect(flowService.saveFlow).toHaveBeenCalledWith("demo", {
      id: "search-open",
      kind: "flow",
      goal: "Search and open",
      steps: [
        { type: "site", command: "demo/search", with: { query: "fast-browser" } },
        { type: "builtin", command: "tabNew", with: { url: "https://example.com/detail" } },
        { type: "builtin", command: "click", with: { target: { selector: "button[type='submit']", text: "??" } } },
        { type: "builtin", command: "fill", with: { target: { selector: "input[name='q']", placeholder: "??????" }, value: "fast-browser" } },
        { type: "builtin", command: "press", with: { key: "Enter" } },
        { type: "builtin", command: "tabSwitch", with: { target: "previous" } }
      ],
      success: [{ type: "titleNotEmpty" }]
    });
  });

  it("dedupes consecutive duplicate stable entry steps in a trace-generated flow", async () => {
    const flowService = {
      saveFlow: vi.fn(async () => ({ ok: true, site: "bilibili", flowId: "popular-video-route" }))
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
          at: "2026-04-04T10:00:00.000Z",
          kind: "marker",
          command: "trace.mark",
          input: [{ type: "goal_start", label: "bilibili" }],
          ok: true,
          durationMs: 0,
          marker: { type: "goal_start", label: "bilibili" }
        },
        entries: [
          {
            id: "m1",
            at: "2026-04-04T10:00:00.000Z",
            kind: "marker",
            command: "trace.mark",
            input: [{ type: "goal_start", label: "bilibili" }],
            ok: true,
            durationMs: 0,
            marker: { type: "goal_start", label: "bilibili" }
          },
          {
            id: "s1",
            at: "2026-04-04T10:00:01.000Z",
            kind: "command",
            command: "site",
            input: ["bilibili/popular", {}, "json", false],
            ok: true,
            durationMs: 120,
            output: { success: true }
          },
          {
            id: "s2",
            at: "2026-04-04T10:00:02.000Z",
            kind: "command",
            command: "site",
            input: ["bilibili/popular", {}, "json", false],
            ok: true,
            durationMs: 90,
            output: { success: true }
          },
          {
            id: "t1",
            at: "2026-04-04T10:00:03.000Z",
            kind: "command",
            command: "tabNew",
            input: ["https://www.bilibili.com/video/BV1MN4y177PB"],
            ok: true,
            durationMs: 50,
            output: { ok: true, tab: { id: "tab-2", url: "https://www.bilibili.com/video/BV1MN4y177PB", active: true } }
          },
          {
            id: "ts1",
            at: "2026-04-04T10:00:04.000Z",
            kind: "command",
            command: "tabSwitch",
            input: ["tab-1"],
            ok: true,
            durationMs: 15,
            output: { ok: true, tab: { id: "tab-1", active: true } }
          },
          {
            id: "m2",
            at: "2026-04-04T10:00:05.000Z",
            kind: "marker",
            command: "trace.mark",
            input: [{ type: "goal_success", label: "bilibili" }],
            ok: true,
            durationMs: 0,
            marker: { type: "goal_success", label: "bilibili" }
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

    await expect((router as any).flowSaveFromTrace("bilibili", { id: "popular-video-route", goal: "Open Bilibili popular page and video detail" })).resolves.toEqual({
      ok: true,
      site: "bilibili",
      flowId: "popular-video-route"
    });

    expect(flowService.saveFlow).toHaveBeenCalledWith("bilibili", {
      id: "popular-video-route",
      kind: "flow",
      goal: "Open Bilibili popular page and video detail",
      steps: [
        { type: "site", command: "bilibili/popular", with: {} },
        { type: "builtin", command: "tabNew", with: { url: "https://www.bilibili.com/video/BV1MN4y177PB" } },
        { type: "builtin", command: "tabSwitch", with: { target: "previous" } }
      ],
      success: [{ type: "titleNotEmpty" }]
    });
  });

  it("rejects click steps without page signal or stable semantic target", async () => {
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
          at: "2026-04-06T10:00:00.000Z",
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
            at: "2026-04-06T10:00:00.000Z",
            kind: "marker",
            command: "trace.mark",
            input: [{ type: "goal_start", label: "demo" }],
            ok: true,
            durationMs: 0,
            marker: { type: "goal_start", label: "demo" }
          },
          {
            id: "s1",
            at: "2026-04-06T10:00:01.000Z",
            kind: "command",
            command: "open",
            input: ["https://example.com"],
            ok: true,
            durationMs: 10,
            output: { ok: true, url: "https://example.com", title: "Example", signal: { settled: true, urlChanged: true, titleChanged: true } }
          },
          {
            id: "c1",
            at: "2026-04-06T10:00:02.000Z",
            kind: "command",
            command: "click",
            input: ["@e66", {}],
            ok: true,
            durationMs: 20,
            output: {
              ok: true,
              url: "https://example.com",
              title: "Example",
              selector: "div:nth-of-type(1) > button:nth-of-type(1)",
              selectorCandidates: ["div:nth-of-type(1) > button:nth-of-type(1)"],
              signal: { settled: true, urlChanged: false, titleChanged: false }
            }
          },
          {
            id: "m2",
            at: "2026-04-06T10:00:03.000Z",
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
      message: "Trace step click cannot be converted into a stable flow target"
    });
    expect(flowService.saveFlow).not.toHaveBeenCalled();
  });

  it("rejects flow drafts when a trace interaction target cannot be stabilized", async () => {
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
          at: "2026-04-02T10:00:00.000Z",
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
            at: "2026-04-02T10:00:00.000Z",
            kind: "marker",
            command: "trace.mark",
            input: [{ type: "goal_start", label: "demo" }],
            ok: true,
            durationMs: 0,
            marker: { type: "goal_start", label: "demo" }
          },
          {
            id: "c1",
            at: "2026-04-02T10:00:01.000Z",
            kind: "command",
            command: "click",
            input: ["@e7", { timeoutMs: 5000 }],
            ok: true,
            durationMs: 30,
            output: { ok: true, url: "https://example.com/detail" }
          },
          {
            id: "m2",
            at: "2026-04-02T10:00:02.000Z",
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
      message: "Trace step click cannot be converted into a stable flow target"
    });
    expect(flowService.saveFlow).not.toHaveBeenCalled();
  });

  it("rejects flow drafts that contain tab context steps without a stable entry step", async () => {
    const flowService = {
      saveFlow: vi.fn(async () => ({ ok: true, site: "zhihu", flowId: "hot-question-route" }))
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
          at: "2026-04-04T10:00:00.000Z",
          kind: "marker",
          command: "trace.mark",
          input: [{ type: "goal_start", label: "zhihu" }],
          ok: true,
          durationMs: 0,
          marker: { type: "goal_start", label: "zhihu" }
        },
        entries: [
          {
            id: "m1",
            at: "2026-04-04T10:00:00.000Z",
            kind: "marker",
            command: "trace.mark",
            input: [{ type: "goal_start", label: "zhihu" }],
            ok: true,
            durationMs: 0,
            marker: { type: "goal_start", label: "zhihu" }
          },
          {
            id: "t1",
            at: "2026-04-04T10:00:01.000Z",
            kind: "command",
            command: "tabNew",
            input: ["https://www.zhihu.com/question/26073933"],
            ok: true,
            durationMs: 120,
            output: { ok: true, tab: { id: "tab-2", url: "https://www.zhihu.com/question/26073933", active: true } }
          },
          {
            id: "ts1",
            at: "2026-04-04T10:00:02.000Z",
            kind: "command",
            command: "tabSwitch",
            input: ["tab-1"],
            ok: true,
            durationMs: 15,
            output: { ok: true, tab: { id: "tab-1", active: true } }
          },
          {
            id: "m2",
            at: "2026-04-04T10:00:03.000Z",
            kind: "marker",
            command: "trace.mark",
            input: [{ type: "goal_success", label: "zhihu" }],
            ok: true,
            durationMs: 0,
            marker: { type: "goal_success", label: "zhihu" }
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

    await expect((router as any).flowSaveFromTrace("zhihu", { id: "hot-question-route", goal: "Open Zhihu hot page and question detail" })).rejects.toMatchObject({
      code: "FB_FLOW_001",
      stage: "flow",
      message: expect.stringContaining("stable entry step")
    });
    expect(flowService.saveFlow).not.toHaveBeenCalled();
  });

  it("builds a case from a flow reference with default assertions", async () => {
    const caseService = {
      saveCase: vi.fn(async () => ({ ok: true, site: "demo", caseId: "search-smoke" }))
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
    const router = new CommandRouter({
      adapterManager: {} as any,
      adapterRegistry: {} as any,
      cache: {} as any,
      runtime: {} as any,
      guideService: {} as any,
      flowService: {} as any,
      caseService: caseService as any,
      traceStore: {} as any,
      sessionStore: sessionStore as any
    });

    await expect((router as any).caseSaveFromFlow("demo", {
      id: "search-smoke",
      goal: "Verify search",
      flowId: "search-open",
      urlIncludes: "/search",
      textIncludes: "Results",
      selectorVisible: ".result-list",
      titleNotEmpty: true
    })).resolves.toEqual({ ok: true, site: "demo", caseId: "search-smoke" });
    expect(caseService.saveCase).toHaveBeenCalledWith("demo", {
      id: "search-smoke",
      kind: "case",
      goal: "Verify search",
      uses: [{ flow: "search-open", with: {} }],
      assertions: [
        { type: "urlIncludes", value: "/search" },
        { type: "textIncludes", value: "Results" },
        { type: "selectorVisible", value: ".result-list" },
        { type: "titleNotEmpty" }
      ]
    });
  });
});

describe("CommandRouter auth and session lifecycle", () => {

  it("runs auth sync through the runtime", async () => {

    const runtime = {

      authSync: vi.fn(async () => ({ ok: true, synced: true, profileDir: "C:/Users/Hebe1/.fast-browser/chrome-profiles/demo" }))

    } as any;



    const router = new CommandRouter({

      adapterManager: {} as any,

      adapterRegistry: {} as any,

      cache: {} as any,

      runtime,

      guideService: {} as any,

      flowService: {} as any,

      traceStore: {} as any

    });



    await expect((router as any).authSync()).resolves.toEqual({

      ok: true,

      synced: true,

      profileDir: "C:/Users/Hebe1/.fast-browser/chrome-profiles/demo"

    });

    expect(runtime.authSync).toHaveBeenCalledTimes(1);

  });



  it("runs session cleanup through the runtime", async () => {

    const runtime = {

      sessionCleanup: vi.fn(async () => ({ ok: true, ttlHours: 24, removed: ["zhihu-a"], kept: [] }))

    } as any;



    const router = new CommandRouter({

      adapterManager: {} as any,

      adapterRegistry: {} as any,

      cache: {} as any,

      runtime,

      guideService: {} as any,

      flowService: {} as any,

      traceStore: {} as any

    });



    await expect((router as any).sessionCleanup({ maxAgeHours: 24 })).resolves.toEqual({

      ok: true,

      ttlHours: 24,

      removed: ["zhihu-a"],

      kept: []

    });

    expect(runtime.sessionCleanup).toHaveBeenCalledWith({ maxAgeHours: 24 });

  });

});



