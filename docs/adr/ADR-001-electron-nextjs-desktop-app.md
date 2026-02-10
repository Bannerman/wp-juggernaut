# ADR-001: Electron + Next.js for Desktop App

## Status
Accepted

## Date
2024-01

## Context

Juggernaut needs to be a desktop application that:
- Works offline with local data
- Accesses the filesystem (SQLite database, profile JSON files)
- Has a modern, responsive UI
- Supports auto-updates for distribution
- Runs on macOS (with potential future cross-platform support)

We considered several approaches:
1. **Pure web app** — Cannot access filesystem, requires a server, no offline support
2. **Tauri** — Lighter weight, Rust-based, but smaller ecosystem and less mature
3. **Electron + React (CRA/Vite)** — Mature, but no server-side rendering or API routes
4. **Electron + Next.js** — Full-stack framework inside a desktop shell

## Decision

Use **Electron 31** as the desktop shell with **Next.js 14 (App Router)** as the web framework.

- Electron provides native OS integration (Keychain, window management, auto-updates, code signing)
- Next.js App Router provides API routes that serve as the backend, eliminating the need for a separate server process
- In production, Electron starts a local Next.js server (`electron/server.ts`) and loads it in a BrowserWindow
- In development, Electron connects to the Next.js dev server on `localhost:3000`

## Consequences

**Positive:**
- API routes in `src/app/api/` act as a clean backend layer — UI never touches SQLite directly
- React Server Components and client components coexist naturally
- Hot module reloading in development
- Mature ecosystem: `electron-builder` for packaging, `electron-updater` for auto-updates
- Large community, easy to find solutions for common problems

**Negative:**
- Large app bundle size (~150MB+ for Electron)
- Native modules (better-sqlite3) must be compiled for Electron's Node.js ABI version, which can differ from the system Node.js. This causes `MODULE_NOT_FOUND` errors if the wrong binary is loaded. Workaround: `npm rebuild better-sqlite3`
- Two-process architecture (main + renderer) adds complexity for IPC
- Must use `contextIsolation: true` and a preload script for security
