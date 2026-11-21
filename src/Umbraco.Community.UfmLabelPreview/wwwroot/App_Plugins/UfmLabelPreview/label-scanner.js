// Pure: finds the UFM component tokens and ${ } expressions in a block label, and which property aliases they reference.
// Mirrors core's tokenizers (ufm/plugins/marked-ufm.plugin.ts, marked-ufmjs.plugin.ts); never executes anything.
// No imports, so it runs under `node --test`.

// Core's expression token: `${ … }` allowing one level of nested braces.
const EXPRESSION = /^\$\{((?:[^{}]|\{[^{}]*\})*)\}/;

// Characters marked treats as escapable after a backslash (marked's inline escape rule).
const ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/;

// Components whose contents are not property aliases.
const NON_ALIAS_COMPONENTS = new Set(["umbLocalize"]);

const KEYWORDS = new Set(["true", "false", "null", "undefined", "typeof", "in", "instanceof", "new", "this"]);

const STRING_LITERAL = /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g;
const SETTINGS_BRACKET = /\$settings\s*(?:\?\.)?\s*\[\s*(['"])((?:\\.|(?!\1).)*)\1\s*\]/g;
const SETTINGS_DOT = /\$settings\s*\??\.\s*([A-Za-z_$][\w$]*)/g;
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

// Kebab-case filter names: core still maps them for component filters (warning, removal in Umbraco 20),
// but the expression scope only has the camelCase names.
export const DEPRECATED_FILTERS = { "strip-html": "stripHtml", "title-case": "titleCase", "word-limit": "wordLimit" };
const DEPRECATED_IN_EXPRESSION = /\|\s*(strip-html|title-case|word-limit)(?![\w-])/g;

const escapeRegExp =(s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Same shape as core: ^\{\s*(alias:|marker)([^}]*)\}
function componentPattern({ alias, marker }) {
  const prefix = `(${escapeRegExp(alias)}:${marker ? `|${escapeRegExp(marker)}` : ""})`;
  return new RegExp(`^\\{\\s*${prefix}([^}]*)\\}`);
}

// Same split as core: alias before the first "|", filters after; each filter "name:arg1:arg2".
function parseContents(text) {
  const pipe = text.indexOf("|");
  const propertyAlias = (pipe === -1 ? text : text.substring(0, pipe)).trim();
  const filterText = pipe === -1 ? "" : text.substring(pipe + 1);
  const filters = filterText
    .split("|")
    .filter((f) => f.trim())
    .map((f) => {
      const [alias, ...args] = f.split(":").map((p) => p.trim());
      return { alias, args };
    });
  return { propertyAlias, filters };
}

function prevNonSpace(text, index) {
  let i = index - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  return { char: text[i], index: i };
}

function nextNonSpace(text, index) {
  let i = index;
  while (i < text.length && /\s/.test(text[i])) i++;
  return text[i];
}

// Identifiers an expression reads from the label value object.
export function scanExpression(text) {
  const contentAliases = [];
  const settingsAliases = [];

  // Bracket access first, while its string literal is still intact.
  let rest = text.replace(SETTINGS_BRACKET, (_, _q, name) => {
    settingsAliases.push(name);
    return " ";
  });
  rest = rest.replace(STRING_LITERAL, " ");
  rest = rest.replace(SETTINGS_DOT, (_, name) => {
    settingsAliases.push(name);
    return " ";
  });

  // `| strip-html` reads as `| strip - html` in an expression; don't report "html" as a property.
  rest = rest.replace(DEPRECATED_IN_EXPRESSION, "| ");

  const usesIndex = /\$index\b/.test(rest);

  for (const match of rest.matchAll(IDENTIFIER)) {
    const name = match[0];
    const at = match.index;
    if (name.startsWith("$") || KEYWORDS.has(name)) continue;
    if (/[\d.]/.test(rest[at - 1] ?? "")) continue; // property access (a.b) or numeric suffix (1e5)

    const prev = prevNonSpace(rest, at);
    if (prev.char === ".") continue; // a?. b / a . b
    // Single "|" is a filter pipe ("x | truncate: 10"); "||" is logical OR.
    if (prev.char === "|" && rest[prev.index - 1] !== "|") continue;
    // Object-literal key: "{ a: 1 }" / ", b: 2".
    if ((prev.char === "{" || prev.char === ",") && nextNonSpace(rest, at + name.length) === ":") continue;

    contentAliases.push(name);
  }

  return { contentAliases: unique(contentAliases), settingsAliases: unique(settingsAliases), usesIndex };
}

function unique(list) {
  return [...new Set(list)];
}

/**
 * @param {string} markdown - the label text
 * @param {{ components?: Array<{ alias: string, marker?: string }>, filterAliases?: string[] }} registry
 */
export function scanLabel(markdown, { components = [], filterAliases = [] } = {}) {
  const src = typeof markdown === "string" ? markdown : "";
  const patterns = components.filter((c) => c?.alias).map((c) => ({ alias: c.alias, regex: componentPattern(c) }));
  const filterSet = new Set(filterAliases);

  const componentTokens = [];
  const expressions = [];

  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    // Backslash escapes: "\${" and "\{" are literal text.
    if (ch === "\\" && ESCAPABLE.test(src[i + 1] ?? "")) {
      i += 2;
      continue;
    }

    // Code spans: nothing inside `…` is tokenised.
    if (ch === "`") {
      const run = /^`+/.exec(src.slice(i))[0];
      const close = src.indexOf(run, i + run.length);
      if (close !== -1) {
        i = close + run.length;
        continue;
      }
      i += run.length;
      continue;
    }

    if (ch === "$" && src[i + 1] === "{") {
      const m = EXPRESSION.exec(src.slice(i));
      if (m) {
        const text = m[1].trim();
        expressions.push({ raw: m[0], text, index: i, ...scanExpression(text) });
        i += m[0].length;
        continue;
      }
    }

    if (ch === "{") {
      let matched = false;
      for (const { alias, regex } of patterns) {
        const m = regex.exec(src.slice(i));
        if (!m) continue;
        const { propertyAlias, filters } = parseContents(m[2] ?? "");
        componentTokens.push({ raw: m[0], componentAlias: alias, propertyAlias, filters, index: i });
        i += m[0].length;
        matched = true;
        break;
      }
      if (matched) continue;
    }

    i++;
  }

  const contentAliases = [];
  const settingsAliases = [];
  let usesIndex = false;

  for (const token of componentTokens) {
    if (NON_ALIAS_COMPONENTS.has(token.componentAlias) || !token.propertyAlias) continue;
    if (token.propertyAlias === "$index") usesIndex = true;
    else if (!token.propertyAlias.startsWith("$")) contentAliases.push(token.propertyAlias);
  }
  for (const expression of expressions) {
    // A bare filter alias inside ${ } resolves to the filter function, not a property.
    contentAliases.push(...expression.contentAliases.filter((a) => !filterSet.has(a)));
    settingsAliases.push(...expression.settingsAliases);
    usesIndex ||= expression.usesIndex;
  }

  const deprecatedFilters = [];
  const seen = new Set();
  const addDeprecated = (alias, inExpression) => {
    const key = `${inExpression}:${alias}`;
    if (seen.has(key)) return;
    seen.add(key);
    deprecatedFilters.push({ alias, replacement: DEPRECATED_FILTERS[alias], inExpression });
  };
  for (const token of componentTokens) {
    for (const f of token.filters) if (Object.hasOwn(DEPRECATED_FILTERS, f.alias)) addDeprecated(f.alias, false);
  }
  for (const expression of expressions) {
    const code = expression.text.replace(STRING_LITERAL, " ");
    for (const m of code.matchAll(DEPRECATED_IN_EXPRESSION)) addDeprecated(m[1], true);
  }

  return {
    componentTokens,
    expressions,
    deprecatedFilters,
    contentAliases: unique(contentAliases),
    settingsAliases: unique(settingsAliases),
    usesIndex,
  };
}
