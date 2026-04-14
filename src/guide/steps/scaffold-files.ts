import type { AdapterArg, AdapterManifest, BrowserRuntimeInspectResult, GuidePageKind } from "../../shared/types";

function toIdentifier(commandName: string): string {
  return commandName
    .replace(/[-_]+([a-zA-Z0-9])/g, (_, char: string) => char.toUpperCase())
    .replace(/^[A-Z]/, (char) => char.toLowerCase());
}

function createArgExtraction(arg: AdapterArg): string {
  const accessor = `params.${arg.name}`;
  if (arg.type === "number") {
    return `const ${arg.name} = ${accessor} === undefined ? undefined : Number(${accessor});`;
  }
  if (arg.type === "boolean") {
    return `const ${arg.name} = Boolean(${accessor});`;
  }
  return `const ${arg.name} = typeof ${accessor} === "string" ? ${accessor} : undefined;`;
}

function createInputShape(args: AdapterArg[]): string {
  if (args.length === 0) {
    return "params";
  }
  return `{ ${args.map((arg) => arg.name).join(", ")} }`;
}

function createCommandSource(commandName: string, endpoint: string | undefined, args: AdapterArg[], pageKind?: GuidePageKind): string {
  const identifier = toIdentifier(commandName);
  const argExtraction = args.map(createArgExtraction).join("\n  ");
  const inputShape = createInputShape(args);
  const guideHints = [
    `// Guide inference: pageKind=${pageKind ?? "generic"}`,
    args.length > 0 ? `// Guide inference: args=${args.map((arg) => arg.name).join(", ")}` : "// Guide inference: no command args inferred",
    "// Prefer stable direct routes and explicit success signals over homepage clicks or snapshot refs.",
    "// After validating this command, run fast-browser trace current --json before promoting flow/case."
  ].join("\n  ");
  const inputBinding = argExtraction
    ? `${argExtraction}
  const input = ${inputShape};`
    : "const input = params;";
  const networkBody = endpoint
    ? `const endpoint = ${JSON.stringify(endpoint)};
  ${guideHints}
  ${inputBinding}
  // TODO: Thread inferred args into endpoint construction when adapting this command.
  const data = await context.runtime.fetchJson(endpoint);
  return {
    items: Array.isArray((data as { items?: unknown[] }).items) ? (data as { items?: unknown[] }).items : data,
    input
  };`
    : `const targetUrl = typeof params.url === "string" ? params.url : String(manifest.homepage ?? "");
  ${guideHints}
  ${inputBinding}
  // TODO: Thread inferred args into URL construction or DOM selection when adapting this command.
  const html = await context.runtime.fetchHtml(targetUrl);
  return {
    htmlLength: html.length,
    input
  };`;

  return `import type { AdapterContext } from "../../src/shared/types";

export async function ${identifier}(params: Record<string, unknown>, context: AdapterContext, manifest: { homepage?: string }) {
  ${networkBody}
}
`;
}

function createFlowParams(args: AdapterArg[]): Record<string, string> | undefined {
  if (args.length === 0) {
    return undefined;
  }

  return Object.fromEntries(args.map((arg) => [arg.name, `\${params.${arg.name}}`]));
}

function createFlowSource(
  manifest: AdapterManifest,
  commandName: string,
  args: AdapterArg[],
  inspection?: BrowserRuntimeInspectResult
): string {
  const flowParams = createFlowParams(args);
  const initialUrl = inspection?.finalUrl ?? manifest.homepage;
  const starterSelector = inspection?.formSelectors[0] ?? inspection?.interactiveSelectors[0];
  const steps: Array<Record<string, unknown>> = [];

  if (initialUrl) {
    steps.push({
      type: "builtin",
      command: "open",
      with: {
        url: initialUrl
      }
    });
  }

  if (starterSelector) {
    steps.push({
      type: "builtin",
      command: "waitForSelector",
      with: {
        selector: starterSelector,
        state: "visible"
      }
    });
  }

  steps.push({
    type: "site",
    command: `${manifest.id}/${commandName}`,
    ...(flowParams ? { with: flowParams } : {})
  });

  const success: Array<Record<string, unknown>> = [];
  if (initialUrl) {
    const stablePath = (() => {
      try {
        const parsed = new URL(initialUrl);
        return `${parsed.pathname}${parsed.search}`;
      } catch {
        return undefined;
      }
    })();
    if (stablePath) {
      success.push({
        type: "urlIncludes",
        value: stablePath
      });
    }
  }
  if (starterSelector) {
    success.push({
      type: "selectorVisible",
      value: starterSelector
    });
  }
  success.push({
    type: "titleNotEmpty"
  });

  const flow = {
    id: commandName,
    kind: "flow" as const,
    goal: manifest.commands.find((command) => command.name === commandName)?.description ?? manifest.description,
    params: args,
    steps,
    success
  };

  return `${JSON.stringify(flow, null, 2)}\n`;
}

function createIndexSource(platform: string, commandName: string): string {
  const identifier = toIdentifier(commandName);

  return `import manifest from "./manifest.json";
import type { Adapter, AdapterContext } from "../../src/shared/types";
import { ${identifier} } from "./commands/${commandName}";

export const adapter: Adapter = {
  manifest,
  async execute(commandName, params, context: AdapterContext) {
    if (commandName !== ${JSON.stringify(commandName)}) {
      return {
        success: false,
        error: {
          code: "FB_ADAPTER_001",
          message: \`Command \${commandName} not found\`,
          stage: "adapter",
          retryable: false
        },
        meta: {
          adapterId: ${JSON.stringify(platform)},
          commandName,
          cached: false,
          timingMs: 0
        }
      };
    }

    const data = await ${identifier}(params, context, this.manifest);
    return {
      success: true,
      data,
      meta: {
        adapterId: ${JSON.stringify(platform)},
        commandName,
        cached: false,
        timingMs: 0
      }
    };
  }
};

export default adapter;
`;
}

export function scaffoldFiles(
  manifest: AdapterManifest,
  commandName: string,
  endpoint?: string,
  args: AdapterArg[] = [],
  inspection?: BrowserRuntimeInspectResult
): Record<string, string> {
  return {
    [`src/adapters/${manifest.id}/manifest.json`]: `${JSON.stringify(manifest, null, 2)}\n`,
    [`src/adapters/${manifest.id}/index.ts`]: createIndexSource(manifest.id, commandName),
    [`src/adapters/${manifest.id}/commands/${commandName}.ts`]: createCommandSource(commandName, endpoint, args, inspection?.pageKind),
    [`src/adapters/${manifest.id}/flows/${commandName}.flow.json`]: createFlowSource(manifest, commandName, args, inspection)
  };
}