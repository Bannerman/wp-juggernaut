# Coding Standards

These are the enforced coding standards for the Juggernaut codebase. All code — whether written by humans or AI agents — must follow these rules.

For UI-specific patterns (colors, buttons, spacing, typography), see [`design_standards.md`](design_standards.md).

---

## TypeScript

- Use **strict mode** (`"strict": true` in tsconfig).
- Add **explicit return types** to all functions and methods.
- Use `import type` for type-only imports.
- **Never use `any`** — use `unknown` and narrow with type guards.
- Prefer interfaces over type aliases for object shapes.
- Use `readonly` for properties that shouldn't be mutated.

## React Components

- Use **arrow function components** with explicit return types.
- Add `'use client'` directive to all client-side components.
- Define **TypeScript interfaces** for all component props (named `{Component}Props`).
- Name event handlers `handle*` (e.g., `handleSave`, `handleFilterChange`).
- Name callback props `on*` (e.g., `onSave`, `onChange`).
- Avoid inline styles — use TailwindCSS utility classes exclusively.
- Use `cn()` from `src/lib/utils.ts` (clsx + tailwind-merge) for conditional classes.

## API Routes (Next.js)

- **One exported handler per HTTP method** (`GET`, `POST`, `PUT`, `DELETE`).
- Always return `NextResponse.json()` with appropriate status codes.
- Wrap all handler logic in **try-catch** with a generic 500 fallback.
- Validate request body/params before processing.
- Return actionable error messages in the response body.

## Database

- Use `better-sqlite3` with the **singleton pattern** in `src/lib/db.ts`.
- Use **prepared statements** for all queries and writes (no string concatenation).
- Use **transactions** for multi-operation writes (wrap in `db.transaction()`).
- Never construct SQL with template literals containing user data.

## WordPress Integration

- Respect WordPress **batch limits** (maximum 25 items per batch).
- Use `modified_gmt` for **conflict detection** before push operations.
- All WordPress API calls go through `src/lib/wp-client.ts`.
- Use profile data for post types, taxonomies, and site URLs — never hardcode.

## Function Design

- Keep functions to a **maximum of 50 lines** where practical.
- Keep parameter count to **3 or fewer** where practical; use an options object for more.
- Keep responsibilities **focused and single-purpose**.
- Add **JSDoc comments** to all exported/public functions with `@param` and `@returns`.

## Import Order

Order imports in this sequence, with a blank line between groups:

1. External packages (`react`, `next/server`, `better-sqlite3`, etc.)
2. `@/` absolute imports (`@/lib/db`, `@/components/...`)
3. Relative imports (`./utils`, `../profiles`)
4. Type-only imports (`import type { ... }`)
5. CSS imports (`./globals.css`)

## Naming Conventions

- **Files**: kebab-case for lib files (`wp-client.ts`), PascalCase for components (`EditModal.tsx`)
- **Variables/functions**: camelCase (`getDb`, `fetchAllResources`)
- **Types/interfaces**: PascalCase (`SyncResult`, `JuggernautPlugin`)
- **Constants**: UPPER_SNAKE_CASE (`SCHEMA_VERSION`, `CORE_TAB_IDS`)
- **Database columns**: snake_case (`is_dirty`, `modified_gmt`, `resource_id`)

## Error Handling

- Use **try-catch** in all API routes and async operations.
- Log errors with `console.error()` including context (module name, operation).
- Return errors to callers — don't swallow silently.
- For sync/push operations, collect errors in an array and continue (partial success is acceptable).

## Git Commits

Follow **Conventional Commits**: `type(scope): description`

- **Types**: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`, `ci`, `style`
- **Scope**: module name (`sync`, `db`, `push`, `ui`, `plugins`, `electron`, `settings`)
- **Examples**:
  - `feat(sync): add progress tracking to sync engine`
  - `fix(db): correct type mismatch in resource query`
  - `refactor(ui): extract BasicTab from EditModal`

## Security

- **No hardcoded secrets** — use `.env.local` or macOS Keychain (Electron).
- All external input must be **validated and sanitized** server-side.
- Use `contextIsolation: true` in Electron.
- Credentials are never exposed to client-side code.
