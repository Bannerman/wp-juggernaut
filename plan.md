1. **Explore**:
   - Verify `src/components/EditModal.tsx` for `<button ...><X /></button>`.
   - Verify `src/components/ConvertPostTypeModal.tsx` for `<button ...><X /></button>`.
   - Verify `src/components/fields/RepeaterRenderer.tsx` for `<button ...><Trash2 /></button>`.

2. **Implement**:
   - Add `aria-label="Close modal"` to `EditModal.tsx` close button.
   - Add `aria-label="Close modal"` to `ConvertPostTypeModal.tsx` close button.
   - Add `aria-label="Remove item"` to `RepeaterRenderer.tsx` trash button.

3. **Verify**:
   - Run `cd src && pnpm lint`.
   - Run `cd src && pnpm test`.
   - Check if tests pass and linting is clean.

4. **Pre-commit**:
   - Ensure proper testing, verification, review, and reflection are done (following `pre_commit_instructions` tool).

5. **Submit**:
   - Create a PR for the UX accessibility improvements.
