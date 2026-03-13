
## 2024-05-15 - Missing ARIA Labels on Icon-Only Buttons
**Learning:** In components like `TabLayoutEditor`, `EditModal`, and `ConvertPostTypeModal`, icon-only buttons (like 'X' for close, 'Chevron' for reordering) were relying only on `title` attributes for tooltips or visual context, but lacked explicit `aria-label` attributes for proper screen reader accessibility.
**Action:** Always provide an explicit `aria-label` attribute describing the button's action for all icon-only interactive elements to ensure accessibility for screen reader users.
