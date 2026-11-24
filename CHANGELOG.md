# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0]

First release. One package supports Umbraco 17, 18 and 19.

### Added

- **Label preview** tab on Block List, Block Grid, Block RTE and Block Single block type workspaces: the block's
  Label field, a live UFM preview rendered with mock data, and notes for anything that can't be previewed.
- Mock values panel: switch each referenced property (including `$settings.*`) between Filled, Empty, Cleared (text
  editors only) and Long, edit sample values, set `$index`, and inspect the mock object.
- Mock for the Element Picker editor (`Umbraco.ElementPicker`, Umbraco 18+); `umbElementName` stays a placeholder.
- `umbFormName` (Umbraco Forms) is shown as a placeholder instead of a custom-component note.
- Note when a label uses a deprecated kebab-case filter (`strip-html`, `title-case`, `word-limit`), either as a
  component filter (still works until Umbraco 20) or inside `${ }` (not a filter there).
- NuGet dependency range `[17.0.0, 20.0.0)`.
