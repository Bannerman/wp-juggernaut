# WI-010: Expand Module Test Coverage

## Status
To Do

## Description
Current tests in `src/lib/__tests__/` cover 5 core modules (`db`, `wp-client`, `sync`, `queries`, `push`). Add targeted tests for currently untested modules, starting with high-risk paths (API routes, plugin system, and profile/site-config behaviors).

## Module
qa

## Acceptance Criteria
- A test coverage plan exists for untested modules in the manifest.
- Unit/integration tests are added for API routes, plugins, profiles, and site-config.
- Test suite passes in CI and locally.
- `completionMetrics.testsTotal` and `testsComplete` are updated after implementation.
