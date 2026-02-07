# WI-005: Add Spec for WordPress Discovery Module

## Status
To Do

## Description
Create a formal MAIA module specification for `src/lib/discovery.ts`, including discovery inputs, capability detection outputs, and failure/retry behavior.

## Module
discovery

## Acceptance Criteria
- `modules/discovery/spec.yaml` exists.
- Spec defines discovery API and returned capability model.
- Spec documents error handling and compatibility assumptions.
- `project-manifest.yaml` is updated to reference the new spec path.
