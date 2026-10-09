# UFM Label Preview for Umbraco

[![Umbraco 17](https://img.shields.io/badge/Umbraco-17-3544B1?logo=umbraco)](https://umbraco.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

See how a block's label will render while you're still configuring it.

Block labels use [Umbraco Flavored Markdown (UFM)](https://docs.umbraco.com/umbraco-cms/17.latest/model-your-content/property-editors/umbraco-flavored-markdown),
but when you configure a block type there's no content yet, so you can't see the result. This package adds a
**Label preview** tab to the block type editor (Block List, Block Grid, Block RTE and Block Single). The tab shows the
Label field, a live preview rendered with **mock data**, and a panel for flipping each referenced property between
**Filled**, **Empty**, **Cleared** and **Long**, so you can check your `||`, `?:` and `| fallback` branches and your truncation.

![The Label preview tab: label field, rendered preview and mock value overrides](docs/screenshots/label-preview.png)

## Features

- **Live preview.** The label is rendered by Umbraco's own UFM renderer (`umb-ufm-render`), so the output matches what
  editors will see.
- **Realistic mock values.** Each mock has the same shape the property's editor stores, e.g. rich text is
  `{ markup }`, a media picker is a list of media entries. Settings are under `$settings`, and the block index is
  under `$index`.
- **Filled / Empty / Cleared / Long switches** for every referenced property, plus an editable sample value for text,
  numbers, toggles and rich text markup.
- **Clear notes** for anything that can't be previewed: lookups of real content (`umbContentName`,
  `umbMemberName`), custom UFM components from other packages, unknown aliases, and missing settings types.
- **Same Label field.** The Label field on this tab is the same value as on the Settings tab, and edits save through
  the normal path.

## Installation

```bash
dotnet add package Umbraco.Community.UfmLabelPreview
```

Restart the site, open a Block List / Block Grid / Rich Text / Block Single data type, open a block type and choose
the **Label preview** tab.

## What it doesn't do

- **No real content.** Values are always mocks. Components that look up real items (`umbContentName`,
  `umbMemberName`, `umbElementName`, and `umbLink` on anything other than a Multi URL Picker) are shown as
  placeholders such as `‹Content name: picker›`.
- **Custom UFM components** from other packages are shown as placeholders (their behaviour can't be mocked
  reliably). **Custom UFM filters** do run, on the mock data.
- **Unsupported editors** (Block List/Grid inside a block, Image Cropper, Upload Field, and third-party editors) get an
  empty `{}` placeholder value and a note.
- It never changes how labels are saved or rendered at runtime. It's a configuration-time aid only.

## How mocks are built

Mocks are chosen by the data type's property editor schema alias (falling back to the UI alias). Shapes were checked
against the Umbraco 17 backoffice source:

| Editor (schema alias) | Filled mock | Verified against |
|---|---|---|
| `Umbraco.TextBox`, `Umbraco.TextArea`, `Umbraco.EmailAddress`, `Umbraco.Plain.String`, `Umbraco.MarkdownEditor`, `Umbraco.RadioButtonList` | string | `property-editors/text-box/property-editor-ui-text-box.element.ts:18`, `textarea/…textarea.element.ts:25`, `radio-button-list/…radio-button-list.element.ts:16`, `markdown-editor/…markdown-editor.element.ts:21` |
| `Umbraco.Integer`, `Umbraco.Decimal` | `42`, `4.2` | `property-editors/number/types.ts:1-2` |
| `Umbraco.TrueFalse` | `true` | `property-editors/toggle/types.ts:1` |
| `Umbraco.RichText` | `{ markup: "<p>…</p>" }` | `rte/types.ts:4-7` (`blocks` is optional) |
| `Umbraco.DropDown.Flexible`, `Umbraco.CheckBoxList` | `["Option A"]` | `dropdown/…dropdown.element.ts:36`, `checkbox-list/…checkbox-list.element.ts:30` |
| `Umbraco.Tags`, `Umbraco.MultipleTextstring` | string array | `tags/…tags.element.ts:23`, `multiple-text-string/…multiple-text-string.element.ts:17` |
| `Umbraco.DateTime` | `"2026-03-14 09:30:00"` | `date-picker/…date-picker.element.ts:105-117` |
| `Umbraco.DateOnly`, `Umbraco.TimeOnly`, `Umbraco.DateTimeUnspecified`, `Umbraco.DateTimeWithTimeZone` | `{ date, timeZone }` | `date-time/property-editor-ui-date-time-picker-base.ts:345-420`, `date-time-with-time-zone-picker/types.ts:1-6` |
| `Umbraco.ColorPicker` | `{ label, value }` | `color-picker/types.ts:1-6` |
| `Umbraco.Slider` | `{ from, to }` | `slider/types.ts:1-6` |
| `Umbraco.ContentPicker`, `Umbraco.MemberPicker` | non-GUID string | `document-picker/…document-picker.element.ts:18`, `member-picker/…member-picker.element.ts:16` |
| `Umbraco.MultiNodeTreePicker` | `[{ type: "document", unique: "mock-document-1" }]` | `content-picker/components/input-content/input-content.element.ts:78-82` |
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

Behaviour worth knowing, which the preview reproduces faithfully:

- In Umbraco 17 the `fallback` filter only replaces an empty string. A property that has never been filled is
  `undefined`, so `{= title | fallback:Untitled }` renders empty for it, but `Untitled` once it's been cleared. Compare
  **Empty** and **Cleared** to see both. Use `${ title || 'Untitled' }` to cover both cases.
- `${ alias }` on an object value (rich text, pickers) prints `[object Object]`. The preview adds a note when this
  happens.

The value passed to the renderer mirrors core:

- `{ ...content, $settings, $index }` for List, Grid and RTE blocks.
- `{ ...content, $settings }` for Block Single, which has no `$index`.
- `$settings` is `undefined` when the block has no settings element type.

## Compatibility

| Umbraco | Package |
|---|---|
| 17.x | Supported (built against 17.0.0, tested on 17.7.0) |
| 18.x | Not yet. 18 removes the kebab-case filter aliases and adds `umbElementName` |

Kebab-case filter aliases (`strip-html`, `word-limit`, `title-case`) are deprecated since 16.4 and removed in 18. The
preview simply uses whatever filters are registered in your site.

Support is best-effort.

## Internal / undocumented API reliance

Retest these on every Umbraco minor:

| API | Status | Risk |
|---|---|---|
| `workspaceView`, `Umb.Condition.WorkspaceAlias`, `UMB_PROPERTY_DATASET_CONTEXT`, `umb-property`, `UmbLitElement`, extension registry | Public, documented | Low |
| `umb-ufm-render` (`markdown`, `value`, `inline`, `umb-ufm-resolved` event) | Public export; the event is undocumented | Low/Medium |
| Workspace aliases `Umb.Workspace.Block{List,Grid,Rte,Single}Type` | Undocumented string constants | Medium |
| Block config keys `label`, `contentElementTypeKey`, `settingsElementTypeKey` | Stored data model | Low |
| Label value shape `{ ...content, $settings, $index }` | Implementation detail mirrored here | Medium: the preview could drift from runtime |
| UFM token rules (component `{alias: …}` / marker, `${ … }` expressions) | Implementation detail mirrored by the scanner | Medium |
| `UmbDocumentTypeDetailRepository` (element type + compositions), `UmbDataTypeItemRepository` | Public exports, sparsely documented | Low/Medium |
| Lookup components only request GUID-shaped ids | Implementation detail | Medium. Lookup tokens are replaced anyway, so this is defence in depth |

## Privacy and security

- Client-side only, with no server code.
- No content lookups. The only requests are for the block's element type and data type **definitions**, made
  through core's public repositories.
- No telemetry (`allowTelemetry: false`).
- The label is rendered by core's UFM pipeline (marked + DOMPurify); this package never builds HTML from the label.

## Development

```bash
node --test                                                        # pure-module tests (tests/*.test.mjs), no dependencies
dotnet build src/Umbraco.Community.UfmLabelPreview.slnx
dotnet run --project src/Umbraco.Community.UfmLabelPreview.TestSite   # first run shows the Umbraco installer
dotnet pack src/Umbraco.Community.UfmLabelPreview -c Release
```

There's no build step for the client code. The files in `wwwroot/App_Plugins/UfmLabelPreview/` are served as they
are.

When releasing, bump the version in `umbraco-package.json`, the csproj `<Version>` and `CHANGELOG.md` together.
Umbraco appends the manifest version to the view's URL (`?umb__rnd=<version>`), and the view passes that query on
to its own imports, so browsers pick up every changed file.

## License

[MIT](LICENSE) © Nathaniel Nunes
