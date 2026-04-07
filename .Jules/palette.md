## 2024-11-20 - Icon-only buttons accessibility
**Learning:** Icon-only buttons throughout the app (EditModal, ConvertPostTypeModal, TabLayoutEditor) frequently lack `aria-label` attributes, which makes them inaccessible to screen readers. Relying solely on visual context or `title` attributes is insufficient for proper accessibility.
**Action:** Ensure that all icon-only buttons receive an explicit `aria-label` describing their function.
