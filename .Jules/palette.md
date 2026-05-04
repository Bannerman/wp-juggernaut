## 2026-05-04 - Added aria-label to repeater delete button
**Learning:** Icon-only buttons for repeating fields often miss context about *which* item they remove, leading to poor screen reader accessibility. Dynamically using the field label (e.g. `Remove ${field.label} item`) solves this.
**Action:** When creating repeating or dynamic list components, ensure the delete/remove button's `aria-label` incorporates the item's name or field label.
