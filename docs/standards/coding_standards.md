# Coding Standards

## TypeScript
- Use strict TypeScript settings.
- Add explicit return types to functions and methods.
- Use `import type` for type-only imports.
- Do not use `any`.

## Database
- Use `better-sqlite3` with the singleton pattern in `src/lib/db.ts`.
- Use prepared statements for queries and writes.
- Use transactions for multi-operation writes.

## API and WordPress Integration
- Respect WordPress batch limits (maximum 25 items per batch).
- Use `modified_gmt` for conflict detection before push operations.
- Return clear HTTP status codes and error messages from API routes.

## UI
- Use TailwindCSS for styling.
- Use functional React components.
- Define explicit TypeScript interfaces for component props.

## Function Design
- Keep functions to a maximum of 50 lines where practical.
- Keep function parameter count to 3 or fewer where practical.
- Keep responsibilities focused and single-purpose.

## Import Order
- Order imports in this sequence:
1. External packages
2. `@/` absolute imports
3. Relative imports
4. Type-only imports
5. CSS imports
