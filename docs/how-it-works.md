# How it works

Notes for maintainers and the curious. The README covers everything you need to use the package.

## Mock values

Mocks are chosen by the data type's property editor schema alias (falling back to the UI alias). Shapes were checked
against the Umbraco 17 backoffice source:

| Editor (schema alias) | Filled mock | Verified against |
|---|---|---|
| `Umbraco.TextBox`, `Umbraco.TextArea`, `Umbraco.EmailAddress`, `Umbraco.Plain.String`, `Umbraco.MarkdownEditor`, `Umbraco.RadioButtonList` | string | `property-editors/text-box/property-editor-ui-text-box.element.ts:18`, `textarea/...textarea.element.ts:25`, `radio-button-list/...radio-button-list.element.ts:16`, `markdown-editor/...markdown-editor.element.ts:21` |
| `Umbraco.Integer`, `Umbraco.Decimal` | `42`, `4.2` | `property-editors/number/types.ts:1-2` |
| `Umbraco.TrueFalse` | `true` | `property-editors/toggle/types.ts:1` |
| `Umbraco.RichText` | `{ markup: "<p>...</p>" }` | `rte/types.ts:4-7` (`blocks` is optional) |
| `Umbraco.DropDown.Flexible`, `Umbraco.CheckBoxList` | `["Option A"]` | `dropdown/...dropdown.element.ts:36`, `checkbox-list/...checkbox-list.element.ts:30` |
| `Umbraco.Tags`, `Umbraco.MultipleTextstring` | string array | `tags/...tags.element.ts:23`, `multiple-text-string/...multiple-text-string.element.ts:17` |
| `Umbraco.DateTime` | `"2026-03-14 09:30:00"` | `date-picker/...date-picker.element.ts:105-117` |
| `Umbraco.DateOnly`, `Umbraco.TimeOnly`, `Umbraco.DateTimeUnspecified`, `Umbraco.DateTimeWithTimeZone` | `{ date, timeZone }` | `date-time/property-editor-ui-date-time-picker-base.ts:345-420`, `date-time-with-time-zone-picker/types.ts:1-6` |
| `Umbraco.ColorPicker` | `{ label, value }` | `color-picker/types.ts:1-6` |
| `Umbraco.Slider` | `{ from, to }` | `slider/types.ts:1-6` |
| `Umbraco.ContentPicker`, `Umbraco.MemberPicker` | non-GUID string | `document-picker/...document-picker.element.ts:18`, `member-picker/...member-picker.element.ts:16` |
| `Umbraco.MultiNodeTreePicker` | `[{ type: "document", unique: "mock-document-1" }]` | `content-picker/components/input-content/input-content.element.ts:78-82` |
| `Umbraco.ElementPicker` (Umbraco 18+) | non-GUID string array | `elements/property-editor/element-picker/element-picker-property-editor-ui.element.ts` |
| `Umbraco.MediaPicker3` | `[{ key, mediaKey, mediaTypeAlias, focalPoint, crops }]` | `media/media/property-editors/types.ts:1-9` |
| `Umbraco.MultiUrlPicker` | `[{ name: "Sample link", url, type: "external" }]` (no `unique`) | `multi-url-picker/link-picker-modal/types.ts:3-14` |
| anything else | `{}` + "not previewable" note | |

Paths are relative to `src/Umbraco.Web.UI.Client/src/packages/` in the Umbraco-CMS repo.

- **Empty** is `undefined`, the same as a property that has never been filled in.
- **Cleared** is `""`, what text editors (TextBox, TextArea, Email, Markdown, code editor) store once a value is
  typed and then deleted. It's only offered for those editors.
- **Long** gives strings of at least 400 characters, several long paragraphs of rich text, and lists of 12 items.
- No mock value ever contains a GUID-shaped id, so core's lookup components never send a request (enforced by a
  unit test).

The preview reproduces these quirks of core as they are:

- In Umbraco 17 the `fallback` filter only replaces an empty string. A property that has never been filled is
  `undefined`, so `{= title | fallback:Untitled }` renders empty for it, but `Untitled` once it's been cleared. Compare
  **Empty** and **Cleared** to see both. Use `${ title || 'Untitled' }` to cover both cases.
- `${ alias }` on an object value (rich text, pickers) prints `[object Object]`. The preview adds a note when this
  happens.

The value passed to the renderer mirrors core:

- `{ ...content, $settings, $index }` for List, Grid and RTE blocks.
- `{ ...content, $settings }` for Block Single, which has no `$index`.
- `$settings` is `undefined` when the block has no settings element type.

## Deprecated filter names

Kebab-case filter aliases (`strip-html`, `title-case`, `word-limit`) are deprecated. From Umbraco 18 their manifests
are gone, but component filters such as `{= x | strip-html}` still work: core maps them to the camelCase names and logs a
deprecation warning, until Umbraco 20. Inside `${ }` only the camelCase names (`stripHtml`, `titleCase`, `wordLimit`)
work. The preview notes either case and still renders what core renders. Otherwise it uses whatever filters are
registered on your site.

## Umbraco APIs it relies on

Retest these on every Umbraco minor:

| API | Status | Risk |
|---|---|---|
| `workspaceView`, `Umb.Condition.WorkspaceAlias`, `UMB_PROPERTY_DATASET_CONTEXT`, `umb-property`, `UmbLitElement`, extension registry | Public, documented | Low |
| `umb-ufm-render` (`markdown`, `value`, `inline`, `umb-ufm-resolved` event) | Public export; the event is undocumented | Low/Medium |
| Workspace aliases `Umb.Workspace.Block{List,Grid,Rte,Single}Type` | Undocumented string constants | Medium |
| Block config keys `label`, `contentElementTypeKey`, `settingsElementTypeKey` | Stored data model | Low |
| Label value shape `{ ...content, $settings, $index }` | Implementation detail mirrored here | Medium: the preview could drift from runtime |
| UFM token rules (component `{alias: ...}` / marker, `${ ... }` expressions) | Implementation detail mirrored by the scanner | Medium |
| `UmbDocumentTypeDetailRepository` (element type + compositions), `UmbDataTypeItemRepository` | Public exports, sparsely documented | Low/Medium |
| Lookup components only request GUID-shaped ids | Implementation detail | Medium. Lookup tokens are replaced anyway, so this is defence in depth |
