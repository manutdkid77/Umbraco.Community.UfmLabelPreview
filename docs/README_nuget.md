# UFM Label Preview for Umbraco

See how a block's label will render while you're still configuring it.

This package adds a **Label preview** tab to the block type editor (Block List, Block Grid, Block RTE and Block Single)
in Umbraco 17. The tab shows the Label field, a live preview rendered by Umbraco's own UFM renderer using **mock
data**, and switches to set each referenced property to **Filled**, **Empty** or **Long**.

- Mock values have the same shape each property editor stores (rich text `{ markup }`, pickers, dates and so on).
- `$settings` and `$index` work, mirroring core.
- Lookups of real content and custom UFM components from other packages are shown as placeholders, never resolved.
- Client-side only. No content lookups, no telemetry. It doesn't change how labels are saved or rendered.

## Installation

```bash
dotnet add package Umbraco.Community.UfmLabelPreview
```

Restart the site, open a block type and choose the **Label preview** tab.

Supports Umbraco 17.x.
