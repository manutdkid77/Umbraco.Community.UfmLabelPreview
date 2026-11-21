// Pure: swaps UFM tokens that can't be previewed for placeholder text; output stays markdown for core's pipeline.

export const PREVIEWABLE_COMPONENTS = ["umbValue", "umbLocalize", "umbLink"];

// Core components that look up real items by id.
const LOOKUP_NAMES = {
  umbContentName: "Content name",
  umbMemberName: "Member name",
  umbElementName: "Element name",
  umbFormName: "Form name", // Umbraco Forms
  umbLink: "Link",
};

// Anything markdown or UFM could interpret, plus "&" (entities) and "~" (gfm strikethrough).
const UNSAFE_PLACEHOLDER_CHARS = /[{}$<>[\]\\`*_|&~\r\n]/g;

export function placeholderText(componentAlias, propertyAlias) {
  const name = (LOOKUP_NAMES[componentAlias] ?? componentAlias ?? "").replace(UNSAFE_PLACEHOLDER_CHARS, "");
  const alias = (propertyAlias ?? "").replace(UNSAFE_PLACEHOLDER_CHARS, "");
  return alias ? `‹${name}: ${alias}›` : `‹${name}›`;
}

/**
 * @param {string} markdown
 * @param {{ componentTokens: Array<{ raw: string, componentAlias: string, propertyAlias: string, index: number }> }} scan
 * @param {{ previewableComponents?: string[], safeLinkAliases?: string[] }} options
 *   safeLinkAliases: aliases whose mock is a link list with a `name` and no `unique` (so `umbLink` never requests an item).
 */
export function rewriteLabel(markdown, scan, { previewableComponents = PREVIEWABLE_COMPONENTS, safeLinkAliases = [] } = {}) {
  let out = typeof markdown === "string" ? markdown : "";
  const previewable = new Set(previewableComponents);
  const safeLinks = new Set(safeLinkAliases);
  const notes = [];

  const tokens = [...(scan?.componentTokens ?? [])].sort((a, b) => b.index - a.index);
  for (const token of tokens) {
    const { componentAlias, propertyAlias, raw, index } = token;
    const isLink = componentAlias === "umbLink";
    if (previewable.has(componentAlias) && (!isLink || safeLinks.has(propertyAlias))) continue;
    if (out.substr(index, raw.length) !== raw) continue; // scan doesn't match this markdown

    out = out.slice(0, index) + placeholderText(componentAlias, propertyAlias) + out.slice(index + raw.length);

    const lookup = componentAlias in LOOKUP_NAMES;
    notes.unshift({
      raw,
      componentAlias,
      propertyAlias,
      kind: lookup ? "lookup" : "custom",
      message: lookup
        ? `${raw} looks up real content — shown as a placeholder.`
        : `${raw} is a custom UFM component from another package — not previewable.`,
    });
  }

  return { markdown: out, notes };
}
