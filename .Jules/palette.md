## 2025-02-18 - [Modal Accessibility Gaps]
**Learning:** Modals in this codebase (e.g., `EditModal`) were missing standard accessibility features like `role="dialog"`, `aria-modal="true"`, and keyboard support (Escape key). This suggests other custom modal implementations might have similar gaps.
**Action:** Always verify keyboard accessibility (Escape, Focus trap) and ARIA roles when touching modal components.
