# WI-001: MAIA Bootstrap Audit

## Status: To Do

## Description

This project recently re-adopted the MAIA management framework. The management files
have been restored but need to be verified and filled in against the actual codebase.

## Tasks

- [ ] **Audit `project-manifest.yaml`** — Walk through every module in `moduleRegistry` and verify:
  - The `implementationPath` exists and contains real code
  - The `status` is accurate (most are set to `Integrated` as a starting point)
  - The `specFilePath` is either a real file or empty string for post-spec modules
  - Update `lastUpdated` timestamps to today's date for confirmed modules
- [ ] **Audit `completionMetrics`** — Count actual test files in `src/lib/__tests__/` and update `testsComplete`/`testsTotal`
- [ ] **Verify Phase 2 progress** — Confirm `p2_04_quality_assurance` is the correct "in progress" step
- [ ] **Populate `docs/requirements/`** — If functional/non-functional requirements docs exist elsewhere (e.g. in `docs/v1.0-spec.md`), either move them or create lightweight summaries
- [ ] **Populate `docs/standards/coding_standards.md`** — Extract from existing standards if they exist, or generate from the project's AGENTS.md Section 5
- [ ] **Create work items** for any known bugs, planned features, or v1.0 release blockers in `docs/work-items/`
