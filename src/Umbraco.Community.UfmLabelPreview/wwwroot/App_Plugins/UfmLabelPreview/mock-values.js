// Pure: mock values in each editor's stored shape, never GUID-shaped so core's lookups never fire a request.

// empty = never filled (no stored value, undefined); cleared = typed in then deleted (""), only for editors that store that.
export const STATES = ["filled", "empty", "cleared", "long"];

const LONG_WORDS =
  "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat".split(
    " ",
  );

export function longText(minLength = 400) {
  const words = [];
  for (let i = 0; words.join(" ").length < minLength; i++) words.push(LONG_WORDS[i % LONG_WORDS.length]);
  return words.join(" ") + ".";
}

const list = (n, make) => Array.from({ length: n }, (_, i) => make(i + 1));
const LONG_COUNT = 12;

// kind drives the override editor in the UI: text | number | boolean | rte | structured | unsupported.
const EDITORS = {
  "Umbraco.TextBox": { kind: "text", clearable: true, filled: () => "Sample heading" },
  "Umbraco.TextArea": { kind: "text", clearable: true, filled: () => "Sample text for a short description." },
  "Umbraco.EmailAddress": {
    kind: "text",
    clearable: true,
    filled: () => "name@example.com",
    long: () => `name${".long-address-part".repeat(18)}@example.com`,
  },
  "Umbraco.Plain.String": { kind: "text", clearable: true, filled: () => "Sample text" },
  "Umbraco.MarkdownEditor": { kind: "text", clearable: true, filled: () => "Sample **markdown** text" },
  "Umbraco.RadioButtonList": { kind: "text", filled: () => "Option A" },
  "Umbraco.DateTime": { kind: "text", filled: () => "2026-03-14 09:30:00", long: () => "2026-03-14 09:30:00" },
  "Umbraco.Integer": { kind: "number", filled: () => 42, long: () => 9876543210 },
  "Umbraco.Decimal": { kind: "number", filled: () => 4.2, long: () => 98765.4321 },
  "Umbraco.TrueFalse": { kind: "boolean", filled: () => true, long: () => true },
  "Umbraco.RichText": {
    kind: "rte",
    filled: () => ({ markup: "<p>Sample <strong>rich</strong> text</p>" }),
    long: () => ({ markup: list(4, () => `<p>${longText(200)}</p>`).join("") }),
  },
  "Umbraco.DropDown.Flexible": { kind: "structured", filled: () => ["Option A"], long: () => list(LONG_COUNT, (i) => `Option ${i}`) },
  "Umbraco.CheckBoxList": { kind: "structured", filled: () => ["Option A"], long: () => list(LONG_COUNT, (i) => `Option ${i}`) },
  "Umbraco.Tags": { kind: "structured", filled: () => ["sample-tag"], long: () => list(LONG_COUNT, (i) => `sample-tag-${i}`) },
  "Umbraco.MultipleTextstring": { kind: "structured", filled: () => ["Sample line"], long: () => list(LONG_COUNT, (i) => `Sample line ${i}`) },
  "Umbraco.Slider": { kind: "structured", filled: () => ({ from: 10, to: 20 }), long: () => ({ from: 0, to: 1000000 }) },
  "Umbraco.ColorPicker": { kind: "structured", filled: () => ({ label: "Blue", value: "#3544b1" }) },
  "Umbraco.DateOnly": { kind: "structured", filled: () => ({ date: "2026-03-14", timeZone: null }) },
  "Umbraco.TimeOnly": { kind: "structured", filled: () => ({ date: "09:30:00", timeZone: null }) },
  "Umbraco.DateTimeUnspecified": { kind: "structured", filled: () => ({ date: "2026-03-14T09:30:00", timeZone: null }) },
  "Umbraco.DateTimeWithTimeZone": {
    kind: "structured",
    filled: () => ({ date: "2026-03-14T09:30:00+00:00", timeZone: "Europe/London" }),
  },
  "Umbraco.ContentPicker": { kind: "structured", lookup: true, filled: () => "mock-document-1" },
  "Umbraco.MemberPicker": { kind: "structured", lookup: true, filled: () => "mock-member-1" },
  "Umbraco.MultiNodeTreePicker": {
    kind: "structured",
    lookup: true,
    filled: () => [{ type: "document", unique: "mock-document-1" }],
    long: () => list(LONG_COUNT, (i) => ({ type: "document", unique: `mock-document-${i}` })),
  },
  // Umbraco 18+. Stores an array of element uniques; non-GUID so ufm-element-name never calls the server.
  "Umbraco.ElementPicker": {
    kind: "structured",
    lookup: true,
    filled: () => ["mock-element-1"],
    long: () => list(LONG_COUNT, (i) => `mock-element-${i}`),
  },
  "Umbraco.MediaPicker3": {
    kind: "structured",
    lookup: true,
    filled: () => [mediaEntry(1)],
    long: () => list(LONG_COUNT, mediaEntry),
  },
  "Umbraco.MultiUrlPicker": {
    kind: "structured",
    link: true,
    filled: () => [linkEntry(1)],
    long: () => list(LONG_COUNT, linkEntry),
  },
};

function mediaEntry(i) {
  return { key: `mock-media-entry-${i}`, mediaKey: `mock-media-${i}`, mediaTypeAlias: "Image", focalPoint: null, crops: [] };
}

// No `unique`: core's ufm-link then returns `name` without requesting an item.
function linkEntry(i) {
  return { name: i === 1 ? "Sample link" : `Sample link ${i}`, url: `https://example.com/${i}`, type: "external", target: null };
}

// Fallback when the schema alias is unknown but the UI alias is a core one.
const UI_TO_SCHEMA = {
  "Umb.PropertyEditorUi.TextBox": "Umbraco.TextBox",
  "Umb.PropertyEditorUi.TextArea": "Umbraco.TextArea",
  "Umb.PropertyEditorUi.Tiptap": "Umbraco.RichText",
  "Umb.PropertyEditorUi.Integer": "Umbraco.Integer",
  "Umb.PropertyEditorUi.Decimal": "Umbraco.Decimal",
  "Umb.PropertyEditorUi.Toggle": "Umbraco.TrueFalse",
  "Umb.PropertyEditorUi.MarkdownEditor": "Umbraco.MarkdownEditor",
  "Umb.PropertyEditorUi.ElementPicker": "Umbraco.ElementPicker",
};

function editorFor(editorAlias, editorUiAlias) {
  return EDITORS[editorAlias] ?? EDITORS[UI_TO_SCHEMA[editorUiAlias]];
}

export function describeEditor(editorAlias, editorUiAlias) {
  const editor = editorFor(editorAlias, editorUiAlias);
  if (!editor) return { kind: "unsupported", supported: false, lookup: false, link: false, clearable: false };
  return { kind: editor.kind, supported: true, lookup: !!editor.lookup, link: !!editor.link, clearable: !!editor.clearable };
}

// The states worth offering for an editor ("cleared" only where the editor really stores "").
export function statesFor(editorAlias, editorUiAlias) {
  const { clearable } = describeEditor(editorAlias, editorUiAlias);
  return STATES.filter((s) => s !== "cleared" || clearable);
}

function applyOverride(kind, override) {
  switch (kind) {
    case "text":
      return String(override);
    case "number": {
      const n = Number(override);
      return Number.isFinite(n) ? n : undefined;
    }
    case "boolean":
      return !!override;
    case "rte":
      return { markup: String(override) };
    default:
      return undefined;
  }
}

/**
 * @param {string} editorAlias - propertyEditorSchemaAlias
 * @param {string} editorUiAlias - propertyEditorUiAlias (fallback)
 * @param {"filled"|"empty"|"cleared"|"long"} state
 * @param {unknown} [override] - user-edited value (text/number/boolean/rte markup), used in the filled state
 */
export function mockFor(editorAlias, editorUiAlias, state = "filled", override) {
  if (state === "empty") return undefined; // a property with no stored value is undefined in the label value
  const editor = editorFor(editorAlias, editorUiAlias);
  if (state === "cleared") return editor?.clearable ? "" : undefined;
  if (!editor) return {}; // truthy placeholder; the UI notes it's not previewable

  if (state === "long") {
    if (editor.long) return editor.long();
    if (editor.kind === "text") return longText();
    return editor.filled();
  }

  if (override !== undefined && override !== null) {
    const value = applyOverride(editor.kind, override);
    if (value !== undefined) return value;
  }
  return editor.filled();
}

/**
 * Builds the object core passes to umb-ufm-render for a block label:
 * `{ ...content, $settings, $index }` (Block Single has no `$index`).
 * @param {object} args
 * @param {Array<{ alias: string, editorAlias?: string, editorUiAlias?: string }>} args.contentProps - referenced, known content properties
 * @param {Array<{ alias: string, editorAlias?: string, editorUiAlias?: string }> | null} args.settingsProps - referenced, known settings properties; null when the block has no settings type
 * @param {Record<string, { state?: string, value?: unknown }>} [args.overrides] - keyed by alias, or "$settings.<alias>"
 * @param {boolean} [args.includeIndex]
 * @param {number} [args.index]
 */
export function buildMockValue({ contentProps = [], settingsProps = null, overrides = {}, includeIndex = true, index = 0 }) {
  const value = {};
  for (const p of contentProps) {
    const o = overrides[p.alias] ?? {};
    value[p.alias] = mockFor(p.editorAlias, p.editorUiAlias, o.state ?? "filled", o.value);
  }

  // No settings type: core's settings values observable never emits an object, so $settings is undefined.
  if (settingsProps) {
    const settings = {};
    for (const p of settingsProps) {
      const o = overrides[`$settings.${p.alias}`] ?? {};
      settings[p.alias] = mockFor(p.editorAlias, p.editorUiAlias, o.state ?? "filled", o.value);
    }
    value.$settings = settings;
  } else {
    value.$settings = undefined;
  }

  if (includeIndex) {
    const n = Number(index);
    value.$index = Number.isFinite(n) ? n : 0;
  }
  return value;
}

export const MOCKED_EDITOR_ALIASES = Object.keys(EDITORS);
