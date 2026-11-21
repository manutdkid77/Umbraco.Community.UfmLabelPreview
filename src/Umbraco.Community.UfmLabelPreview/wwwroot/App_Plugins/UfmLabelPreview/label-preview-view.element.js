// "Label preview" workspace view for block types: the block's Label field, a live UFM render of it against mock data,
// and an override panel to flip each referenced property between filled / empty / long.
// Fail-safe: anything that goes wrong only hides the preview; the Label field (core's umb-property) always renders.

import { html, css, nothing, repeat } from "@umbraco-cms/backoffice/external/lit";
import { UmbLitElement } from "@umbraco-cms/backoffice/lit-element";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import { UMB_PROPERTY_DATASET_CONTEXT } from "@umbraco-cms/backoffice/property";
import { UMB_WORKSPACE_CONTEXT } from "@umbraco-cms/backoffice/workspace";
import { umbExtensionsRegistry } from "@umbraco-cms/backoffice/extension-registry";
import "@umbraco-cms/backoffice/ufm"; // defines <umb-ufm-render>

// Umbraco loads this file as "…element.js?umb__rnd=<package version>" to bust browser caches on upgrade, but
// that doesn't reach our own imports. Pass the same query on, so bumping the manifest version refreshes them all.
const CACHE_BUST = new URL(import.meta.url).search;
const [{ scanLabel }, { rewriteLabel }, { buildMockValue, describeEditor, statesFor }] = await Promise.all([
  import(`./label-scanner.js${CACHE_BUST}`),
  import(`./label-rewriter.js${CACHE_BUST}`),
  import(`./mock-values.js${CACHE_BUST}`),
]);

const ELEMENT_NAME = "ulp-label-preview-view";
const BLOCK_SINGLE_WORKSPACE = "Umb.Workspace.BlockSingleType";
const DEBOUNCE_MS = 150;

// Core components that take a property alias (others, e.g. from third-party packages, may not).
const CORE_ALIAS_COMPONENTS = new Set(["umbValue", "umbContentName", "umbLink", "umbMemberName", "umbElementName", "umbFormName"]);

// English only for v1; kept together for later localisation.
const STRINGS = {
  label: "Label",
  previewHeadline: "Preview",
  mocksHeadline: "Mock values",
  noLabel: "No label set — the block shows its element type name instead.",
  renderedEmpty: "This label renders as (empty).",
  unavailable: "Preview unavailable.",
  loading: "Loading element type…",
  noRows: "The label doesn't reference any properties.",
  reset: "Reset",
  mockObject: "Mock object",
  index: "Block index",
  states: { filled: "Filled", empty: "Empty", cleared: "Cleared", long: "Long" },
  stateHints: {
    filled: "A typical value",
    empty: "Never filled in: no stored value (undefined)",
    cleared: "Filled in, then deleted: an empty string (\"\")",
    long: "A very long value, to test truncation",
  },
  unknownAlias: (alias) => `"${alias}" is not a property on this element type.`,
  unknownSettingsAlias: (alias) => `"$settings.${alias}" is not a property on the settings element type.`,
  noSettingsType: (alias) => `"$settings.${alias}" — this block has no settings element type.`,
  unsupported: (alias, editor) => `"${alias}" uses ${editor || "an unknown editor"} — not previewable, value shape not mocked.`,
  noIndex: "$index isn't available in Block Single labels (it is undefined at runtime).",
  deprecatedFilter: (alias, replacement) =>
    `"${alias}" is deprecated — use "${replacement}". It still works until Umbraco 20 but logs a warning.`,
  deprecatedExpressionFilter: (alias, replacement) => `"${alias}" isn't a filter inside \${ } — use "${replacement}".`,
  printsObject: (raw) => `${raw} prints an object ("[object Object]") — the same happens at runtime.`,
};

export class UlpLabelPreviewViewElement extends UmbLitElement {
  static properties = {
    _label: { state: true },
    _preview: { state: true },
    _overrides: { state: true },
    _index: { state: true },
    _includeIndex: { state: true },
    _resolvedText: { state: true },
    _schemaLoading: { state: true },
    _error: { state: true },
  };

  #components = [];
  #filterAliases = [];
  #contentSchema = new Map();
  #settingsSchema = null; // null = no settings element type
  #keys = { content: undefined, settings: undefined };
  #loadSeq = { content: 0, settings: 0 };
  #pending = { content: false, settings: false };
  #failed = { content: false, settings: false }; // a schema lookup threw: keep showing "Preview unavailable"
  #schemaCache = new Map(); // element type key -> Promise<Map>
  #deriveTimer;

  constructor() {
    super();

    this._label = "";
    this._preview = undefined;
    this._overrides = {};
    this._index = 0;
    this._includeIndex = true;
    this._resolvedText = undefined;
    this._schemaLoading = false;
    this._error = false;

    try {
      this.consumeContext(UMB_WORKSPACE_CONTEXT, (context) => {
        this._includeIndex = context?.workspaceAlias !== BLOCK_SINGLE_WORKSPACE;
        this.#derive();
      });

      this.consumeContext(UMB_PROPERTY_DATASET_CONTEXT, async (context) => {
        if (!context) return;
        try {
          this.observe(
            await context.propertyValueByAlias("label"),
            (value) => {
              this._label = typeof value === "string" ? value : "";
              this.#scheduleDerive();
            },
            "_ulpObserveLabel",
          );
          this.observe(
            await context.propertyValueByAlias("contentElementTypeKey"),
            (key) => this.#loadSchema("content", key),
            "_ulpObserveContentKey",
          );
          this.observe(
            await context.propertyValueByAlias("settingsElementTypeKey"),
            (key) => this.#loadSchema("settings", key),
            "_ulpObserveSettingsKey",
          );
        } catch (error) {
          this.#fail(error);
        }
      });

      this.observe(
        umbExtensionsRegistry.byType("ufmComponent"),
        (manifests) => {
          this.#components = (manifests ?? [])
            .map((m) => ({ alias: m?.meta?.alias, marker: m?.meta?.marker }))
            .filter((c) => typeof c.alias === "string" && c.alias);
          this.#derive();
        },
        "_ulpObserveUfmComponents",
      );
      this.observe(
        umbExtensionsRegistry.byType("ufmFilter"),
        (manifests) => {
          this.#filterAliases = (manifests ?? []).map((m) => m?.meta?.alias).filter((a) => typeof a === "string" && a);
          this.#derive();
        },
        "_ulpObserveUfmFilters",
      );
    } catch (error) {
      this.#fail(error);
    }
  }

  disconnectedCallback() {
    clearTimeout(this.#deriveTimer);
    super.disconnectedCallback();
  }

  #fail(error) {
    // A lookup cut short by closing the view (its repositories are destroyed with it) isn't worth reporting.
    if (!this.isConnected) return;
    console.warn("[UfmLabelPreview] Preview unavailable:", error);
    this._error = true;
  }

  async #loadSchema(kind, key) {
    const normalized = typeof key === "string" && key ? key : undefined;
    if (this.#keys[kind] === normalized && !this.#pending[kind]) return;
    this.#keys[kind] = normalized;
    const seq = ++this.#loadSeq[kind];
    this.#failed[kind] = false;

    if (!normalized) {
      this.#setSchema(kind, kind === "settings" ? null : new Map());
      this.#pending[kind] = false;
      this.#updateLoading();
      this.#derive();
      return;
    }

    this.#pending[kind] = true;
    this.#updateLoading();
    try {
      if (!this.#schemaCache.has(normalized)) {
        this.#schemaCache.set(
          normalized,
          import(`./schema-resolver.js${CACHE_BUST}`).then(({ resolveElementTypeProperties }) => resolveElementTypeProperties(this, normalized)),
        );
      }
      const schema = await this.#schemaCache.get(normalized);
      if (seq !== this.#loadSeq[kind]) return; // superseded by a newer key
      this.#setSchema(kind, schema);
    } catch (error) {
      this.#schemaCache.delete(normalized);
      if (seq === this.#loadSeq[kind]) {
        this.#failed[kind] = true;
        this.#fail(error);
      }
    } finally {
      if (seq === this.#loadSeq[kind]) {
        this.#pending[kind] = false;
        this.#updateLoading();
        this.#derive();
      }
    }
  }

  #setSchema(kind, schema) {
    if (kind === "content") this.#contentSchema = schema ?? new Map();
    else this.#settingsSchema = schema;
  }

  #updateLoading() {
    this._schemaLoading = this.#pending.content || this.#pending.settings;
  }

  #scheduleDerive() {
    clearTimeout(this.#deriveTimer);
    this.#deriveTimer = setTimeout(() => this.#derive(), DEBOUNCE_MS);
  }

  // label + schema + overrides -> rewritten markdown, mock value, notes and override rows.
  #derive() {
    try {
      if (this.#failed.content || this.#failed.settings) {
        this._error = true;
        return;
      }
      const label = this._label ?? "";
      if (!label.trim()) {
        this._preview = undefined;
        return;
      }

      const scan = scanLabel(label, { components: this.#components, filterAliases: this.#filterAliases });
      const notes = [];
      const rows = [];
      const kinds = new Map(); // alias / "$settings.x" -> editor description
      const ready = !this._schemaLoading;

      // Aliases only referenced by third-party components may not be properties at all; don't nag about those.
      const coreReferenced = new Set(scan.expressions.flatMap((e) => e.contentAliases));
      for (const t of scan.componentTokens) if (CORE_ALIAS_COMPONENTS.has(t.componentAlias)) coreReferenced.add(t.propertyAlias);

      const contentProps = [];
      for (const alias of scan.contentAliases) {
        const prop = this.#contentSchema.get(alias);
        if (!prop) {
          if (ready && coreReferenced.has(alias)) notes.push(STRINGS.unknownAlias(alias));
          continue;
        }
        const editor = describeEditor(prop.editorAlias, prop.editorUiAlias);
        kinds.set(alias, editor);
        contentProps.push({ alias, editorAlias: prop.editorAlias, editorUiAlias: prop.editorUiAlias });
        rows.push({ key: alias, alias, prop, editor });
        if (!editor.supported) notes.push(STRINGS.unsupported(alias, prop.editorAlias));
      }

      let settingsProps = null;
      if (this.#settingsSchema) {
        settingsProps = [];
        for (const alias of scan.settingsAliases) {
          const prop = this.#settingsSchema.get(alias);
          if (!prop) {
            if (ready) notes.push(STRINGS.unknownSettingsAlias(alias));
            continue;
          }
          const key = `$settings.${alias}`;
          const editor = describeEditor(prop.editorAlias, prop.editorUiAlias);
          kinds.set(key, editor);
          settingsProps.push({ alias, editorAlias: prop.editorAlias, editorUiAlias: prop.editorUiAlias });
          rows.push({ key, alias: key, prop, editor });
          if (!editor.supported) notes.push(STRINGS.unsupported(key, prop.editorAlias));
        }
      } else if (ready) {
        for (const alias of scan.settingsAliases) notes.push(STRINGS.noSettingsType(alias));
      }

      if (scan.usesIndex && !this._includeIndex) notes.push(STRINGS.noIndex);

      for (const d of scan.deprecatedFilters) {
        notes.push(
          d.inExpression ? STRINGS.deprecatedExpressionFilter(d.alias, d.replacement) : STRINGS.deprecatedFilter(d.alias, d.replacement),
        );
      }

      const safeLinkAliases = contentProps.filter((p) => kinds.get(p.alias)?.link).map((p) => p.alias);
      const rewritten = rewriteLabel(label, scan, { safeLinkAliases });

      const value = buildMockValue({
        contentProps,
        settingsProps,
        overrides: this._overrides,
        includeIndex: this._includeIndex,
        index: this._index,
      });

      // `${ alias }` on an object prints "[object Object]" (arrays of strings print fine, joined with commas).
      for (const expression of scan.expressions) {
        const target = expression.text.replace(/^\$settings\s*\.\s*/, "$settings.");
        if (!/^(\$settings\.)?[A-Za-z_]\w*$/.test(target)) continue;
        const mock = target.startsWith("$settings.") ? value.$settings?.[target.slice(10)] : value[target];
        if (mock && typeof mock === "object" && String(mock).includes("[object Object]")) {
          notes.push(STRINGS.printsObject(expression.raw));
        }
      }

      this._preview = {
        markdown: rewritten.markdown,
        value,
        notes: [...rewritten.notes.map((n) => n.message), ...notes],
        rows,
        usesIndex: scan.usesIndex && this._includeIndex,
      };
      this._error = false;
    } catch (error) {
      this.#fail(error);
    }
  }

  #setOverride(key, patch) {
    this._overrides = { ...this._overrides, [key]: { ...this._overrides[key], ...patch } };
    this.#derive();
  }

  #reset = () => {
    this._overrides = {};
    this._index = 0;
    this.#derive();
  };

  #onResolved = (event) => {
    this._resolvedText = event?.detail?.text ?? "";
  };

  render() {
    try {
      return html`${this.#renderLabelBox()} ${this.#renderMocksBox()}`;
    } catch (error) {
      this.#fail(error);
      return this.#renderLabelProperty();
    }
  }

  #renderLabelProperty() {
    return html`
      <uui-box headline=${STRINGS.label}>
        <umb-property
          label=${this.localize.term("general_label")}
          alias="label"
          property-editor-ui-alias="Umb.PropertyEditorUi.TextBox"
          .config=${[{ alias: "labelOnTop", value: true }]}></umb-property>
      </uui-box>
    `;
  }

  #renderLabelBox() {
    return html`
      <uui-box headline=${STRINGS.label}>
        <umb-property
          label=${this.localize.term("general_label")}
          alias="label"
          property-editor-ui-alias="Umb.PropertyEditorUi.TextBox"
          .config=${[{ alias: "labelOnTop", value: true }]}></umb-property>
        <div id="preview">
          <div class="preview-headline">${STRINGS.previewHeadline}</div>
          ${this.#renderPreview()}
        </div>
      </uui-box>
    `;
  }

  #renderPreview() {
    if (this._error) return html`<p class="muted">${STRINGS.unavailable}</p>`;
    if (!this._label?.trim()) return html`<p class="muted">${STRINGS.noLabel}</p>`;
    if (!this._preview) return nothing;

    const empty = this._resolvedText !== undefined && !this._resolvedText.trim();
    return html`
      <div id="rendered">
        <umb-ufm-render
          inline
          .markdown=${this._preview.markdown}
          .value=${this._preview.value}
          @umb-ufm-resolved=${this.#onResolved}></umb-ufm-render>
      </div>
      ${empty ? html`<p class="muted">${STRINGS.renderedEmpty}</p>` : nothing}
      ${this._schemaLoading ? html`<p class="muted">${STRINGS.loading}</p>` : nothing}
      ${this._preview.notes.length
        ? html`<ul id="notes">
            ${this._preview.notes.map((note) => html`<li>${note}</li>`)}
          </ul>`
        : nothing}
    `;
  }

  #renderMocksBox() {
    if (this._error || !this._preview) return nothing;
    const { rows, usesIndex, value } = this._preview;
    return html`
      <uui-box headline=${STRINGS.mocksHeadline}>
        <uui-button slot="header-actions" compact look="secondary" label=${STRINGS.reset} @click=${this.#reset}></uui-button>
        ${rows.length || usesIndex ? nothing : html`<p class="muted">${STRINGS.noRows}</p>`}
        ${repeat(
          rows,
          (row) => row.key,
          (row) => this.#renderRow(row),
        )}
        ${usesIndex ? this.#renderIndexRow() : nothing}
        <details>
          <summary>${STRINGS.mockObject}</summary>
          <pre>${JSON.stringify(value, (_key, v) => (v === undefined ? "(undefined)" : v), 2)}</pre>
        </details>
      </uui-box>
    `;
  }

  #renderRow(row) {
    const override = this._overrides[row.key] ?? {};
    const state = override.state ?? "filled";
    return html`
      <div class="row">
        <div class="row-label">
          <strong>${row.alias}</strong>
          <span class="muted">${row.prop.editorUiAlias ?? row.prop.editorAlias ?? ""}</span>
        </div>
        <uui-button-group>
          ${statesFor(row.prop.editorAlias, row.prop.editorUiAlias).map(
            (s) => html`<uui-button
              compact
              look=${s === state ? "primary" : "outline"}
              label=${STRINGS.states[s]}
              title=${STRINGS.stateHints[s]}
              @click=${() => this.#setOverride(row.key, { state: s })}></uui-button>`,
          )}
        </uui-button-group>
        <div class="row-editor">${state === "filled" ? this.#renderValueEditor(row, override) : nothing}</div>
      </div>
    `;
  }

  #renderValueEditor(row, override) {
    const current = this._preview?.value;
    const mock = row.key.startsWith("$settings.") ? current?.$settings?.[row.key.slice(10)] : current?.[row.key];
    const set = (value) => this.#setOverride(row.key, { value });

    switch (row.editor.kind) {
      case "text":
        return html`<uui-input
          label=${row.alias}
          .value=${override.value ?? mock ?? ""}
          @input=${(e) => set(e.target.value)}></uui-input>`;
      case "number":
        return html`<uui-input
          type="number"
          label=${row.alias}
          .value=${String(override.value ?? mock ?? "")}
          @input=${(e) => set(e.target.value)}></uui-input>`;
      case "boolean":
        return html`<uui-toggle
          label=${row.alias}
          .checked=${override.value ?? mock ?? false}
          @change=${(e) => set(e.target.checked)}></uui-toggle>`;
      case "rte":
        return html`<uui-textarea
          label=${row.alias}
          .value=${override.value ?? mock?.markup ?? ""}
          @input=${(e) => set(e.target.value)}></uui-textarea>`;
      default:
        return nothing;
    }
  }

  #renderIndexRow() {
    return html`
      <div class="row">
        <div class="row-label">
          <strong>$index</strong>
          <span class="muted">${STRINGS.index}</span>
        </div>
        <uui-input
          type="number"
          min="0"
          label="$index"
          .value=${String(this._index)}
          @input=${(e) => {
            const n = Number(e.target.value);
            this._index = Number.isFinite(n) ? n : 0;
            this.#derive();
          }}></uui-input>
      </div>
    `;
  }

  static styles = [
    UmbTextStyles,
    css`
      :host {
        display: grid;
        gap: var(--uui-size-layout-1);
        margin: var(--uui-size-layout-1);
        padding-bottom: var(--uui-size-layout-1);
      }

      .muted {
        color: var(--uui-color-text-alt);
      }

      #preview {
        margin-top: var(--uui-size-space-5);
      }

      .preview-headline {
        font-weight: bold;
        margin-bottom: var(--uui-size-space-2);
      }

      #rendered {
        padding: var(--uui-size-space-4);
        border: 1px dashed var(--uui-color-border);
        border-radius: var(--uui-border-radius);
        min-height: 1.5em;
        overflow-wrap: anywhere;
      }

      #notes {
        margin: var(--uui-size-space-4) 0 0;
        padding-left: var(--uui-size-space-6);
        color: var(--uui-color-text-alt);
      }

      .row {
        display: grid;
        grid-template-columns: minmax(160px, 1fr) auto minmax(200px, 2fr);
        gap: var(--uui-size-space-4);
        align-items: center;
        padding: var(--uui-size-space-3) 0;
        border-bottom: 1px solid var(--uui-color-divider);
      }

      .row-label {
        display: flex;
        flex-direction: column;
      }

      .row-editor uui-input,
      .row-editor uui-textarea {
        width: 100%;
      }

      details {
        margin-top: var(--uui-size-space-5);
      }

      pre {
        overflow: auto;
        max-height: 400px;
        font-family: var(--uui-font-monospace, monospace);
        white-space: pre-wrap;
      }
    `,
  ];
}

export { UlpLabelPreviewViewElement as element };
export default UlpLabelPreviewViewElement;

if (!customElements.get(ELEMENT_NAME)) customElements.define(ELEMENT_NAME, UlpLabelPreviewViewElement);
