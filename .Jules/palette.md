## 2024-05-15 - ARIA Labels on Repeater Remove Buttons
**Learning:** Icon-only remove buttons in nested repeater fields lacked proper `aria-label` attributes, making them inaccessible to screen reader users as they could not identify which item or field they were removing.
**Action:** Always verify that dynamically generated or repeated icon-only buttons receive context-aware `aria-label`s (like `Remove ${field.label}`) to maintain accessibility across complex forms.
