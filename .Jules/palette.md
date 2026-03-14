
## 2024-03-14 - [TabLayoutEditor Missing ARIA Labels]
**Learning:** Icon-only buttons used for layout manipulation (e.g., move up, move down, remove) and text editing (e.g., rename) often lack `aria-label`s, presenting an accessibility barrier for screen reader users trying to configure dynamic UI views.
**Action:** When adding or modifying configuration panels with dynamic list items or tabs, explicitly add descriptive `aria-label`s (like `aria-label="Rename tab ${tab.label}"`) to all icon-only action buttons.
