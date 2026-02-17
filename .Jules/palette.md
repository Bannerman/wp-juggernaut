## 2024-05-24 - Accessible Expandable Panels
**Learning:** Collapsible panels like accordion filters require explicit state communication. The `aria-expanded` attribute on the trigger button is crucial for screen readers to know if the content is visible. Additionally, `aria-controls` pointing to the `id` of the content container helps establish a relationship between the button and the content it controls.
**Action:** Always pair `aria-expanded` with `aria-controls` on toggle buttons, and ensure the target element has a matching `id`.
