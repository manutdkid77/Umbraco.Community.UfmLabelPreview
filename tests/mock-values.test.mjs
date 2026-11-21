import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATES,
  MOCKED_EDITOR_ALIASES,
  mockFor,
  buildMockValue,
  describeEditor,
  statesFor,
} from "../src/Umbraco.Community.UfmLabelPreview/wwwroot/App_Plugins/UfmLabelPreview/mock-values.js";

const GUID = /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i;
const ALL_EDITORS = [...MOCKED_EDITOR_ALIASES, "Umbraco.BlockList", "Umbraco.ImageCropper", "Some.Custom.Editor"];

test("no mock in any state contains a GUID-shaped string", () => {
  for (const alias of ALL_EDITORS) {
    for (const state of STATES) {
      const json = JSON.stringify(mockFor(alias, undefined, state)) ?? "";
      assert.doesNotMatch(json, GUID, `${alias} / ${state}: ${json}`);
    }
  }
});

test("empty is undefined for every editor", () => {
  for (const alias of ALL_EDITORS) assert.equal(mockFor(alias, undefined, "empty"), undefined, alias);
});

test("filled is defined and truthy-ish for every editor", () => {
  for (const alias of ALL_EDITORS) assert.notEqual(mockFor(alias, undefined, "filled"), undefined, alias);
});

test("cleared is an empty string only for editors that store one", () => {
  for (const alias of ["Umbraco.TextBox", "Umbraco.TextArea", "Umbraco.EmailAddress", "Umbraco.Plain.String", "Umbraco.MarkdownEditor"]) {
    assert.equal(mockFor(alias, undefined, "cleared"), "", alias);
    assert.ok(statesFor(alias).includes("cleared"), alias);
  }
  for (const alias of ["Umbraco.RadioButtonList", "Umbraco.DateTime", "Umbraco.Integer", "Umbraco.RichText", "Umbraco.BlockList"]) {
    assert.equal(mockFor(alias, undefined, "cleared"), undefined, alias);
    assert.ok(!statesFor(alias).includes("cleared"), alias);
  }
  assert.deepEqual(statesFor("Umbraco.TextBox"), ["filled", "empty", "cleared", "long"]);
  assert.deepEqual(statesFor("Umbraco.Integer"), ["filled", "empty", "long"]);
});

test("long text is at least 300 characters", () => {
  for (const alias of ["Umbraco.TextBox", "Umbraco.TextArea", "Umbraco.EmailAddress", "Umbraco.MarkdownEditor", "Umbraco.Plain.String"]) {
    assert.ok(mockFor(alias, undefined, "long").length >= 300, alias);
  }
  assert.ok(mockFor("Umbraco.RichText", undefined, "long").markup.length >= 300);
});

test("long arrays have 12 items", () => {
  for (const alias of ["Umbraco.Tags", "Umbraco.CheckBoxList", "Umbraco.DropDown.Flexible", "Umbraco.MultiNodeTreePicker", "Umbraco.MediaPicker3", "Umbraco.MultiUrlPicker"]) {
    assert.equal(mockFor(alias, undefined, "long").length, 12, alias);
  }
});

test("shapes match the stored values", () => {
  assert.equal(typeof mockFor("Umbraco.TextBox"), "string");
  assert.equal(mockFor("Umbraco.Integer"), 42);
  assert.equal(mockFor("Umbraco.TrueFalse"), true);
  assert.deepEqual(Object.keys(mockFor("Umbraco.RichText")), ["markup"]);
  assert.deepEqual(mockFor("Umbraco.MultiNodeTreePicker")[0].type, "document");
  assert.ok("mediaKey" in mockFor("Umbraco.MediaPicker3")[0]);
  assert.match(mockFor("Umbraco.DateTime"), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.deepEqual(Object.keys(mockFor("Umbraco.ColorPicker")), ["label", "value"]);
});

test("link mocks have a name and never a unique", () => {
  for (const state of ["filled", "long"]) {
    for (const link of mockFor("Umbraco.MultiUrlPicker", undefined, state)) {
      assert.ok(link.name);
      assert.ok(!("unique" in link));
    }
  }
});

test("UI alias fallback", () => {
  assert.equal(mockFor(undefined, "Umb.PropertyEditorUi.Tiptap").markup.includes("<p>"), true);
  assert.equal(describeEditor(undefined, "Umb.PropertyEditorUi.Toggle").kind, "boolean");
});

test("unsupported editors give a truthy placeholder", () => {
  assert.deepEqual(mockFor("Umbraco.BlockList"), {});
  assert.equal(describeEditor("Umbraco.BlockList").supported, false);
});

test("overrides apply in the filled state only", () => {
  assert.equal(mockFor("Umbraco.TextBox", undefined, "filled", "Custom"), "Custom");
  assert.equal(mockFor("Umbraco.Integer", undefined, "filled", "7"), 7);
  assert.equal(mockFor("Umbraco.Integer", undefined, "filled", "abc"), 42);
  assert.equal(mockFor("Umbraco.TrueFalse", undefined, "filled", false), false);
  assert.deepEqual(mockFor("Umbraco.RichText", undefined, "filled", "<p>x</p>"), { markup: "<p>x</p>" });
  assert.equal(mockFor("Umbraco.TextBox", undefined, "empty", "Custom"), undefined);
});

test("buildMockValue mirrors core's label value shape", () => {
  const v = buildMockValue({
    contentProps: [{ alias: "title", editorAlias: "Umbraco.TextBox" }],
    settingsProps: [{ alias: "subtitle", editorAlias: "Umbraco.TextBox" }],
    overrides: { "$settings.subtitle": { state: "empty" } },
    includeIndex: true,
    index: 3,
  });
  assert.deepEqual(Object.keys(v), ["title", "$settings", "$index"]);
  assert.equal(v.title, "Sample heading");
  assert.deepEqual(v.$settings, { subtitle: undefined });
  assert.equal(v.$index, 3);
});

test("no settings type gives undefined $settings; Block Single has no $index", () => {
  const v = buildMockValue({ contentProps: [], settingsProps: null, includeIndex: false });
  assert.ok("$settings" in v);
  assert.equal(v.$settings, undefined);
  assert.ok(!("$index" in v));
});

test("ElementPicker mock is an array of non-GUID strings (Umbraco 18+)", () => {
  for (const state of ["filled", "long"]) {
    const v = mockFor("Umbraco.ElementPicker", undefined, state);
    assert.ok(Array.isArray(v) && v.length > 0);
    for (const s of v) {
      assert.equal(typeof s, "string");
      assert.doesNotMatch(s, GUID);
    }
  }
  assert.equal(mockFor("Umbraco.ElementPicker", undefined, "long").length, 12);
  assert.equal(describeEditor("Umbraco.ElementPicker").lookup, true);
  assert.ok(MOCKED_EDITOR_ALIASES.includes("Umbraco.ElementPicker"));
});

test("ElementPicker UI alias fallback", () => {
  const d = describeEditor(undefined, "Umb.PropertyEditorUi.ElementPicker");
  assert.equal(d.supported, true);
  assert.equal(d.lookup, true);
  assert.deepEqual(mockFor(undefined, "Umb.PropertyEditorUi.ElementPicker"), ["mock-element-1"]);
});
