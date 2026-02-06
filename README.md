# **Juggernaut**

A modular, plugin-based WordPress content management platform. Juggernaut is a desktop application (Electron + Next.js) for syncing, bulk editing, and pushing WordPress posts with a local-first architecture.

## **Features**

- **Local-First**: SQLite database for offline editing with conflict detection
- **Bulk Operations**: Sync and push multiple resources in batches
- **Plugin System**: Extensible architecture with MetaBox and SEOPress support
- **Profile-Driven**: Site-specific configurations for taxonomies, fields, and UI
- **Auto-Updates**: GitHub Releases integration for seamless updates
- **Cross-Platform**: Builds for macOS (Intel & Apple Silicon)

## **Installation**

### Download the App
1. Go to [Releases](https://github.com/Bannerman/wp-juggernaut/releases)
2. Download the appropriate DMG:
   - `Juggernaut-x.x.x-arm64.dmg` for Apple Silicon Macs (M1/M2/M3)
   - `Juggernaut-x.x.x.dmg` for Intel Macs
3. Open the DMG and drag Juggernaut to your Applications folder

### First Launch (Important)
Since the app is not code-signed, macOS will block it by default:
1. Right-click (or Control-click) on Juggernaut in Applications
2. Select "Open" from the context menu
3. Click "Open" in the security dialog
4. The app will now open normally in the future

### Auto-Updates
Once installed, Juggernaut will automatically check for updates on launch and notify you when a new version is available.

## **Development Setup**

### Prerequisites
- Node.js 20+
- npm 9+

### Clone and Install
```bash
git clone https://github.com/Bannerman/wp-juggernaut.git
cd wp-juggernaut/src
npm install
```

### Environment Configuration
Copy `src/.env.example` to `src/.env.local`:
```
WP_BASE_URL=https://your-site.com
WP_USERNAME=<wp-username>
WP_APP_PASSWORD=<application-password>
DATABASE_PATH=./data/juggernaut.db
```

**WordPress Requirements:**
- REST API enabled
- Custom Post Type with `show_in_rest: true`
- MB REST API plugin active (for MetaBox fields)
- Application Password created for API access

### Development Commands
```bash
cd src
npm run dev              # Start Next.js dev server (http://localhost:3000)
npm run electron:dev     # Run Electron app in development mode
npm run build            # Build Next.js for production
npm run electron:build:mac  # Build macOS app locally
```

## **Release Process**

### Creating a New Release

1. **Update the version** in `src/package.json`:
   ```json
   {
     "version": "1.0.0"
   }
   ```

2. **Commit the version change**:
   ```bash
   git add src/package.json
   git commit -m "Release v1.0.0"
   git push origin main
   ```

3. **Create and push a tag**:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

4. **GitHub Actions will automatically**:
   - Build the app for Intel and Apple Silicon Macs
   - Create a GitHub Release
   - Upload DMG files and auto-update manifests
   - Users will be notified of the update

### Monitoring the Build
- Watch the build progress at: https://github.com/Bannerman/wp-juggernaut/actions
- The release will appear at: https://github.com/Bannerman/wp-juggernaut/releases

## **Architecture**

```
wp-juggernaut/
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── api/             # API routes
│   │   ├── page.tsx         # Main dashboard
│   │   ├── settings/        # Settings page
│   │   └── diagnostics/     # Diagnostics page
│   ├── components/          # React components
│   ├── electron/            # Electron main process
│   │   ├── main.ts          # Window management, auto-updater
│   │   ├── preload.ts       # Secure IPC bridge
│   │   └── server.ts        # Production server
│   ├── lib/                 # Business logic
│   │   ├── plugins/         # Plugin system
│   │   ├── profiles/        # Site configurations
│   │   ├── db.ts            # SQLite database
│   │   ├── sync.ts          # Sync engine
│   │   ├── push.ts          # Push engine
│   │   └── wp-client.ts     # WordPress API client
│   └── electron-builder.yml # Build configuration
├── .github/workflows/       # CI/CD
│   └── release.yml          # Auto-release workflow
└── docs/                    # Documentation
```

## **Documentation**

- `CLAUDE.md` - Development instructions for Claude Code
- `AGENTS.md` - AI agent guidelines
- `docs/` - Requirements, API contracts, coding standards

## **Troubleshooting**

### "App is damaged" or "Cannot be opened"
This happens because the app isn't code-signed. Use the right-click > Open method described in Installation.

### App won't connect to WordPress
1. Verify your `.env.local` settings
2. Ensure the WordPress REST API is accessible
3. Check that your Application Password is correct
4. Verify MB REST API plugin is active

### Database errors
Delete the database file and restart:
```bash
rm src/data/juggernaut.db
```

## **Future: Code Signing Setup**

To distribute a properly signed app (removes security warnings):

1. **Get an Apple Developer account** ($99/year)

2. **Create certificates** in Apple Developer portal:
   - "Developer ID Application" certificate

3. **Export certificate** as .p12 file

4. **Add GitHub Secrets**:
   - `MAC_CERTIFICATE` - Base64-encoded .p12: `base64 -i cert.p12 | pbcopy`
   - `MAC_CERTIFICATE_PASSWORD` - Certificate password
   - `APPLE_ID` - Your Apple ID email
   - `APPLE_APP_SPECIFIC_PASSWORD` - From appleid.apple.com
   - `APPLE_TEAM_ID` - Your team ID from developer portal

5. **Update workflow** to use code signing (uncomment CSC_LINK in release.yml)

## **License**

Private - All rights reserved.
