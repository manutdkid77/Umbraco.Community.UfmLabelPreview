import { test } from "node:test";
import assert from "node:assert/strict";
import { scanLabel } from "../src/Umbraco.Community.UfmLabelPreview/wwwroot/App_Plugins/UfmLabelPreview/label-scanner.js";
import { rewriteLabel, placeholderText } from "../src/Umbraco.Community.UfmLabelPreview/wwwroot/App_Plugins/UfmLabelPreview/label-rewriter.js";

const components = [
  { alias: "umbValue", marker: "=" },
  { alias: "umbLocalize", marker: "#" },
  { alias: "umbContentName" },
  { alias: "umbLink" },
  { alias: "umbMemberName" },
  { alias: "ocMemberLookup" },
];
const rewrite = (md, options) => rewriteLabel(md, scanLabel(md, { components, filterAliases: [] }), options);

test("lookup component replaced by placeholder with a note", () => {
  const r = rewrite("{umbContentName: picker}");
  assert.equal(r.markdown, "‹Content name: picker›");
  assert.equal(r.notes.length, 1);
  assert.equal(r.notes[0].kind, "lookup");
});

test("previewable components untouched", () => {
  const md = "{=title} {umbValue: body | stripHtml} {#general_name}";
  const r = rewrite(md);
  assert.equal(r.markdown, md);
  assert.equal(r.notes.length, 0);
});

test("umbLink is previewable only for safe link aliases", () => {
  assert.equal(rewrite("{umbLink: link}", { safeLinkAliases: ["link"] }).markdown, "{umbLink: link}");
  const unsafe = rewrite("{umbLink: picker}", { safeLinkAliases: ["link"] });
  assert.equal(unsafe.markdown, "‹Link: picker›");
  assert.equal(unsafe.notes.length, 1);
});

test("multiple tokens, replaced from the end so indices stay valid", () => {
  const r = rewrite("A {umbContentName: one} B {=title} C {umbMemberName: two} D");
  assert.equal(r.markdown, "A ‹Content name: one› B {=title} C ‹Member name: two› D");
  assert.deepEqual(r.notes.map((n) => n.propertyAlias), ["one", "two"]);
});

test("third-party component is placeholdered as custom", () => {
  const r = rewrite("{ocMemberLookup: member}");
  assert.equal(r.markdown, "‹ocMemberLookup: member›");
  assert.equal(r.notes[0].kind, "custom");
});

test("placeholder strips dangerous characters", () => {
  const text = placeholderText("my<Comp>{}$[]\\`*_|&~", "x<y>{z}$[a]\\b`*_|&~");
  assert.doesNotMatch(text, /[{}$<>[\]\\`*_|&~]/);
  assert.equal(text, "‹myComp: xyzab›");
});

test("expressions are not rewritten", () => {
  const md = "${ picker ? 'Has picker' : '' } {umbContentName: picker}";
  const r = rewrite(md);
  assert.equal(r.markdown, "${ picker ? 'Has picker' : '' } ‹Content name: picker›");
});

test("output never introduces <", () => {
  for (const md of ["{umbContentName: a}", "{umbMemberName: <b>}", "{ocMemberLookup: x|y}", "{umbLink: z}"]) {
    const r = rewrite(md);
    const introduced = (r.markdown.match(/</g) ?? []).length - (md.replace(/\{[^}]*\}/g, "").match(/</g) ?? []).length;
    assert.ok(introduced <= 0, `introduced < in ${r.markdown}`);
  }
});
