# **Juggernaut**

A modular, plugin-based WordPress content management platform. Juggernaut is a desktop application (Electron + Next.js) for syncing, bulk editing, and pushing WordPress posts with a local-first architecture.

## **Features**

- **Local-First**: SQLite database for offline editing with conflict detection
- **Bulk Operations**: Sync and push multiple resources in batches
- **Plugin System**: Extensible architecture with MetaBox and SEOPress support
- **Profile-Driven**: Site-specific configurations for taxonomies, fields, and UI
- **Auto-Updates**: GitHub Releases integration for seamless updates
- **Cross-Platform**: Builds for macOS (Intel & Apple Silicon)

## **Quick Start**

### Development
```bash
cd src
npm install
npm run dev          # Start Next.js dev server
npm run electron:dev # Run Electron in development
```

### Build Desktop App
```bash
cd src
npm run electron:build:mac  # Build macOS app
```

### Environment Setup
Copy `src/.env.example` to `src/.env.local`:
```
WP_BASE_URL=https://your-site.com
WP_USERNAME=<wp-username>
WP_APP_PASSWORD=<application-password>
DATABASE_PATH=./data/juggernaut.db
```

## **Architecture**

- **Electron** - Desktop app wrapper with auto-updates
- **Next.js 14** - App Router for UI and API routes
- **SQLite** - Local database via better-sqlite3
- **Plugin System** - Modular extensions for WordPress integrations
- **Profile System** - Site-specific configurations

## **Documentation**

- `CLAUDE.md` - Claude Code instructions
- `AGENTS.md` - AI agent guidelines
- `docs/` - Requirements, API contracts, standards

## **Release Process**

1. Update version in `src/package.json`
2. Create git tag: `git tag v1.0.0`
3. Push tag: `git push origin v1.0.0`
4. GitHub Actions builds and publishes automatically

## **License**

Private - All rights reserved.
