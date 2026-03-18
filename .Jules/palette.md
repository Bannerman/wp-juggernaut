## 2024-05-18 - Icon-only buttons accessibility

**Learning:** When reviewing components, some icon-only buttons like the ones used to remove items in `RepeaterRenderer`, close modals (`EditModal`, `ConvertPostTypeModal`), and collapse components (`RepeaterRenderer`) lack `aria-label`s, rendering them inaccessible to screen readers.
**Action:** Consistently add descriptive `aria-label`s to all icon-only buttons to ensure they are perceivable and operable by all users.
