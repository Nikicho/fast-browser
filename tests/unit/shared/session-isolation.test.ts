import { describe, expect, it } from "vitest";

import { inferSessionIsolation } from "../../../src/shared/session-isolation";

describe("inferSessionIsolation", () => {
  it("keeps explicit tool env ids on shared mode", () => {
    expect(inferSessionIsolation("codex:thread-123")).toMatchObject({
      mode: "session-clone",
      source: "tool-env",
      reliable: true
    });
  });

  it("uses session-clone mode for Windows host+shell fallbacks", () => {
    expect(inferSessionIsolation("opencode:opencode-cli-exe-26392-bash-exe-43404")).toMatchObject({
      mode: "session-clone",
      source: "windows-host-shell",
      reliable: false
    });
  });

  it("uses session-clone mode for shell fallbacks", () => {
    expect(inferSessionIsolation("shell:powershell-exe-26992")).toMatchObject({
      mode: "session-clone",
      source: "windows-shell",
      reliable: false
    });
  });

  it("uses session-clone mode for ppid fallbacks", () => {
    expect(inferSessionIsolation("ppid:52492")).toMatchObject({
      mode: "session-clone",
      source: "ppid",
      reliable: false
    });
  });
});
