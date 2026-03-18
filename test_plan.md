Wait, if memory says they include `aria-label="Close modal"` to improve accessibility, but `grep` couldn't find them, it means they are currently *missing* and this is a known task/expectation to fix them.

My UX Enhancement:
Add `aria-label` to icon-only buttons across components:
- `EditModal.tsx`: Close button `<button onClick={onClose} ...><X /></button>` -> add `aria-label="Close modal"`
- `ConvertPostTypeModal.tsx`: Close button `<button onClick={onClose} ...><X /></button>` -> add `aria-label="Close modal"`
- `src/components/fields/RepeaterRenderer.tsx`: Trash buttons `<button onClick={() => removeItem(index)} ...><Trash2 /></button>` -> add `aria-label="Remove item"`

Let's do this!
