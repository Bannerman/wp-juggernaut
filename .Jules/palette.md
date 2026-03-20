## 2024-05-24 - Icon-only buttons lack ARIA labels
**Learning:** Many icon-only inline action buttons (e.g., in `TabLayoutEditor`, `EditModal`, `ConvertPostTypeModal`, `FieldMappingEditor`) used `title` attributes for tooltips but omitted `aria-label`, making them inaccessible to screen readers without hovering.
**Action:** When creating or modifying inline action buttons that only contain icons, explicitly include an `aria-label` that succinctly describes the action (e.g., "Close modal", "Rename tab", "Remove field").
