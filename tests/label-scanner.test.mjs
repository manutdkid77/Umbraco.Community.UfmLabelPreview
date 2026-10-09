import { test } from "node:test";
import assert from "node:assert/strict";
import { scanLabel } from "../src/Umbraco.Community.UfmLabelPreview/wwwroot/App_Plugins/UfmLabelPreview/label-scanner.js";

// The 17.7.0 core registrations (packages/ufm/word-limit.filter-*.js).
const components = [
  { alias: "umbValue", marker: "=" },
  { alias: "umbLocalize", marker: "#" },
  { alias: "umbContentName" },
  { alias: "umbLink" },
  { alias: "umbMemberName" },
];
const filterAliases = ["fallback", "bytes", "lowercase", "strip-html", "stripHtml", "title-case", "titleCase", "truncate", "uppercase", "word-limit", "wordLimit"];
const registry = { components, filterAliases };
const scan = (md, reg = registry) => scanLabel(md, reg);

test("umbValue long form", () => {
  const r = scan("{umbValue: title}");
  assert.equal(r.componentTokens.length, 1);
  assert.deepEqual(r.componentTokens[0], { raw: "{umbValue: title}", componentAlias: "umbValue", propertyAlias: "title", filters: [], index: 0 });
  assert.deepEqual(r.contentAliases, ["title"]);
});

test("= marker with filters", () => {
  const r = scan("{= title | truncate: 28 }");
  assert.equal(r.componentTokens[0].componentAlias, "umbValue");
  assert.equal(r.componentTokens[0].propertyAlias, "title");
  assert.deepEqual(r.componentTokens[0].filters, [{ alias: "truncate", args: ["28"] }]);
  assert.deepEqual(r.contentAliases, ["title"]);
});

test("# localize is a dictionary key, not an alias", () => {
  const r = scan("{#general_name}");
  assert.equal(r.componentTokens[0].componentAlias, "umbLocalize");
  assert.deepEqual(r.contentAliases, []);
});

test("umbContentName references its alias", () => {
  const r = scan("{umbContentName: picker}");
  assert.equal(r.componentTokens[0].componentAlias, "umbContentName");
  assert.deepEqual(r.contentAliases, ["picker"]);
});

test("expression with || and filter pipes", () => {
  const r = scan("${ title || rte | stripHtml | truncate: 38}");
  assert.equal(r.expressions.length, 1);
  assert.deepEqual(r.contentAliases, ["title", "rte"]);
});

test("$settings dot access", () => {
  const r = scan("${ $settings.subtitle }");
  assert.deepEqual(r.settingsAliases, ["subtitle"]);
  assert.deepEqual(r.contentAliases, []);
});

test("$settings bracket access", () => {
  assert.deepEqual(scan("${ $settings['x'] }").settingsAliases, ["x"]);
  assert.deepEqual(scan('${ $settings["y"] }').settingsAliases, ["y"]);
  assert.deepEqual(scan("${ $settings?.z }").settingsAliases, ["z"]);
});

test("$index", () => {
  const r = scan("${ $index + 1 }");
  assert.equal(r.usesIndex, true);
  assert.deepEqual(r.contentAliases, []);
  assert.equal(scan("{= title}").usesIndex, false);
});

test("words inside string literals are not aliases", () => {
  const r = scan("${ image ? '(With image)' : '' }");
  assert.deepEqual(r.contentAliases, ["image"]);
  assert.deepEqual(scan('${ a ? "x y" : `z` }').contentAliases, ["a"]);
});

test("method calls are not aliases", () => {
  assert.deepEqual(scan("${ name.toUpperCase() }").contentAliases, ["name"]);
});

test("escaped \\${ is not an expression", () => {
  const r = scan("\\${ not an expression }");
  assert.equal(r.expressions.length, 0);
  assert.deepEqual(r.contentAliases, []);
});

test("custom component only tokenised when registered", () => {
  const unregistered = scan("{myThing: foo}");
  assert.equal(unregistered.componentTokens.length, 0);
  assert.deepEqual(unregistered.contentAliases, []);

  const registered = scan("{myThing: foo}", { components: [...components, { alias: "myThing" }], filterAliases });
  assert.equal(registered.componentTokens.length, 1);
  assert.equal(registered.componentTokens[0].componentAlias, "myThing");
  assert.deepEqual(registered.contentAliases, ["foo"]);
});

test("nested braces in an expression", () => {
  const r = scan("${ {a:1}.a }");
  assert.equal(r.expressions.length, 1);
  assert.equal(r.expressions[0].raw, "${ {a:1}.a }");
  assert.deepEqual(r.contentAliases, []);
});

test("unbalanced component is not a token", () => {
  const r = scan("{umbValue: x");
  assert.equal(r.componentTokens.length, 0);
  assert.deepEqual(r.contentAliases, []);
});

test("keywords and literals are not aliases", () => {
  assert.deepEqual(scan("${ typeof x === 'string' ? true : null }").contentAliases, ["x"]);
});

test("code spans are not tokenised", () => {
  const r = scan("`{=title}` and {=body}");
  assert.equal(r.componentTokens.length, 1);
  assert.deepEqual(r.contentAliases, ["body"]);
});

test("multiple tokens keep source order and indices", () => {
  const md = "#${ $index + 1 }: {=title} - {umbContentName: picker}";
  const r = scan(md);
  assert.equal(r.usesIndex, true);
  assert.deepEqual(r.contentAliases, ["title", "picker"]);
  for (const t of r.componentTokens) assert.equal(md.substr(t.index, t.raw.length), t.raw);
});

test("bare filter alias inside an expression is not a property", () => {
  assert.deepEqual(scan("${ fallback }").contentAliases, []);
});

test("non-string input is safe", () => {
  assert.deepEqual(scan(undefined).componentTokens, []);
  assert.deepEqual(scan(null).contentAliases, []);
});
