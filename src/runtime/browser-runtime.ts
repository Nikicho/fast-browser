import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

import * as cheerio from "cheerio";
import puppeteer from "puppeteer-core";

import {
  getBrowserProfileDir,
  getBrowserSessionMetaStateFilePath,
  getBrowserSessionProfileDir,
  getBrowserStateFilePath,
  getGlobalAppDir,
  getProjectRoot,
  getSessionScopeName,
  resolveSessionId
} from "../shared/constants";
import { FastBrowserError } from "../shared/errors";
import { inferSessionIsolation } from "../shared/session-isolation";
import type {
  BrowserActionResult,
  BrowserActionSignal,
  BrowserAuthSyncResult,
  BrowserCollectResult,
  BrowserConsoleEntry,
  BrowserExtractBlocksResult,
  BrowserGateResult,
  BrowserIsolationMode,
  BrowserLaunchOptions,
  BrowserLifecycleStatus,
  BrowserNetworkEntry,
  BrowserProfileKind,
  BrowserRuntime,
  BrowserRuntimeInspectResult,
  BrowserSessionCleanupResult,
  BrowserSessionPinResult,
  BrowserSessionState,
  BrowserSessionStatusEntry,
  BrowserSessionStatusResult,
  BrowserSessionListResult,
  BrowserSnapshotInput,
  BrowserSnapshotResult,
  BrowserState,
  BrowserStatusResult,
  SessionIdentitySource
} from "../shared/types";
import { BrowserSessionStateStore, BrowserStateStore } from "./browser-state";
import { buildSnapshot, createSnapshotEvaluatorSource } from "./snapshot";

type BrowserLike = any;
type PageLike = any;

type RuntimeOptions = { stateFilePath?: string; sessionStateFilePath?: string; sessionId?: string; fetcher?: typeof fetch };
type EnsurePageResult = { browser: BrowserLike; page: PageLike; state: BrowserState; session: BrowserSessionState };

const ACTIVE_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_CLEANUP_HOURS = 24;
const TRANSIENT_ERRORS = ["Execution context was destroyed", "Unexpected end of JSON input", "Cannot find context with specified id", "Connection closed", "Target closed"];
const GATE_HINTS = ["继续", "同意", "确认", "接受", "允许", "进入", "我已满", "我已年满"];
const AUTH_FILES = [
  path.join("Default", "Login Data"),
  path.join("Default", "Login Data-journal"),
  path.join("Default", "Cookies"),
  path.join("Default", "Cookies-journal"),
  path.join("Default", "Network", "Cookies"),
  path.join("Default", "Network", "Cookies-journal"),
  path.join("Default", "Web Data"),
  path.join("Default", "Web Data-journal"),
  path.join("Default", "Preferences"),
  path.join("Default", "Secure Preferences"),
  "Local State"
];
const PROFILE_SKIP = new Set(["Crashpad", "Code Cache", "GPUCache", "ShaderCache", "SingletonCookie", "SingletonLock", "SingletonSocket", "DevToolsActivePort"]);

export class BrowserRuntimeFacade implements BrowserRuntime {
  readonly sessionId: string;
  readonly sessionScope: string;
  readonly isolationMode: BrowserIsolationMode;
  readonly sessionIdentitySource: SessionIdentitySource;
  readonly sessionIdentityReliable: boolean;
  readonly isolationNotice: string;
  readonly globalAppDir: string;
  readonly baseProfileDir: string;
  readonly profileDir: string;
  readonly profileKind: BrowserProfileKind;
  readonly stateFilePath: string;
  readonly sessionStateFilePath: string;

  private readonly stateStore: BrowserStateStore;
  private readonly sessionStateStore: BrowserSessionStateStore;
  private readonly fetcher: typeof fetch;
  private readonly usesCustomStatePaths: boolean;

  constructor(options: RuntimeOptions = {}) {
    this.sessionId = options.sessionId ?? resolveSessionId();
    this.sessionScope = getSessionScopeName(this.sessionId);
    const isolation = inferSessionIsolation(this.sessionId);
    this.isolationMode = isolation.mode;
    this.sessionIdentitySource = isolation.source;
    this.sessionIdentityReliable = isolation.reliable;
    this.isolationNotice = isolation.notice;
    this.globalAppDir = getGlobalAppDir();
    this.baseProfileDir = getBrowserProfileDir(this.globalAppDir);
    this.profileKind = isolation.mode === "session-clone" ? "session-clone" : "base";
    this.profileDir = this.profileKind === "session-clone" ? getBrowserSessionProfileDir(this.globalAppDir, this.sessionId) : this.baseProfileDir;
    this.stateFilePath = options.stateFilePath ?? (this.profileKind === "session-clone" ? getBrowserSessionMetaStateFilePath(this.globalAppDir, this.sessionId) : getBrowserStateFilePath(this.globalAppDir));
    this.sessionStateFilePath = options.sessionStateFilePath ?? path.join(path.dirname(this.stateFilePath), `browser-session-${this.sessionScope}.json`);
    this.stateStore = new BrowserStateStore(this.stateFilePath);
    this.sessionStateStore = new BrowserSessionStateStore(this.sessionStateFilePath);
    this.fetcher = options.fetcher ?? fetch;
    this.usesCustomStatePaths = Boolean(options.stateFilePath || options.sessionStateFilePath);
  }

  async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(url, init);
    if (!response.ok) throw new FastBrowserError("FB_RUNTIME_001", `Request failed: ${response.status} ${response.statusText}`, "runtime");
    return await response.json() as T;
  }

  async fetchHtml(url: string, init?: RequestInit): Promise<string> {
    const response = await this.fetcher(url, init);
    if (!response.ok) throw new FastBrowserError("FB_RUNTIME_001", `Request failed: ${response.status} ${response.statusText}`, "runtime");
    return await response.text();
  }

  async inspectSite(url: string): Promise<BrowserRuntimeInspectResult> {
    const html = await this.fetchHtml(url);
    const $ = cheerio.load(html);
    const resourceUrls = new Set<string>();
    $("script[src],link[href],img[src],a[href]").each((_, node) => {
      const value = $(node).attr("src") ?? $(node).attr("href");
      if (value) resourceUrls.add(value);
    });
    const formSelectors = $("form").map((_, node) => selectorForNode(node as any, "form")).get().filter(Boolean) as string[];
    const interactiveSelectors = $("a,button,input,textarea,select").map((_, node) => selectorForNode(node as any, (node as any).tagName?.toLowerCase?.() ?? "*")).get().filter(Boolean) as string[];
    return { finalUrl: url, homepageTitle: $("title").first().text().trim(), suggestedEndpoints: Array.from(resourceUrls).filter((item) => /api|search|hot|rank|feed|list|detail/i.test(item)).slice(0, 20), resourceUrls: Array.from(resourceUrls).slice(0, 50), interactiveSelectors: interactiveSelectors.slice(0, 20), formSelectors: formSelectors.slice(0, 20), notes: [] };
  }

  async healthCheck() { return { ok: true, mode: this.isolationMode }; }

  async browserClose() {
    const state = await this.stateStore.load();
    if (!state?.debugPort) return { ok: true as const, closed: false };
    let closed = false;
    try {
      const browser = await this.tryConnect(state.debugPort);
      await browser.close?.();
      closed = await this.waitForBrowserToClose(state.debugPort, 12);
    } catch {
      closed = await this.waitForBrowserToClose(state.debugPort, 4);
    }
    if (!closed) {
      closed = await this.cleanupProfileProcesses();
    }
    if (closed) {
      await this.stateStore.update((current) => ({ ...current, debugPort: undefined, wsEndpoint: undefined }));
    }
    return { ok: true as const, closed };
  }

  async authSync(): Promise<BrowserAuthSyncResult> {
    if (this.profileKind !== "session-clone") {
      return {
        ok: true,
        mode: this.isolationMode,
        profileKind: this.profileKind,
        profileDir: this.profileDir,
        baseProfileDir: this.baseProfileDir,
        synced: false,
        authSnapshotFilePath: this.getAuthSnapshotFilePath(),
        notice: "当前 session 不是 clone profile，无需执行认证同步。"
      };
    }

    let noticeParts: string[] = [];
    let exportedCookies = 0;
    let snapshotSynced = false;
    const state = await this.stateStore.load();
    const context = await this.ensurePage({ headless: state?.headless ?? false });
    try {
      exportedCookies = await this.exportAuthSnapshot(context.page);
      snapshotSynced = exportedCookies > 0;
      if (snapshotSynced) {
        noticeParts.push(`已导出 ${exportedCookies} 个 cookies 到认证快照。`);
      }
    } finally {
      await disconnectBrowser(context.browser);
    }

    let profileSynced = false;
    try {
      profileSynced = await this.syncSessionProfileBackToBaseProfile(this.profileDir);
      if (profileSynced) {
        noticeParts.push("已将当前 clone profile 的认证状态同步回 base profile。");
      }
    } catch (error) {
      if (!snapshotSynced) {
        throw error;
      }
      noticeParts.push("clone profile 文件复制失败，但认证快照已成功导出。");
    }

    const synced = snapshotSynced || profileSynced;
    const authSyncedAt = Date.now();
    if (synced) {
      await this.stateStore.update((current) => ({ ...current, authSyncedAt }));
    }
    return {
      ok: true as const,
      mode: this.isolationMode,
      profileKind: this.profileKind,
      profileDir: this.profileDir,
      baseProfileDir: this.baseProfileDir,
      synced,
      ...(synced ? { authSyncedAt: toIso(authSyncedAt) } : {}),
      authSnapshotFilePath: this.getAuthSnapshotFilePath(),
      ...(exportedCookies ? { exportedCookies } : {}),
      ...(noticeParts.length ? { notice: noticeParts.join(" ") } : {})
    };
  }

  async sessionPin(): Promise<BrowserSessionPinResult> {
    const pinnedAt = Date.now();
    await this.stateStore.update((state) => ({ ...state, pinned: true, pinnedAt }));
    return { ok: true, pinned: true, pinnedAt: toIso(pinnedAt), profileKind: this.profileKind, profileDir: this.profileDir };
  }

  async sessionUnpin(): Promise<BrowserSessionPinResult> {
    await this.stateStore.update((state) => ({ ...state, pinned: false, pinnedAt: undefined }));
    return { ok: true, pinned: false, profileKind: this.profileKind, profileDir: this.profileDir };
  }

  async browserStatus(): Promise<BrowserStatusResult> {
    const state = (await this.stateStore.load()) ?? {};
    const session = (await this.sessionStateStore.load()) ?? {};
    let running = false;
    let browser: BrowserLike | undefined;
    try {
      if (state.debugPort) {
        browser = await this.tryConnect(state.debugPort);
        running = true;
      }
    } catch {
      running = false;
    }
    let page = undefined as PageLike | undefined;
    if (running && browser) {
      page = await this.resolvePageForStatus(browser, session, state);
      await disconnectBrowser(browser);
    }
    const lifecycleStatus = this.resolveLifecycle(state.lastUsedAt, running);
    return {
      ok: true,
      running,
      mode: state.headless === false ? "headed" : "headless",
      profileDir: this.profileDir,
      profileKind: this.profileKind,
      ...(state.lastUsedAt ? { lastUsedAt: toIso(state.lastUsedAt) } : {}),
      ...(state.authSyncedAt ? { authSyncedAt: toIso(state.authSyncedAt) } : {}),
      ...(state.pinned ? { pinned: true } : {}),
      ...(state.pinnedAt ? { pinnedAt: toIso(state.pinnedAt) } : {}),
      lifecycleStatus,
      ...(formatCleanupEligibleAt(state.lastUsedAt) ? { cleanupEligibleAt: formatCleanupEligibleAt(state.lastUsedAt) } : {}),
      isolationMode: this.isolationMode,
      sessionIdentitySource: this.sessionIdentitySource,
      sessionIdentityReliable: this.sessionIdentityReliable,
      notice: this.isolationNotice,
      sessionId: this.sessionId,
      ...(state.debugPort ? { debugPort: state.debugPort } : {}),
      ...(state.wsEndpoint ? { wsEndpoint: state.wsEndpoint } : {}),
      ...(session.pageTargetId ? { pageTargetId: session.pageTargetId } : {}),
      ...((page ? safePageUrl(page) : session.pageUrl) ? { url: page ? safePageUrl(page) : session.pageUrl } : {}),
      ...((page ? await safePageTitle(page) : session.pageTitle) ? { title: page ? await safePageTitle(page) : session.pageTitle } : {})
    };
  }

  async sessionStatus(): Promise<BrowserSessionStatusResult> {
    return { ok: true, session: await this.describeSession(this.sessionScope, this.stateFilePath, this.sessionStateFilePath, true) };
  }

  async sessionList(): Promise<BrowserSessionListResult> {
    const metaDir = path.dirname(this.stateFilePath);
    const sessionDir = path.dirname(this.sessionStateFilePath);
    const scopes = new Set<string>([this.sessionScope]);
    try {
      for (const entry of await fs.readdir(metaDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".json")) scopes.add(entry.name.replace(/\.json$/i, ""));
      }
    } catch {}
    const sessions = await Promise.all(Array.from(scopes).map(async (scope) => {
      const metaPath = scope === this.sessionScope ? this.stateFilePath : path.join(metaDir, `${scope}.json`);
      const sessionPath = scope === this.sessionScope ? this.sessionStateFilePath : path.join(sessionDir, `${scope}.json`);
      return this.describeSession(scope, metaPath, sessionPath, scope === this.sessionScope);
    }));
    sessions.sort(compareSessions);
    return { ok: true, sessions };
  }

  async sessionCleanup(options: { maxAgeHours?: number } = {}): Promise<BrowserSessionCleanupResult> {
    const ttlHours = options.maxAgeHours ?? DEFAULT_CLEANUP_HOURS;
    const metaDir = path.join(this.globalAppDir, "sessions", "browser-meta");
    const sessionDir = path.join(this.globalAppDir, "sessions", "browser");
    const profileRoot = path.join(this.globalAppDir, "chrome-profiles");
    const removed: string[] = [];
    const kept: Array<{ sessionId: string; reason: string }> = [];
    let entries: string[] = [];
    try { entries = (await fs.readdir(metaDir)).filter((name) => name.endsWith(".json")); } catch { return { ok: true, ttlHours, removed, kept }; }
    for (const name of entries) {
      const scope = name.replace(/\.json$/i, "");
      const metaPath = path.join(metaDir, name);
      const sessionPath = path.join(sessionDir, `${scope}.json`);
      const state = await new BrowserStateStore(metaPath).load();
      if (!state) continue;
      const running = await this.isSessionBrowserStillRunning(metaPath);
      const lifecycle = this.resolveLifecycle(state.lastUsedAt, running, ttlHours);
      if (state.pinned) { kept.push({ sessionId: scope, reason: "pinned" }); continue; }
      if (running) { kept.push({ sessionId: scope, reason: lifecycle === "active" ? "running-active-browser" : "running-idle-browser" }); continue; }
      if (lifecycle !== "expired") { kept.push({ sessionId: scope, reason: lifecycle }); continue; }
      const cloneProfileDir = path.join(profileRoot, scope);
      await this.syncSessionProfileBackToBaseProfile(cloneProfileDir);
      await fs.rm(cloneProfileDir, { recursive: true, force: true });
      await fs.rm(metaPath, { force: true });
      await fs.rm(sessionPath, { force: true });
      removed.push(scope);
    }
    return { ok: true, ttlHours, removed, kept };
  }

  async open(url: string, options: BrowserLaunchOptions = {}): Promise<BrowserActionResult> {
    const context = await this.ensurePage(options);
    const page = context.page;
    const session = context.session ?? {} as BrowserSessionState;
    const state = context.state ?? {} as BrowserState;
    const beforeUrl = safePageUrl(page);
    const beforeTitle = await safePageTitle(page);
    try {
      if (pageAlreadyAtNavigationTarget(beforeUrl, beforeTitle, url)) {
        this.reportOpenProgress(options, "page reached");
        await this.persistState(context.browser, page, state, session);
        this.reportOpenProgress(options, "state saved");
        return this.actionResult(beforeUrl, beforeTitle, undefined, undefined, buildSignal(beforeUrl, beforeTitle, beforeUrl, beforeTitle));
      }
      this.reportOpenProgress(options, "navigating to target");
      await this.navigate(context.page, url);
      this.reportOpenProgress(options, "page reached");
      const nextUrl = safePageUrl(context.page);
      const nextTitle = await safePageTitle(context.page);
      await this.persistState(context.browser, page, state, session);
      this.reportOpenProgress(options, "state saved");
      return this.actionResult(nextUrl, nextTitle, undefined, undefined, buildSignal(beforeUrl, beforeTitle, nextUrl, nextTitle));
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async snapshot(options: { interactiveOnly?: boolean; selector?: string; maxItems?: number } = {}): Promise<BrowserSnapshotResult> {
    const context = await this.ensurePage();
    try {
      const page = context.page;
      const session = context.session ?? {} as BrowserSessionState;
      const state = context.state ?? {} as BrowserState;
      const data = await this.readSnapshotData(page, options);
      const result = buildSnapshot(data.elements as BrowserSnapshotInput[], { url: data.url, title: data.title });
      session.refs = (data.elements as any[])
        .filter((item) => item.interactive)
        .slice(0, options.maxItems ?? 200)
        .map((item, index) => ({
          ref: `@e${index + 1}`,
          selector: item.selector,
          selectors: item.selectors ?? [item.selector],
          text: item.text,
          tag: item.tag,
          placeholder: item.placeholder,
          role: item.role,
          ariaLabel: item.ariaLabel,
          href: item.href,
          name: item.name,
          inputType: item.inputType
        }));
      await this.persistState(context.browser, page, state, session);
      return result;
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async click(target: string, options: { timeoutMs?: number } = {}): Promise<BrowserActionResult> {
    const context = await this.ensurePage();
    const page = context.page;
    const session = context.session ?? {} as BrowserSessionState;
    const state = context.state ?? {} as BrowserState;
    const beforeUrl = safePageUrl(page);
    const beforeTitle = await safePageTitle(page);
    try {
      const page = context.page;
      const session = context.session ?? {} as BrowserSessionState;
      const state = context.state ?? {} as BrowserState;
      const resolved = await this.resolveTarget(target, session, page, state);
      const timeout = options.timeoutMs ?? 5000;
      await this.retryTransient(async () => {
        await context.page.waitForSelector?.(resolved.selector, { timeout, visible: true });
        await context.page.click(resolved.selector);
      }, async () => this.waitForPageReady(context.page));
      await this.waitForPageReady(context.page);
      const nextUrl = safePageUrl(context.page);
      const nextTitle = await safePageTitle(context.page);
      await this.persistState(context.browser, page, state, session);
      return withTargetMetadata(
        this.actionResult(nextUrl, nextTitle, resolved.selector, resolved.selectorCandidates, buildSignal(beforeUrl, beforeTitle, nextUrl, nextTitle)),
        resolved
      );
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async type(target: string, text: string, options: { delayMs?: number } = {}): Promise<BrowserActionResult> {
    const context = await this.ensurePage();
    const page = context.page;
    const session = context.session ?? {} as BrowserSessionState;
    const state = context.state ?? {} as BrowserState;
    const beforeUrl = safePageUrl(page);
    const beforeTitle = await safePageTitle(page);
    try {
      const page = context.page;
      const session = context.session ?? {} as BrowserSessionState;
      const state = context.state ?? {} as BrowserState;
      const resolved = await this.resolveTarget(target, session, page, state);
      await context.page.focus?.(resolved.selector);
      const beforeValue = await readInputValue(context.page, resolved.selector);
      await context.page.keyboard?.type?.(text, { delay: options.delayMs ?? 50 });
      const afterValue = await readInputValue(context.page, resolved.selector);
      if ((afterValue ?? "") === (beforeValue ?? "")) {
        await setInputValue(context.page, resolved.selector, text);
      }
      await this.waitForPageReady(context.page);
      const nextUrl = safePageUrl(context.page);
      const nextTitle = await safePageTitle(context.page);
      await this.persistState(context.browser, page, state, session);
      return withTargetMetadata(
        this.actionResult(nextUrl, nextTitle, resolved.selector, resolved.selectorCandidates, buildSignal(beforeUrl, beforeTitle, nextUrl, nextTitle)),
        resolved
      );
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async fill(target: string, text: string, options: { timeoutMs?: number } = {}): Promise<BrowserActionResult> {
    const context = await this.ensurePage();
    const page = context.page;
    const session = context.session ?? {} as BrowserSessionState;
    const state = context.state ?? {} as BrowserState;
    const beforeUrl = safePageUrl(page);
    const beforeTitle = await safePageTitle(page);
    try {
      const page = context.page;
      const session = context.session ?? {} as BrowserSessionState;
      const state = context.state ?? {} as BrowserState;
      const resolved = await this.resolveTarget(target, session, page, state);
      await context.page.waitForSelector?.(resolved.selector, { timeout: options.timeoutMs ?? 5000 });
      await context.page.focus?.(resolved.selector);
      await setInputValue(context.page, resolved.selector, text);
      await this.waitForPageReady(context.page);
      const nextUrl = safePageUrl(context.page);
      const nextTitle = await safePageTitle(context.page);
      await this.persistState(context.browser, page, state, session);
      return this.actionResult(nextUrl, nextTitle, resolved.selector, resolved.selectorCandidates, buildSignal(beforeUrl, beforeTitle, nextUrl, nextTitle));
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async press(key: string, options: { target?: string } = {}): Promise<BrowserActionResult> {
    const context = await this.ensurePage();
    const page = context.page;
    const session = context.session ?? {} as BrowserSessionState;
    const state = context.state ?? {} as BrowserState;
    const beforeUrl = safePageUrl(page);
    const beforeTitle = await safePageTitle(page);
    try {
      const resolved = options.target ? await this.resolveTarget(options.target, session, page, state) : undefined;
      if (resolved) await context.page.focus?.(resolved.selector);
      await context.page.keyboard?.press?.(key);
      if (key === "Enter" && resolved) await submitInput(context.page, resolved.selector);
      await this.waitForPageReady(context.page);
      const nextUrl = safePageUrl(context.page);
      const nextTitle = await safePageTitle(context.page);
      await this.persistState(context.browser, page, state, session);
      return withTargetMetadata(
        this.actionResult(nextUrl, nextTitle, resolved?.selector, resolved?.selectorCandidates, buildSignal(beforeUrl, beforeTitle, nextUrl, nextTitle)),
        resolved
      );
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async hover(target: string, options: { timeoutMs?: number } = {}): Promise<BrowserActionResult> {
    const context = await this.ensurePage();
    try {
      const page = context.page;
      const session = context.session ?? {} as BrowserSessionState;
      const state = context.state ?? {} as BrowserState;
      const resolved = await this.resolveTarget(target, session, page, state);
      await context.page.waitForSelector?.(resolved.selector, { timeout: options.timeoutMs ?? 5000 });
      await context.page.hover?.(resolved.selector);
      await this.persistState(context.browser, page, state, session);
      return this.actionResult(safePageUrl(context.page), await safePageTitle(context.page), resolved.selector, resolved.selectorCandidates);
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async scroll(targetOrDirection: string, amount?: number): Promise<BrowserActionResult> {
    const context = await this.ensurePage();
    const page = context.page;
    const session = context.session ?? {} as BrowserSessionState;
    const state = context.state ?? {} as BrowserState;
    try {
      if (["up", "down", "left", "right"].includes(targetOrDirection)) {
        const delta = amount ?? 800;
        await context.page.evaluate?.((direction: string, value: number) => {
          const x = direction === "left" ? -value : direction === "right" ? value : 0;
          const y = direction === "up" ? -value : direction === "down" ? value : 0;
          window.scrollBy(x, y);
        }, targetOrDirection, delta);
        await this.persistState(context.browser, page, state, session);
        return this.actionResult(safePageUrl(context.page), await safePageTitle(context.page));
      }
      const resolved = await this.resolveTarget(targetOrDirection, session, page, state);
      await context.page.$eval?.(resolved.selector, (node: any) => node.scrollIntoView({ block: "center", inline: "center" }));
      await this.persistState(context.browser, page, state, session);
      return this.actionResult(safePageUrl(context.page), await safePageTitle(context.page), resolved.selector, resolved.selectorCandidates);
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async screenshot(filePath?: string, options: { fullPage?: boolean } = {}): Promise<BrowserActionResult> {
    const context = await this.ensurePage();
    const page = context.page;
    const session = context.session ?? {} as BrowserSessionState;
    const state = context.state ?? {} as BrowserState;
    try {
      const targetPath = filePath ?? path.join(os.tmpdir(), `fast-browser-${Date.now()}.png`);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await context.page.screenshot?.({ path: targetPath, fullPage: options.fullPage ?? false });
      await this.persistState(context.browser, page, state, session);
      return { ...this.actionResult(safePageUrl(context.page), await safePageTitle(context.page)), path: targetPath };
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async evalExpression(expression: string): Promise<BrowserActionResult> {
    const context = await this.ensurePage();
    const page = context.page;
    const session = context.session ?? {} as BrowserSessionState;
    const state = context.state ?? {} as BrowserState;
    try {
      const value = await context.page.evaluate((source: string) => {
        // eslint-disable-next-line no-new-func
        return (new Function(`return (${source});`))();
      }, expression);
      await this.persistState(context.browser, page, state, session);
      return { ...this.actionResult(safePageUrl(context.page), await safePageTitle(context.page)), value };
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async goBack(): Promise<BrowserActionResult> {
    const context = await this.ensurePage();
    const page = context.page;
    const session = context.session ?? {} as BrowserSessionState;
    const state = context.state ?? {} as BrowserState;
    try {
      await context.page.goBack?.({ waitUntil: "domcontentloaded" });
      await this.waitForPageReady(context.page);
      await this.persistState(context.browser, page, state, session);
      return this.actionResult(safePageUrl(context.page), await safePageTitle(context.page));
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async goForward(): Promise<BrowserActionResult> {
    const context = await this.ensurePage();
    const page = context.page;
    const session = context.session ?? {} as BrowserSessionState;
    const state = context.state ?? {} as BrowserState;
    try {
      await context.page.goForward?.({ waitUntil: "domcontentloaded" });
      await this.waitForPageReady(context.page);
      await this.persistState(context.browser, page, state, session);
      return this.actionResult(safePageUrl(context.page), await safePageTitle(context.page));
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async reload(): Promise<BrowserActionResult> {
    const context = await this.ensurePage();
    const page = context.page;
    const session = context.session ?? {} as BrowserSessionState;
    const state = context.state ?? {} as BrowserState;
    try {
      await context.page.reload?.({ waitUntil: "domcontentloaded" });
      await this.waitForPageReady(context.page);
      await this.persistState(context.browser, page, state, session);
      return this.actionResult(safePageUrl(context.page), await safePageTitle(context.page));
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async getUrl(): Promise<string> {
    const context = await this.ensurePage();
    try { return safePageUrl(context.page); } finally { await disconnectBrowser(context.browser); }
  }

  async getTitle(): Promise<string> {
    const context = await this.ensurePage();
    try {
      const title = await this.retryTransient(async () => String(await context.page.title()), async () => this.waitForPageReady(context.page), 4);
      await context.page.title();
      return title;
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async wait(options: { ms?: number; text?: string; urlIncludes?: string; fn?: string }): Promise<BrowserActionResult> {
    const context = await this.ensurePage();
    const page = context.page;
    const session = context.session ?? {} as BrowserSessionState;
    const state = context.state ?? {} as BrowserState;
    try {
      if (options.ms !== undefined) await delay(options.ms);
      if (options.text) await context.page.waitForFunction?.((needle: string) => (document.body?.innerText || document.body?.textContent || "").includes(needle), {}, options.text);
      if (options.urlIncludes) await context.page.waitForFunction?.((needle: string) => window.location.href.includes(needle), {}, options.urlIncludes);
      if (options.fn) await context.page.waitForFunction?.((source: string) => {
        // eslint-disable-next-line no-new-func
        return Boolean((new Function(`return (${source});`))());
      }, {}, options.fn);
      await this.persistState(context.browser, page, state, session);
      return this.actionResult(safePageUrl(context.page), await safePageTitle(context.page));
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async waitUntilUrlContains(urlPart: string, options: { timeoutMs?: number } = {}): Promise<BrowserActionResult> {
    const context = await this.ensurePage();
    const page = context.page;
    const session = context.session ?? {} as BrowserSessionState;
    const state = context.state ?? {} as BrowserState;
    try {
      await context.page.waitForFunction?.((needle: string) => window.location.href.includes(needle), { timeout: options.timeoutMs ?? 5000 }, urlPart);
      await this.persistState(context.browser, page, state, session);
      return this.actionResult(safePageUrl(context.page), await safePageTitle(context.page));
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async waitForSelector(selector: string, options: { timeoutMs?: number; state?: "attached" | "visible" | "hidden" } = {}): Promise<BrowserActionResult> {
    const context = await this.ensurePage();
    const page = context.page;
    const session = context.session ?? {} as BrowserSessionState;
    const state = context.state ?? {} as BrowserState;
    try {
      await this.retryTransient(async () => context.page.waitForSelector?.(selector, { timeout: options.timeoutMs, visible: options.state === "visible" || undefined, hidden: options.state === "hidden" || undefined }), async () => this.waitForPageReady(context.page));
      await this.persistState(context.browser, page, state, session);
      return this.actionResult(safePageUrl(context.page), await safePageTitle(context.page), selector, [selector]);
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async handleGate(options: { text?: string } = {}): Promise<BrowserGateResult> {
    const context = await this.ensurePage();
    const page = context.page;
    const session = context.session ?? {} as BrowserSessionState;
    const state = context.state ?? {} as BrowserState;
    try {
      const data = await this.readSnapshotData(context.page, { interactiveOnly: true, maxItems: 100 });
      const needles = options.text ? [options.text] : GATE_HINTS;
      const matches = (data.elements as any[]).filter((item) => item.interactive && needles.some((needle) => String(item.text ?? "").includes(needle))).map((item) => ({ text: item.text, selector: item.selector }));
      if (matches[0]) {
        await context.page.click?.(matches[0].selector);
        await this.waitForPageReady(context.page);
      }
      await this.persistState(context.browser, page, state, session);
      return { ok: true, handled: matches[0] ? 1 : 0, matches: matches.slice(0, 1), url: safePageUrl(context.page), title: await safePageTitle(context.page) };
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async collect(selector: string, options: { limit?: number; scrollStep?: number; maxRounds?: number } = {}): Promise<BrowserCollectResult> {
    const context = await this.ensurePage();
    const page = context.page;
    const session = context.session ?? {} as BrowserSessionState;
    const state = context.state ?? {} as BrowserState;
    try {
      const limit = options.limit ?? 20;
      const maxRounds = options.maxRounds ?? 3;
      const scrollStep = options.scrollStep ?? 800;
      const items = new Map<string, { text: string; href?: string; selector?: string }>();
      let rounds = 0;
      while (rounds < maxRounds && items.size < limit) {
        rounds += 1;
        const beforeCount = items.size;
        const collected = await context.page.$$eval?.(selector, (nodes: any[], sourceSelector: string) => nodes.map((node, index) => ({ text: (node.innerText || node.textContent || "").trim().replace(/\s+/g, " "), href: node.href || node.getAttribute?.("href") || undefined, selector: `${sourceSelector}:nth-of-type(${index + 1})` })), selector) ?? [];
        for (const item of collected) {
          items.set(`${item.href ?? ""}|${item.text}|${item.selector ?? ""}`, item);
          if (items.size >= limit) break;
        }
        const added = items.size - beforeCount;
        if (items.size >= limit || added === 0) break;
        if (rounds < maxRounds) await context.page.evaluate?.((value: number) => window.scrollBy(0, value), scrollStep);
      }
      await this.persistState(context.browser, page, state, session);
      return { ok: true, selector, items: Array.from(items.values()).slice(0, limit), rounds, url: safePageUrl(context.page), title: await safePageTitle(context.page) };
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async extractBlocks(options: { selector?: string; limit?: number } = {}): Promise<BrowserExtractBlocksResult> {
    const context = await this.ensurePage();
    const page = context.page;
    const session = context.session ?? {} as BrowserSessionState;
    const state = context.state ?? {} as BrowserState;
    try {
      const result = await context.page.evaluate?.((selector: string, limit: number) => {
        const root = document.querySelector(selector) ?? document.body;
        const blocks = Array.from(root.querySelectorAll("section, article, div, li")).slice(0, limit).map((node) => ({ heading: (node.querySelector("h1,h2,h3,h4")?.textContent || "").trim() || undefined, text: (node.textContent || "").trim().replace(/\s+/g, " "), hrefs: Array.from(node.querySelectorAll("a[href]")).map((a) => (a as HTMLAnchorElement).href).slice(0, 10) })).filter((item) => item.text);
        return { blocks };
      }, options.selector ?? "article,main,.content", options.limit ?? 10);
      await this.persistState(context.browser, page, state, session);
      return { ok: true, blocks: result?.blocks ?? [], url: safePageUrl(context.page), title: await safePageTitle(context.page) };
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async tabList() {
    const context = await this.ensurePage();
    try {
      const session = context.session ?? {} as BrowserSessionState;
      const pages = await this.listBrowserPages(context.browser);
      const activeTargetId = session.pageTargetId ?? getPageTargetId(context.page);
      return { ok: true as const, tabs: await Promise.all(pages.map((page: PageLike) => this.toTabEntry(page, activeTargetId))) };
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async tabNew(url?: string) {
    const context = await this.ensurePage();
    try {
      const previousTargetId = context.session?.pageTargetId ?? getPageTargetId(context.page);
      const page = await this.createNewPage(context.browser);
      await this.installInstrumentation(page);
      if (url) await this.navigate(page, url);
      const session = context.session ?? {} as BrowserSessionState;
      const state = context.state ?? {} as BrowserState;
      const nextTargetId = getPageTargetId(page);
      if (previousTargetId && nextTargetId && previousTargetId !== nextTargetId) {
        session.previousPageTargetId = previousTargetId;
      }
      if (nextTargetId) {
        session.lastCreatedPageTargetId = nextTargetId;
      }
      session.pageTargetId = nextTargetId;
      session.pageUrl = safePageUrl(page);
      session.pageTitle = await safePageTitle(page);
      await this.persistState(context.browser, page, state, session);
      return { ok: true as const, tab: await this.toTabEntry(page, getPageTargetId(page)) };
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async tabSwitch(target: string) {
    const context = await this.ensurePage();
    try {
      const session = context.session ?? {} as BrowserSessionState;
      const resolvedTarget = this.resolveRelativeTabTarget(target, session);
      const page = await this.selectTab(await this.listBrowserPages(context.browser), resolvedTarget);
      if (!page) throw new FastBrowserError("FB_RUNTIME_001", `Tab ${target} not found`, "runtime");
      await page.bringToFront?.();
      await this.waitForPageReady(page);
      const state = context.state ?? {} as BrowserState;
      const nextTargetId = getPageTargetId(page);
      if (session.pageTargetId && nextTargetId && session.pageTargetId !== nextTargetId) {
        session.previousPageTargetId = session.pageTargetId;
      }
      session.pageTargetId = nextTargetId;
      session.pageUrl = safePageUrl(page);
      session.pageTitle = await safePageTitle(page);
      await this.persistState(context.browser, page, state, session);
      return { ok: true as const, tab: await this.toTabEntry(page, getPageTargetId(page)) };
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async tabClose(target?: string) {
    const context = await this.ensurePage();
    try {
      const session = context.session ?? {} as BrowserSessionState;
      const state = context.state ?? {} as BrowserState;
      const pages = await this.listBrowserPages(context.browser);
      const resolvedTarget = target ? this.resolveRelativeTabTarget(target, session) : undefined;
      const page = resolvedTarget ? await this.selectTab(pages, resolvedTarget) : context.page;
      if (!page) throw new FastBrowserError("FB_RUNTIME_001", `Tab ${target ?? "current"} not found`, "runtime");
      const closed = await this.toTabEntry(page, getPageTargetId(context.page));
      await page.close?.();
      const remaining = (await this.listBrowserPages(context.browser)).filter((item: PageLike) => getPageTargetId(item) !== closed.id);
      const next = remaining.find((item: PageLike) => !isBlankUrl(safePageUrl(item))) ?? remaining[0];
      if (next) {
        session.pageTargetId = getPageTargetId(next);
        session.pageUrl = safePageUrl(next);
        session.pageTitle = await safePageTitle(next);
        await this.persistState(context.browser, next, state, session);
      }
      return { ok: true as const, closed };
    } finally {
      await disconnectBrowser(context.browser);
    }
  }

  async consoleLogs(options: { clear?: boolean } = {}) {
    const session = (await this.sessionStateStore.load()) ?? {};
    const logs = session.consoleLogs ?? [];
    if (options.clear) await this.sessionStateStore.update((current) => ({ ...current, consoleLogs: [] }));
    return { logs };
  }

  async networkEntries(options: { clear?: boolean } = {}) {
    const session = (await this.sessionStateStore.load()) ?? {};
    const entries = session.networkEntries ?? [];
    if (options.clear) await this.sessionStateStore.update((current) => ({ ...current, networkEntries: [] }));
    return { entries };
  }

  async cookies(action: "list" | "set" | "clear" = "list", options: { name?: string; value?: string; url?: string } = {}) {
    const context = await this.ensurePage();
    try {
      if (action === "list") return await context.page.cookies?.() ?? [];
      if (action === "clear") {
        const existing = await context.page.cookies?.() ?? [];
        const targets = options.name ? existing.filter((item: any) => item.name === options.name) : existing;
        if (targets.length > 0) await context.page.deleteCookie?.(...targets);
        return { ok: true, removed: targets.length };
      }
      await context.page.setCookie?.({ name: options.name, value: options.value, url: options.url ?? safePageUrl(context.page) });
      return { ok: true };
    } finally { await disconnectBrowser(context.browser); }
  }

  async storage(kind: "localStorage" | "sessionStorage", action: "list" | "get" | "set" | "remove" | "clear" = "list", key?: string, value?: string) {
    const context = await this.ensurePage();
    try {
      return await context.page.evaluate((storageKind: string, storageAction: string, storageKey?: string, storageValue?: string) => {
        const storage = storageKind === "localStorage" ? window.localStorage : window.sessionStorage;
        if (storageAction === "list") {
          const entries: Record<string, string> = {};
          for (let index = 0; index < storage.length; index += 1) {
            const itemKey = storage.key(index);
            if (itemKey) entries[itemKey] = storage.getItem(itemKey) ?? "";
          }
          return { entries };
        }
        if (storageAction === "get") return { value: storageKey ? storage.getItem(storageKey) : null };
        if (storageAction === "set") { if (storageKey) storage.setItem(storageKey, storageValue ?? ""); return { ok: true }; }
        if (storageAction === "remove") { if (storageKey) storage.removeItem(storageKey); return { ok: true }; }
        storage.clear();
        return { ok: true };
      }, kind, action, key, value);
    } finally { await disconnectBrowser(context.browser); }
  }

  async performanceMetrics() {
    const context = await this.ensurePage();
    try { return await context.page.metrics?.() ?? {}; } finally { await disconnectBrowser(context.browser); }
  }

  async ensurePage(options: BrowserLaunchOptions = {}): Promise<EnsurePageResult> {
    if (!this.usesCustomStatePaths) {
      this.reportOpenProgress(options, "preparing profile");
      await this.ensureLegacyProfileMigrated(this.baseProfileDir);
      await this.ensureSessionProfileReady();
      this.reportOpenProgress(options, "profile ready");
    }
    let state = (await this.stateStore.load()) ?? {};
    let session = (await this.sessionStateStore.load()) ?? {};
    const requestedHeadless = options.headless ?? state.headless ?? false;

    let browser: BrowserLike | undefined;
    if (state.debugPort) {
      this.reportOpenProgress(options, "connecting to browser");
      try {
        browser = await this.tryConnect(state.debugPort);
        this.reportOpenProgress(options, "cdp connected");
      } catch {
        browser = undefined;
      }
    }
    if (browser && typeof state.headless === "boolean" && state.headless !== requestedHeadless) {
      await browser.close?.();
      await this.waitForBrowserToClose(state.debugPort!);
      browser = undefined;
      state = { ...state, debugPort: undefined, wsEndpoint: undefined, headless: requestedHeadless };
    }
    if (!browser) {
      const launch = async () => {
        const debugPort = allocateDebugPort();
        this.reportOpenProgress(options, "launching browser");
        await this.launchChrome(debugPort, requestedHeadless, this.profileDir);
        this.reportOpenProgress(options, "browser spawned");
        const connected = await this.connectWithRetry(debugPort);
        this.reportOpenProgress(options, "cdp connected");
        state = { ...state, debugPort, wsEndpoint: connected.wsEndpoint?.(), headless: requestedHeadless, launchedAt: state.launchedAt ?? Date.now() };
        return connected;
      };
      try {
        browser = await launch();
      } catch {
        await this.cleanupProfileProcesses();
        browser = await launch();
      }
    }

    const pages = await this.listBrowserPages(browser);
    const claimed = await this.loadClaimedPageTargetIds();
    let page = await this.selectExistingPage(pages, session, state, claimed);
    if (!page) page = pages.find((item: PageLike) => isBlankUrl(safePageUrl(item)) && !claimed.has(getPageTargetId(item) ?? ""));
    if (!page) page = await this.createNewPage(browser);

    await this.installInstrumentation(page);
    state = await this.hydrateSessionAuthFromSnapshot(page, state);
    session.pageTargetId = getPageTargetId(page) ?? session.pageTargetId;
    if (!isBlankUrl(safePageUrl(page))) {
      session.pageUrl = safePageUrl(page);
      session.pageTitle = await safePageTitle(page);
    }
    await this.cleanupOrphanBlankTabs(browser, session);
    this.reportOpenProgress(options, "page ready");
    await this.persistState(browser, page, state, session);
    return { browser, page, state, session };
  }

  async persistState(browser: BrowserLike, page: PageLike, state: BrowserState, session: BrowserSessionState): Promise<void> {
    const pageUrl = safePageUrl(page);
    const pageTitle = await safePageTitle(page);
    const pageTargetId = getPageTargetId(page);
    const now = Date.now();
    const storedSession = (await this.sessionStateStore.load()) ?? {};
    const nextState: BrowserState = { ...state, debugPort: state.debugPort, wsEndpoint: browser.wsEndpoint?.() ?? state.wsEndpoint, headless: state.headless, launchedAt: state.launchedAt ?? now, lastUsedAt: now, pinned: state.pinned, pinnedAt: state.pinnedAt, authSyncedAt: state.authSyncedAt, authHydratedAt: state.authHydratedAt };
    const nextSession: BrowserSessionState = {
      ...storedSession,
      ...session,
      updatedAt: now,
      refs: session.refs ?? storedSession.refs ?? [],
      consoleLogs: session.consoleLogs ?? storedSession.consoleLogs ?? [],
      networkEntries: session.networkEntries ?? storedSession.networkEntries ?? []
    };
    nextSession.previousPageTargetId = session.previousPageTargetId;
    nextSession.lastCreatedPageTargetId = session.lastCreatedPageTargetId;
    if (pageTargetId && !isBlankUrl(pageUrl)) {
      nextSession.pageTargetId = pageTargetId;
      nextSession.pageUrl = pageUrl;
      nextSession.pageTitle = pageTitle;
      nextState.lastNonBlankPageTargetId = pageTargetId;
      nextState.lastNonBlankPageUrl = pageUrl;
      nextState.lastNonBlankPageTitle = pageTitle;
    } else {
      nextSession.pageTargetId = nextSession.pageTargetId ?? nextState.lastNonBlankPageTargetId;
      nextSession.pageUrl = nextSession.pageUrl ?? nextState.lastNonBlankPageUrl;
      nextSession.pageTitle = nextSession.pageTitle ?? nextState.lastNonBlankPageTitle;
    }
    await this.stateStore.save(nextState);
    await this.sessionStateStore.save(nextSession);
  }

  async resolveTarget(
    target: string,
    session: BrowserSessionState,
    page: PageLike,
    state?: BrowserState
  ): Promise<{ selector: string; selectorCandidates: string[]; text?: string; placeholder?: string; role?: string; ariaLabel?: string }> {
    if (!target.startsWith("@e")) return { selector: target, selectorCandidates: [target] };
    const availableRefs = session.refs ?? (state as any)?.refs ?? [];
    let ref = availableRefs.find((item: any) => item.ref === target);
    if (!ref) {
      ref = await this.readRefFromMatchingSession(target, session);
      if (ref) session.refs = [...(session.refs ?? []), ref];
    }
    if (!ref) throw new FastBrowserError("FB_RUNTIME_001", `Unknown snapshot ref ${target}`, "runtime");
    const candidates = Array.from(new Set([ref.selector, ...(ref.selectors ?? [])].filter(Boolean)));
    for (const candidate of candidates) {
      if (await page.$?.(candidate)) {
        return {
          selector: candidate,
          selectorCandidates: candidates,
          ...(ref.text ? { text: ref.text } : {}),
          ...(ref.placeholder ? { placeholder: ref.placeholder } : {}),
          ...(ref.role ? { role: ref.role } : {}),
          ...(ref.ariaLabel ? { ariaLabel: ref.ariaLabel } : {})
        };
      }
    }
    if (ref.text) {
      const snapshot = await this.readSnapshotData(page, { interactiveOnly: true, maxItems: 100 });
      const matched = (snapshot.elements as any[]).find((item) => item.interactive && item.text === ref?.text && (!ref?.tag || item.tag === ref.tag));
      if (matched) {
        const nextRef = {
          ref: target,
          selector: matched.selector,
          selectors: matched.selectors,
          text: matched.text,
          tag: matched.tag,
          placeholder: matched.placeholder,
          role: matched.role,
          ariaLabel: matched.ariaLabel,
          href: matched.href,
          name: matched.name,
          inputType: matched.inputType
        };
        session.refs = upsertRef(session.refs ?? [], nextRef);
        return {
          selector: matched.selector,
          selectorCandidates: matched.selectors ?? [matched.selector],
          ...(matched.text ? { text: matched.text } : {}),
          ...(matched.placeholder ? { placeholder: matched.placeholder } : {}),
          ...(matched.role ? { role: matched.role } : {}),
          ...(matched.ariaLabel ? { ariaLabel: matched.ariaLabel } : {})
        };
      }
    }
    throw new FastBrowserError("FB_RUNTIME_001", `Unable to resolve snapshot ref ${target}`, "runtime");
  }

  async readSnapshotData(page: PageLike, options: { interactiveOnly?: boolean; selector?: string; maxItems?: number } = {}) {
    const source = createSnapshotEvaluatorSource();
    return await page.evaluate(
      ({ script, args }: { script: string; args: { interactiveOnly?: boolean; selector?: string; maxItems?: number } }) => {
        const factory = new Function(`return ${script};`);
        const evaluator = factory();
        return evaluator(args);
      },
      { script: source, args: options }
    );
  }

  async cleanupOrphanBlankTabs(browser: BrowserLike, session: BrowserSessionState): Promise<void> {
    const claimed = await this.loadClaimedPageTargetIds();
    for (const page of await this.listBrowserPages(browser)) {
      const id = getPageTargetId(page);
      if (!isBlankUrl(safePageUrl(page))) continue;
      if (!id || id === session.pageTargetId || claimed.has(id)) continue;
      await page.close?.();
    }
  }

  async installInstrumentation(page: PageLike): Promise<void> {
    try { await page.evaluateOnNewDocument?.("window.__FAST_BROWSER_INSTRUMENTED__=true;"); } catch {}
    const instrumentedPage = page as { __fastBrowserInstrumented?: boolean };
    if (instrumentedPage.__fastBrowserInstrumented) {
      return;
    }
    instrumentedPage.__fastBrowserInstrumented = true;
    page.on?.("console", async (message: any) => {
      await this.appendConsoleLog({
        type: String(message?.type?.() ?? "log"),
        text: String(message?.text?.() ?? ""),
        time: Date.now()
      });
    });
    page.on?.("response", async (response: any) => {
      await this.appendNetworkEntry({
        url: String(response?.url?.() ?? ""),
        method: String(response?.request?.()?.method?.() ?? "GET"),
        status: typeof response?.status?.() === "number" ? response.status() : undefined,
        resourceType: String(response?.request?.()?.resourceType?.() ?? ""),
        time: Date.now()
      });
    });
  }

  async waitForPageReady(page: PageLike): Promise<void> {
    try { await page.waitForFunction?.(() => document.readyState === "interactive" || document.readyState === "complete", { timeout: 5000 }); } catch {}
    try { await page.waitForNetworkIdle?.({ idleTime: 250, timeout: 5000 }); } catch {}
  }

  async ensureLegacyProfileMigrated(targetProfileDir = this.baseProfileDir): Promise<void> {
    try { await fs.access(targetProfileDir); return; } catch {}
    const legacyDir = path.join(getProjectRoot(), ".fast-browser", "chrome-profile");
    try { await fs.access(legacyDir); } catch { return; }
    await copyDir(legacyDir, targetProfileDir);
  }

  async tryConnect(debugPort: number): Promise<BrowserLike> {
    return await withTimeout(
      puppeteer.connect({ browserURL: `http://127.0.0.1:${debugPort}` }),
      1500,
      `Timed out connecting to browser debug port ${debugPort}`
    );
  }
  async connectWithRetry(debugPort: number, attempts = 20): Promise<BrowserLike> { let lastError: unknown; for (let i = 0; i < attempts; i += 1) { try { return await this.tryConnect(debugPort); } catch (error) { lastError = error; await delay(250); } } throw lastError; }
  async waitForBrowserToClose(debugPort: number, attempts = 20): Promise<boolean> { for (let i = 0; i < attempts; i += 1) { try { const browser = await this.tryConnect(debugPort); await disconnectBrowser(browser); } catch { return true; } await delay(250); } return false; }

  async launchChrome(debugPort: number, headless: boolean, profileDir: string): Promise<void> {
    await fs.mkdir(profileDir, { recursive: true });
    const executable = await resolveChromeExecutablePath();
    const args = [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-sync", "about:blank"];
    if (headless) args.unshift("--headless=new");
    const child = spawn(executable, args, { detached: true, stdio: "ignore", windowsHide: true });
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("spawn", () => resolve());
    });
    child.unref();
  }

  async cleanupProfileProcesses(): Promise<boolean> {
    if (process.platform !== "win32") return false;
    const profileDir = this.profileDir.replace(/'/g, "''");
    const script = [
      "$ErrorActionPreference='SilentlyContinue'",
      `$profileDir='${profileDir}'`,
      "$ids = @(Get-CimInstance Win32_Process | Where-Object { ($_.Name -in @('chrome.exe','msedge.exe')) -and $_.CommandLine -and ($_.CommandLine -like ('*' + $profileDir + '*')) } | Select-Object -ExpandProperty ProcessId)",
      "if ($ids.Count -gt 0) { Stop-Process -Id $ids -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500; 'closed' } else { 'none' }"
    ].join('; ');
    const output = await runPowerShell(script);
    return output.includes("closed");
  }

  private async ensureSessionProfileReady(): Promise<void> {
    if (this.profileKind !== "session-clone") { await fs.mkdir(this.profileDir, { recursive: true }); return; }
    try { await fs.access(this.profileDir); return; } catch {}
    await fs.mkdir(path.dirname(this.profileDir), { recursive: true });
    try { await fs.access(this.baseProfileDir); await copyDir(this.baseProfileDir, this.profileDir); } catch { await fs.mkdir(this.profileDir, { recursive: true }); }
  }

  private async syncSessionProfileBackToBaseProfile(sourceProfileDir: string): Promise<boolean> {
    let synced = false;
    for (const relative of AUTH_FILES) if (await copyIfExists(path.join(sourceProfileDir, relative), path.join(this.baseProfileDir, relative))) synced = true;
    return synced;
  }

  private getAuthSnapshotFilePath(): string {
    return path.join(this.globalAppDir, "sessions", "browser-auth.json");
  }

  private async exportAuthSnapshot(page: PageLike): Promise<number> {
    const cdp = await this.createCDPSession(page);
    if (!cdp) return 0;
    try {
      await cdp.send("Network.enable");
      const result = await cdp.send("Network.getAllCookies");
      const cookies = Array.isArray(result?.cookies) ? result.cookies : [];
      await fs.mkdir(path.dirname(this.getAuthSnapshotFilePath()), { recursive: true });
      await fs.writeFile(this.getAuthSnapshotFilePath(), JSON.stringify({ updatedAt: Date.now(), cookies }, null, 2), "utf8");
      return cookies.length;
    } finally {
      try { await cdp.detach?.(); } catch {}
    }
  }

  private async hydrateSessionAuthFromSnapshot(page: PageLike, state: BrowserState): Promise<BrowserState> {
    if (this.profileKind !== "session-clone" || state.authHydratedAt) return state;
    const snapshot = await this.readAuthSnapshot();
    if (!snapshot?.cookies?.length) return state;
    const cdp = await this.createCDPSession(page);
    if (!cdp) return state;
    try {
      await cdp.send("Network.enable");
      await cdp.send("Network.setCookies", { cookies: snapshot.cookies });
      return { ...state, authHydratedAt: Date.now() };
    } catch {
      return state;
    } finally {
      try { await cdp.detach?.(); } catch {}
    }
  }

  private async readAuthSnapshot(): Promise<{ updatedAt?: number; cookies?: any[] } | null> {
    try {
      const raw = await fs.readFile(this.getAuthSnapshotFilePath(), "utf8");
      const parsed = JSON.parse(stripBom(raw));
      if (!parsed || !Array.isArray(parsed.cookies)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async createCDPSession(page: PageLike): Promise<any | undefined> {
    try {
      return await page.target?.().createCDPSession?.();
    } catch {
      return undefined;
    }
  }

  private async listBrowserPages(browser: BrowserLike): Promise<PageLike[]> { return await this.retryTransient(async () => await browser.pages(), undefined, 2, isTargetAttachError); }
  private async createNewPage(browser: BrowserLike): Promise<PageLike> { return await this.retryTransient(async () => await browser.newPage(), undefined, 2, isTargetAttachError); }

  private async selectExistingPage(pages: PageLike[], session: BrowserSessionState, state: BrowserState, claimed: Set<string>) {
    if (session.pageTargetId) {
      const found = pages.find((page) => getPageTargetId(page) === session.pageTargetId);
      if (found && (!isBlankUrl(safePageUrl(found)) || this.isRecentBlankSessionPage(session))) return found;
    }
    if (session.pageUrl && !isBlankUrl(session.pageUrl)) {
      const found = pages.find((page) => safePageUrl(page) === session.pageUrl);
      if (found) return found;
    }
    if (state.lastNonBlankPageTargetId || state.lastNonBlankPageUrl) {
      const found = pages.find((page) => getPageTargetId(page) === state.lastNonBlankPageTargetId || safePageUrl(page) === state.lastNonBlankPageUrl);
      if (found) return found;
    }
    return pages.find((page) => !claimed.has(getPageTargetId(page) ?? "") && !isBlankUrl(safePageUrl(page)));
  }

  private async resolvePageForStatus(browser: BrowserLike, session: BrowserSessionState, state: BrowserState) { return await this.selectExistingPage(await this.listBrowserPages(browser), session, state, new Set()); }
  private isRecentBlankSessionPage(session: BrowserSessionState): boolean { return Boolean(session.updatedAt && Date.now() - session.updatedAt <= ACTIVE_WINDOW_MS); }
  private resolveLifecycle(lastUsedAt?: number, running = false, ttlHours = DEFAULT_CLEANUP_HOURS): BrowserLifecycleStatus { if (!lastUsedAt) return running ? "active" : "idle"; const ageMs = Date.now() - lastUsedAt; if (running && ageMs <= ACTIVE_WINDOW_MS) return "active"; if (ageMs > ttlHours * 60 * 60 * 1000) return "expired"; return "idle"; }

  private async describeSession(scope: string, metaPath: string, sessionPath: string, current: boolean): Promise<BrowserSessionStatusEntry> {
    const state = (await new BrowserStateStore(metaPath).load()) ?? {};
    const session = (await new BrowserSessionStateStore(sessionPath).load()) ?? {};
    const running = await this.isSessionBrowserStillRunning(metaPath);
    return { sessionId: current ? this.sessionId : scope, sessionScope: scope, current, running, profileKind: "session-clone", profileDir: path.join(this.globalAppDir, "chrome-profiles", scope), browserStateFilePath: metaPath, sessionStateFilePath: sessionPath, ...(state.lastUsedAt ? { lastUsedAt: toIso(state.lastUsedAt) } : {}), ...(state.authSyncedAt ? { authSyncedAt: toIso(state.authSyncedAt) } : {}), ...(state.pinned ? { pinned: true } : {}), ...(state.pinnedAt ? { pinnedAt: toIso(state.pinnedAt) } : {}), lifecycleStatus: this.resolveLifecycle(state.lastUsedAt, running), ...(formatCleanupEligibleAt(state.lastUsedAt) ? { cleanupEligibleAt: formatCleanupEligibleAt(state.lastUsedAt) } : {}), isolationMode: this.isolationMode, ...(current ? { sessionIdentitySource: this.sessionIdentitySource, sessionIdentityReliable: this.sessionIdentityReliable, notice: this.isolationNotice } : {}), ...(session.pageTargetId ? { pageTargetId: session.pageTargetId } : {}), ...(session.pageUrl ? { url: session.pageUrl } : {}), ...(session.pageTitle ? { title: session.pageTitle } : {}) };
  }

  private async isSessionBrowserStillRunning(metaPath = this.stateFilePath): Promise<boolean> {
    const state = await new BrowserStateStore(metaPath).load();
    if (!state?.debugPort) return false;
    try { const browser = await this.tryConnect(state.debugPort); await disconnectBrowser(browser); return true; } catch { return false; }
  }

  private async loadClaimedPageTargetIds(): Promise<Set<string>> {
    const claimed = new Set<string>();
    try {
      for (const name of await fs.readdir(path.dirname(this.sessionStateFilePath))) {
        if (!name.endsWith(".json")) continue;
        const state = await new BrowserSessionStateStore(path.join(path.dirname(this.sessionStateFilePath), name)).load();
        if (state?.pageTargetId) claimed.add(state.pageTargetId);
      }
    } catch {}
    return claimed;
  }

  private async readRefFromMatchingSession(target: string, currentSession: BrowserSessionState) {
    try {
      for (const name of await fs.readdir(path.dirname(this.sessionStateFilePath))) {
        const filePath = path.join(path.dirname(this.sessionStateFilePath), name);
        if (!name.endsWith(".json") || filePath === this.sessionStateFilePath) continue;
        const state = await new BrowserSessionStateStore(filePath).load();
        if (!state?.refs?.length) continue;
        const samePage = Boolean((currentSession.pageTargetId && state.pageTargetId === currentSession.pageTargetId) || (currentSession.pageUrl && state.pageUrl === currentSession.pageUrl));
        if (!samePage) continue;
        const ref = state.refs.find((item) => item.ref === target);
        if (ref) return ref;
      }
    } catch {}
    return undefined;
  }

  private actionResult(url: string, title?: string, selector?: string, selectorCandidates?: string[], signal?: BrowserActionSignal): BrowserActionResult {
    return { ok: true, url, ...(title ? { title } : {}), ...(selector ? { selector } : {}), ...(selectorCandidates?.length ? { selectorCandidates } : {}), ...(signal ? { signal } : {}), isolationMode: this.isolationMode, sessionIdentitySource: this.sessionIdentitySource, sessionIdentityReliable: this.sessionIdentityReliable, notice: this.isolationNotice };
  }

  private async retryTransient<T>(operation: () => Promise<T>, recover?: () => Promise<void>, attempts = 2, matcher: (error: unknown) => boolean = isTransientError): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < attempts; i += 1) {
      try { return await operation(); } catch (error) { lastError = error; if (!matcher(error) || i === attempts - 1) break; if (recover) await recover(); }
    }
    throw lastError;
  }

  private async toTabEntry(page: PageLike, activeTargetId?: string) { const id = getPageTargetId(page) ?? "unknown"; return { id, url: safePageUrl(page), title: await safePageTitle(page), active: Boolean(activeTargetId && activeTargetId === id) }; }
  private async selectTab(pages: PageLike[], target: string) { if (/^\d+$/.test(target)) return pages[Number(target) - 1]; return pages.find((page) => getPageTargetId(page) === target || safePageUrl(page).includes(target)); }
  private resolveRelativeTabTarget(target: string, session: BrowserSessionState): string {
    if (target === "previous") {
      return session.previousPageTargetId ?? target;
    }
    if (target === "lastCreated") {
      return session.lastCreatedPageTargetId ?? target;
    }
    return target;
  }
  private reportOpenProgress(options: BrowserLaunchOptions | undefined, message: string): void {
    try {
      options?.onProgress?.(message);
    } catch {}
  }

  private async appendConsoleLog(entry: BrowserConsoleEntry): Promise<void> {
    await this.sessionStateStore.update((current) => ({
      ...current,
      consoleLogs: [...(current.consoleLogs ?? []), entry].slice(-200)
    }));
  }

  private async appendNetworkEntry(entry: BrowserNetworkEntry): Promise<void> {
    await this.sessionStateStore.update((current) => ({
      ...current,
      networkEntries: [...(current.networkEntries ?? []), entry].slice(-200)
    }));
  }

  private async navigate(page: PageLike, url: string) {
    try {
      await this.retryTransient(async () => {
        await page.goto?.(url, { waitUntil: "domcontentloaded" });
      }, undefined, 2, isMainFrameTooEarlyError);
    } catch (error) {
      if (!(await this.shouldTreatNavigationTimeoutAsSuccess(page, url, error))) throw error;
    }
    await this.waitForPageReady(page);
  }

  private async shouldTreatNavigationTimeoutAsSuccess(page: PageLike, url: string, error: unknown): Promise<boolean> {
    if (!isNavigationTimeoutError(error)) return false;
    const currentUrl = safePageUrl(page);
    if (!currentUrl || isBlankUrl(currentUrl) || !matchesNavigationTarget(url, currentUrl)) return false;
    const currentTitle = await safePageTitle(page);
    return Boolean(currentTitle);
  }
}

function getPageTargetId(page: PageLike): string | undefined { try { return page?.target?.()?._targetId; } catch { return undefined; } }
function safePageUrl(page: PageLike): string { try { return String(page?.url?.() ?? ""); } catch { return ""; } }
async function safePageTitle(page: PageLike): Promise<string> { try { return String(await page?.title?.() ?? ""); } catch { return ""; } }
function isBlankUrl(url?: string): boolean { return !url || url === "about:blank"; }
function buildSignal(beforeUrl?: string, beforeTitle?: string, afterUrl?: string, afterTitle?: string): BrowserActionSignal { return { settled: true, urlChanged: Boolean(beforeUrl !== undefined && afterUrl !== undefined && beforeUrl !== afterUrl), titleChanged: Boolean(beforeTitle !== undefined && afterTitle !== undefined && beforeTitle !== afterTitle) }; }
function toIso(value: number): string { return new Date(value).toISOString(); }
function formatCleanupEligibleAt(lastUsedAt?: number, ttlHours = DEFAULT_CLEANUP_HOURS): string | undefined { return lastUsedAt ? toIso(lastUsedAt + ttlHours * 60 * 60 * 1000) : undefined; }
function compareSessions(a: BrowserSessionStatusEntry, b: BrowserSessionStatusEntry) { if (a.current !== b.current) return a.current ? -1 : 1; return a.sessionId.localeCompare(b.sessionId); }
async function disconnectBrowser(browser: BrowserLike | undefined): Promise<void> { try { await browser?.disconnect?.(); } catch {} }
function isTransientError(error: unknown): boolean { const message = String((error as Error)?.message ?? error ?? ""); return TRANSIENT_ERRORS.some((pattern) => message.includes(pattern)); }
function isTargetAttachError(error: unknown): boolean { return String((error as Error)?.message ?? error ?? "").includes("Target.attachToTarget"); }
function isMainFrameTooEarlyError(error: unknown): boolean { return String((error as Error)?.message ?? error ?? "").includes("Requesting main frame too early"); }
function isNavigationTimeoutError(error: unknown): boolean {
  const message = String((error as Error)?.message ?? error ?? "");
  return (error as Error | undefined)?.name === "TimeoutError" || message.includes("Navigation timeout");
}
function matchesNavigationTarget(targetUrl: string, currentUrl: string): boolean {
  try {
    const target = new URL(targetUrl);
    const current = new URL(currentUrl);
    return target.origin === current.origin && normalizeComparableUrl(target) === normalizeComparableUrl(current);
  } catch {
    return currentUrl === targetUrl;
  }
}
function pageAlreadyAtNavigationTarget(currentUrl: string, currentTitle: string, targetUrl: string): boolean {
  return Boolean(currentTitle) && !isBlankUrl(currentUrl) && matchesNavigationTarget(targetUrl, currentUrl);
}
function normalizeComparableUrl(value: URL): string {
  const pathname = value.pathname.replace(/\/+$/, "") || "/";
  return `${pathname}${value.search}`;
}
async function readInputValue(page: PageLike, selector: string): Promise<string> { try { return await page.$eval?.(selector, (node: any) => node?.value ?? "") ?? ""; } catch { return ""; } }
async function setInputValue(page: PageLike, selector: string, value: string): Promise<void> {
  await page.$eval?.(selector, (node: any, nextValue: string) => {
    const element = node as {
      value?: string;
      dispatchEvent?: (event: Event) => void;
      ownerDocument?: { defaultView?: Window };
    };
    const proto = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    descriptor?.set?.call(element, nextValue);
    const eventCtor = (((element.ownerDocument?.defaultView as { Event?: typeof Event } | undefined)?.Event) ?? Event) as typeof Event;
    element.dispatchEvent?.(new eventCtor("input", { bubbles: true }));
    element.dispatchEvent?.(new eventCtor("change", { bubbles: true }));
  }, value);
}
async function submitInput(page: PageLike, selector: string): Promise<void> { try { await page.$eval?.(selector, (node: any) => { const form = (node as HTMLElement).closest("form") as HTMLFormElement | null; if (!form) return; if (typeof form.requestSubmit === "function") form.requestSubmit(); else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); } catch {} }
function withTargetMetadata(
  result: BrowserActionResult,
  resolved?: { text?: string; placeholder?: string; role?: string; ariaLabel?: string }
): BrowserActionResult {
  if (!resolved) {
    return result;
  }
  return {
    ...result,
    ...(resolved.text ? { text: resolved.text } : {}),
    ...(resolved.placeholder ? { placeholder: resolved.placeholder } : {}),
    ...(resolved.role ? { role: resolved.role } : {}),
    ...(resolved.ariaLabel ? { ariaLabel: resolved.ariaLabel } : {})
  };
}
function upsertRef(
  refs: Array<{ ref: string; selector: string; selectors?: string[]; text?: string; tag?: string; placeholder?: string; role?: string; ariaLabel?: string; href?: string; name?: string; inputType?: string }>,
  nextRef: { ref: string; selector: string; selectors?: string[]; text?: string; tag?: string; placeholder?: string; role?: string; ariaLabel?: string; href?: string; name?: string; inputType?: string }
) { return [...refs.filter((item) => item.ref !== nextRef.ref), nextRef]; }
async function copyIfExists(from: string, to: string): Promise<boolean> { try { await fs.access(from); } catch { return false; } await fs.mkdir(path.dirname(to), { recursive: true }); await fs.copyFile(from, to); return true; }
async function copyDir(from: string, to: string): Promise<void> { await fs.mkdir(to, { recursive: true }); for (const entry of await fs.readdir(from, { withFileTypes: true })) { if (PROFILE_SKIP.has(entry.name)) continue; const src = path.join(from, entry.name); const dest = path.join(to, entry.name); if (entry.isDirectory()) await copyDir(src, dest); else if (entry.isFile()) { await fs.mkdir(path.dirname(dest), { recursive: true }); await fs.copyFile(src, dest); } } }
async function resolveChromeExecutablePath(): Promise<string> { const candidates = process.platform === "win32" ? [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", path.join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"), "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"] : process.platform === "darwin" ? [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"] : [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium"]; for (const candidate of candidates) { if (!candidate) continue; try { await fs.access(candidate); return candidate; } catch {} } throw new FastBrowserError("FB_RUNTIME_001", "Chrome executable not found", "runtime"); }
function allocateDebugPort(): number { return 40000 + Math.floor(Math.random() * 10000); }
function selectorForNode(node: any, fallbackTag: string): string | null { const id = node.attribs?.id; if (id) return `#${id}`; const dataTestId = node.attribs?.["data-testid"]; if (dataTestId) return `${fallbackTag}[data-testid=\"${dataTestId}\"]`; const name = node.attribs?.name; if (name) return `${fallbackTag}[name=\"${name}\"]`; return fallbackTag; }
function stripBom(value: string): string { return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value; }
async function runPowerShell(command: string): Promise<string> {
  return await new Promise((resolve) => {
    const child = spawn("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", ["-Command", command], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", () => resolve(""));
    child.on("close", () => resolve(output.trim()));
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new FastBrowserError("FB_RUNTIME_001", message, "runtime")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }




