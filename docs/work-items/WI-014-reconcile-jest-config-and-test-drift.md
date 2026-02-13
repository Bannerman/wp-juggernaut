# WI-014: Reconcile Jest Config and Test Drift

## Status
Done

## Description
Current test runs fail due to both Jest configuration issues and test expectations that no longer match the refactored implementation (`posts/post_meta/post_terms`, dynamic taxonomies, updated push flow). Stabilize Jest config first, then align tests to current behavior.

## Module
quality-assurance

## Acceptance Criteria
- Jest config uses valid `coverageThreshold` key.
- Build artifacts (`dist-electron`, `.next`, packaged standalone output) are excluded from test/module scanning.
- Existing failing suites are updated to match current implementation behavior.
- `npm run test -- --runInBand` passes locally from `src/`.
