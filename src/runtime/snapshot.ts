import type { BrowserSnapshotInput, BrowserSnapshotResult } from "../shared/types";

const INTERACTIVE_CLASS_HINTS = ["button", "btn", "card", "link", "item", "tab", "nav", "menu", "upload", "publish"];
const SEMANTIC_ATTRIBUTE_PRIORITY = ["data-testid", "data-test", "data-test-id", "data-qa", "data-cy", "data-role", "name", "aria-label", "placeholder", "href", "role"];

export interface PreferredSelectorInput {
  tag: string;
  attributes?: Record<string, string>;
  className?: string;
  fallbackSelector: string;
}

export function buildSnapshot(
  items: BrowserSnapshotInput[],
  context: { url?: string; title?: string } = {}
): BrowserSnapshotResult {
  const interactive = items
    .filter((item) => isLikelyInteractive(item))
    .map((item, index) => ({
      ref: `@e${index + 1}`,
      tag: item.tag,
      text: item.text,
      selector: item.selector
    }));

  const text = items
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);

  return {
    url: context.url ?? "",
    title: context.title ?? "",
    text,
    interactive
  };
}

export function selectPreferredSelector(
  input: PreferredSelectorInput,
  isUnique: (selector: string) => boolean
): string {
  const candidates = buildSelectorCandidates(input);
  for (const candidate of candidates) {
    if (candidate === input.fallbackSelector) {
      continue;
    }
    if (isUnique(candidate)) {
      return candidate;
    }
  }
  return input.fallbackSelector;
}

export function createSnapshotEvaluatorSource(): string {
  const trackedAttributes = JSON.stringify(["id", ...SEMANTIC_ATTRIBUTE_PRIORITY]);
  return `(() => {
    const trackedAttributes = ${trackedAttributes};
    const escapeCssIdentifier = ${escapeCssIdentifier.toString()};
    const escapeCssValue = ${escapeCssValue.toString()};
    const isStableClassToken = ${isStableClassToken.toString()};
    const buildSelectorCandidates = ${buildSelectorCandidates.toString()};
    const selectPreferredSelector = ${selectPreferredSelector.toString()};
    return ({ selector, interactiveOnly, maxItems }) => {
      const cssPath = (element) => {
        if (element.id) {
          return '#' + escapeCssIdentifier(element.id);
        }
        const segments = [];
        let current = element;
        while (current && current.nodeType === Node.ELEMENT_NODE && segments.length < 6) {
          const tag = current.tagName.toLowerCase();
          const parent = current.parentElement;
          if (!parent) {
            segments.unshift(tag);
            break;
          }
          const siblings = Array.from(parent.children).filter((item) => item.tagName === current.tagName);
          const index = siblings.indexOf(current) + 1;
          segments.unshift(tag + ':nth-of-type(' + index + ')');
          current = parent;
        }
        return segments.join(' > ');
      };
      const isVisible = (element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
      };
      const isInteractive = (element) => {
        if (element.matches('a, button, input, textarea, select, summary, [role="button"], [role="link"], [onclick], [contenteditable="true"]')) {
          return true;
        }
        const tabindex = element.getAttribute('tabindex');
        return tabindex !== null && Number(tabindex) >= 0;
      };
      const isUnique = (candidate) => {
        try {
          return document.querySelectorAll(candidate).length === 1;
        } catch {
          return false;
        }
      };
      const root = selector ? document.querySelector(selector) : document.body;
      const elements = Array.from(root ? root.querySelectorAll('*') : [])
        .filter((element) => isVisible(element))
        .map((element) => {
          const tag = element.tagName.toLowerCase();
          const className = typeof element.className === 'string' ? element.className : '';
          const attributes = Object.fromEntries(
            trackedAttributes
              .map((name) => [name, element.getAttribute(name)])
              .filter((entry) => typeof entry[1] === 'string' && entry[1].length > 0)
          );
          const fallbackSelector = cssPath(element);
          const selectorInput = {
            tag,
            attributes,
            className,
            fallbackSelector
          };
          return {
            tag,
            text: (element.innerText || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160),
            selector: selectPreferredSelector(selectorInput, isUnique),
            selectors: buildSelectorCandidates(selectorInput).slice(0, 5),
            interactive: isInteractive(element),
            className
          };
        })
        .filter((element) => (interactiveOnly ? element.interactive : Boolean(element.text || element.interactive)))
        .slice(0, maxItems || 200);
      return { url: window.location.href, title: document.title, elements };
    };
  })()`;
}

export function isLikelyInteractive(item: BrowserSnapshotInput): boolean {
  if (item.interactive) {
    return true;
  }

  const className = (item.className ?? "").toLowerCase();
  if (!className || !item.text.trim()) {
    return false;
  }

  return INTERACTIVE_CLASS_HINTS.some((hint) => className.includes(hint));
}

function buildSelectorCandidates(input: PreferredSelectorInput): string[] {
  const tag = (input.tag || "div").toLowerCase();
  const attributes = input.attributes ?? {};
  const candidates: string[] = [];
  const semanticAttributePriority = ["data-testid", "data-test", "data-test-id", "data-qa", "data-cy", "data-role", "name", "aria-label", "placeholder", "href", "role"];

  const id = attributes.id?.trim();
  if (id) {
    candidates.push(`#${escapeCssIdentifier(id)}`);
  }

  for (const name of semanticAttributePriority) {
    const value = attributes[name]?.trim();
    if (!value) {
      continue;
    }
    if (name === "href" && tag !== "a") {
      continue;
    }
    candidates.push(`${tag}[${name}="${escapeCssValue(value)}"]`);
  }

  const classTokens = Array.from(new Set((input.className ?? "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter(isStableClassToken)));
  if (classTokens.length >= 2) {
    candidates.push(`${tag}.${classTokens[0]}.${classTokens[1]}`);
  }
  if (classTokens.length >= 1) {
    candidates.push(`${tag}.${classTokens[0]}`);
  }

  candidates.push(input.fallbackSelector);
  return Array.from(new Set(candidates));
}

function isStableClassToken(token: string): boolean {
  if (!token) {
    return false;
  }
  if (token.length > 40) {
    return false;
  }
  if (!/[a-z]/i.test(token)) {
    return false;
  }
  if (/^(css-|jsx-|sc-|chakra-|mantine-|emotion-)/i.test(token)) {
    return false;
  }
  if (/\d{4,}/.test(token)) {
    return false;
  }
  return true;
}

function escapeCssIdentifier(value: string): string {
  return value.replace(/([#.;?+*~':"!^$\[\]()=>|/@])/g, "\\$1");
}

function escapeCssValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
