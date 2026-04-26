## 2024-05-18 - [Add aria-label to icon-only close buttons]
**Learning:** Icon-only buttons without `aria-label` or inner text fail screen reader accessibility tests. Some buttons only use `title`, which may not be fully announced by all screen readers.
**Action:** Ensure all icon-only buttons (like modals' X buttons and tab actions) have an explicit `aria-label` attribute describing their function.
