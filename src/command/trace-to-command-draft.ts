import type {
  AdapterArg,
  AdapterCommand,
  CommandDraftDefinition,
  ExecutionTraceCurrentResult,
  ExecutionTraceCurrentStep
} from "../shared/types";
import { FastBrowserError } from "../shared/errors";

export function buildCommandDraftFromTrace(
  site: string,
  id: string,
  goal: string,
  current: ExecutionTraceCurrentResult
): CommandDraftDefinition {
  const entry = selectStableCommandCandidate(current.entries);
  if (!entry) {
    throw new FastBrowserError(
      "FB_COMMAND_001",
      `No stable command candidate was found in the latest successful trace for ${site}.`,
      "command"
    );
  }

  const args = inferCommandArgs(entry);
  const selector = readSelector(entry);
  const command = buildSuggestedManifestCommand(site, id, goal, args);
  const inputTemplate = buildInputTemplate(entry, args);
  const suggestedExport = toIdentifier(id);
  const suggestedFile = `src/adapters/${site}/commands/${id}.ts`;

  return {
    id,
    kind: "command-draft",
    site,
    goal,
    command,
    source: {
      tracePath: current.path,
      ...(current.startMarker ? { startMarkerId: current.startMarker.id } : {}),
      ...(current.endMarker ? { endMarkerId: current.endMarker.id } : {}),
      entry
    },
    implementation: {
      suggestedFile,
      suggestedExport,
      suggestedManifestCommand: command,
      suggestedSource: {
        path: suggestedFile,
        content: createCommandSource({ exportName: suggestedExport, entry, args, selector })
      },
      ...(selector ? { selector } : {}),
      ...(inputTemplate ? { inputTemplate } : {}),
      wiringNotes: buildWiringNotes(site, id, suggestedExport),
      notes: buildImplementationNotes(entry)
    }
  };
}

function selectStableCommandCandidate(entries: ExecutionTraceCurrentStep[]): ExecutionTraceCurrentStep | undefined {
  return [...entries].reverse().find((entry) => isStableCommandCandidate(entry));
}

function isStableCommandCandidate(entry: ExecutionTraceCurrentStep): boolean {
  if (!entry.commandCandidate) {
    return false;
  }

  switch (entry.command) {
    case "click":
    case "fill":
    case "type":
    case "hover":
      return Boolean(readSelector(entry));
    case "press":
      return typeof entry.input[0] === "string" && entry.input[0].trim().length > 0 && Boolean(readSelector(entry));
    case "scroll": {
      const target = entry.input[0];
      return typeof target === "string" && !["up", "down", "left", "right"].includes(target) && Boolean(readSelector(entry));
    }
    case "collect":
      return typeof entry.input[0] === "string" && entry.input[0].trim().length > 0;
    case "extractBlocks": {
      const options = entry.input[0];
      return isRecord(options) && typeof options.selector === "string" && options.selector.trim().length > 0;
    }
    default:
      return false;
  }
}

function inferCommandArgs(entry: ExecutionTraceCurrentStep): AdapterArg[] {
  switch (entry.command) {
    case "fill":
    case "type": {
      return [{
        name: inferValueArgName(entry),
        type: "string",
        required: true,
        description: `Value for ${entry.command} target`
      }];
    }
    default:
      return [];
  }
}

function inferValueArgName(entry: ExecutionTraceCurrentStep): string {
  const locator = entry.locator;
  const haystacks = [locator?.placeholder, locator?.text, locator?.ariaLabel, locator?.role, readSelector(entry)]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();

  if (/(search|query|keyword|搜索|查找|检索|q)/i.test(haystacks)) {
    return "query";
  }
  if (/(email|mail|邮箱)/i.test(haystacks)) {
    return "email";
  }
  if (/(password|passwd|pwd|密码)/i.test(haystacks)) {
    return "password";
  }
  if (/(username|user name|account|login|账号|用户名)/i.test(haystacks)) {
    return "username";
  }
  return "value";
}

function buildSuggestedManifestCommand(site: string, id: string, goal: string, args: AdapterArg[]): AdapterCommand {
  return {
    name: id,
    description: goal,
    args,
    example: buildExample(site, id, args)
  };
}

function buildInputTemplate(entry: ExecutionTraceCurrentStep, args: AdapterArg[]): Record<string, unknown> | undefined {
  if (entry.command !== "fill" && entry.command !== "type") {
    return undefined;
  }
  const arg = args[0];
  if (!arg) {
    return undefined;
  }
  return {
    [arg.name]: `$params.${arg.name}`
  };
}

function buildExample(site: string, id: string, args: AdapterArg[]): string {
  const flags = args.map((arg) => ` --${arg.name} "<${arg.name}>"`).join("");
  return `fast-browser site ${site}/${id}${flags}`;
}

function buildWiringNotes(site: string, id: string, exportName: string): string[] {
  return [
    `Add the command entry for ${id} to src/adapters/${site}/manifest.json.`,
    `Export ${exportName} from src/adapters/${site}/commands/${id}.ts and wire it in src/adapters/${site}/index.ts.`
  ];
}

function buildImplementationNotes(entry: ExecutionTraceCurrentStep): string[] {
  const notes = [
    "Built from the last stable commandCandidate in the latest successful trace.",
    "This draft does not modify manifest.json, index.ts, or adapter source files automatically.",
    `Implement the business semantics around ${entry.command} first, then decide whether flows should reuse it.`
  ];
  if (entry.summary) {
    notes.push(`Trace summary: ${entry.summary}`);
  }
  if (Array.isArray(entry.notes)) {
    notes.push(...entry.notes);
  }
  return Array.from(new Set(notes));
}

function createCommandSource(
  options: {
    exportName: string;
    entry: ExecutionTraceCurrentStep;
    args: AdapterArg[];
    selector?: string;
  }
): string {
  const { exportName, entry, args, selector } = options;
  const selectorLiteral = selector ? JSON.stringify(selector) : '"<replace-with-stable-selector>"';
  const argExtraction = createArgExtraction(args);
  const inputShape = createInputShape(args);
  const runtimeCall = createRuntimeCall(entry, args);
  const extractionBlock = argExtraction ? `${argExtraction}

  ` : "";

  return `import type { AdapterContext } from "../../../shared/types";

export async function ${exportName}(params: Record<string, unknown>, context: AdapterContext) {
  ${extractionBlock}const selector = ${selectorLiteral};
  // TODO: ensure the page is already at the correct entry state before using this selector.
  ${runtimeCall}

  return {
    ok: true,
    input: ${inputShape},
    selector,
    url: result.url,
    title: result.title
  };
}
`;
}

function createArgExtraction(args: AdapterArg[]): string {
  return args.map((arg) => {
    const accessor = `params.${arg.name}`;
    if (arg.type === "number") {
      return `const ${arg.name} = ${accessor} === undefined ? undefined : Number(${accessor});
  if (${arg.name} === undefined || Number.isNaN(${arg.name})) {
    throw new Error(${JSON.stringify(`${arg.name} is required`)});
  }`;
    }
    if (arg.type === "boolean") {
      return `const ${arg.name} = Boolean(${accessor});`;
    }
    return `const ${arg.name} = typeof ${accessor} === "string" ? ${accessor} : undefined;
  if (!${arg.name}) {
    throw new Error(${JSON.stringify(`${arg.name} is required`)});
  }`;
  }).join("\n\n  ");
}

function createInputShape(args: AdapterArg[]): string {
  if (args.length === 0) {
    return "params";
  }
  return `{ ${args.map((arg) => arg.name).join(", ")} }`;
}

function createRuntimeCall(entry: ExecutionTraceCurrentStep, args: AdapterArg[]): string {
  switch (entry.command) {
    case "click":
      return "const result = await context.runtime.click(selector);";
    case "hover":
      return "const result = await context.runtime.hover(selector);";
    case "scroll":
      return "const result = await context.runtime.scroll(selector);";
    case "collect":
      return "const result = await context.runtime.collect(selector);";
    case "extractBlocks":
      return "const result = await context.runtime.extractBlocks({ selector });";
    case "press": {
      const key = typeof entry.input[0] === "string" && entry.input[0].trim().length > 0 ? entry.input[0] : "Enter"
      return `const result = await context.runtime.press(${JSON.stringify(key)}, { target: selector });`;
    }
    case "fill":
    case "type": {
      const valueArg = args[0]?.name ?? "value";
      const method = entry.command === "fill" ? "fill" : "type";
      return `const result = await context.runtime.${method}(selector, ${valueArg});`;
    }
    default:
      return "const result = await context.runtime.click(selector);";
  }
}

function readSelector(entry: ExecutionTraceCurrentStep): string | undefined {
  switch (entry.command) {
    case "collect":
      return typeof entry.input[0] === "string" && entry.input[0].trim().length > 0 ? entry.input[0] : undefined;
    case "extractBlocks": {
      const options = entry.input[0];
      return isRecord(options) && typeof options.selector === "string" && options.selector.trim().length > 0
        ? options.selector
        : undefined;
    }
    default:
      return entry.locator?.resolvedSelector && !entry.locator.resolvedSelector.startsWith("@")
        ? entry.locator.resolvedSelector
        : undefined;
  }
}

function toIdentifier(commandName: string): string {
  return commandName
    .replace(/[-_]+([a-zA-Z0-9])/g, (_match, char: string) => char.toUpperCase())
    .replace(/^[A-Z]/, (char) => char.toLowerCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
