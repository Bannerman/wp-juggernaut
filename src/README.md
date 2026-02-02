# PLEXKITS Resource Manager

A local Next.js application for syncing, editing, and pushing WordPress Resource posts from PLEXKITS.com via the REST API, enables bulk editing of Resource posts, and pushes changes back.

## Features

- **Full Sync**: Pull all resources and taxonomy terms from WordPress
- **Incremental Sync**: Only fetch posts modified since last sync
- **Bulk Editing**: Edit titles, statuses, taxonomies, and meta fields
- **Local Database**: SQLite storage for offline editing
- **Conflict Detection**: Warns when server data changed since last sync
- **Batch Push**: Efficiently push changes using WP batch API

## Prerequisites

Before running this app, ensure your WordPress site has:

1. **REST API enabled** (WordPress 4.7+)
2. **Resource CPT** with `show_in_rest => true`
3. **MB REST API plugin** installed and active
4. **Application Password** created in WP Admin

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` with your WordPress credentials:
   ```
   WP_BASE_URL=https://plexkits.com
   WP_USERNAME=your-username
   WP_APP_PASSWORD=xxxx xxxx xxxx xxxx
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open in browser:**
   ```
   http://localhost:3000
   ```

## Usage

### Initial Sync

Click the **Sync** button to pull all resources and taxonomy terms from WordPress. This creates a local SQLite database with all your data.

### Editing Resources

1. Click a resource row to select it
2. Click the **Edit** icon to open the edit modal
3. Modify title, status, taxonomies, or meta fields
4. Click **Save Changes**

Modified resources are marked with a yellow indicator and tracked locally.

### Filtering

- Use the search box to filter by title/slug
- Filter by status (publish, draft, pending, private)
- Toggle "Unsaved only" to see only modified resources
- Expand taxonomy filters for advanced filtering

### Pushing Changes

Click **Push Changes** to send all modified resources back to WordPress. The app will:

1. Check for conflicts (server modifications since last sync)
2. Batch updates in groups of 25
3. Report success/failure for each resource
4. Re-sync to update local timestamps

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── resources/     # GET resources, PATCH resource
│   │   ├── terms/         # GET taxonomy terms
│   │   ├── stats/         # GET sync stats
│   │   ├── sync/          # POST sync (pull from WP)
│   │   ├── push/          # POST push (send to WP)
│   │   └── test-connection/
│   ├── layout.tsx
│   ├── page.tsx           # Main UI
│   └── globals.css
├── components/            # React components
│   ├── ResourceTable.tsx
│   ├── FilterPanel.tsx
│   └── EditModal.tsx
└── lib/                   # Core logic
    ├── db.ts              # SQLite database
    ├── wp-client.ts       # WP REST API client
    ├── sync.ts            # Sync engine
    ├── push.ts            # Push logic
    ├── queries.ts         # Local DB queries
    └── utils.ts           # Utilities
```

## Taxonomies

The app supports all 9 PlexKits taxonomies:

| Taxonomy | REST Endpoint |
|----------|---------------|
| Resource Type | `/wp-json/wp/v2/resource-type` |
| Topic | `/wp-json/wp/v2/topic` |
| Intent | `/wp-json/wp/v2/intent` |
| Audience | `/wp-json/wp/v2/audience` |
| League | `/wp-json/wp/v2/leagues` |
| Access Level | `/wp-json/wp/v2/access_level` |
| Competition Format | `/wp-json/wp/v2/competition_format` |
| Bracket Size | `/wp-json/wp/v2/bracket-size` |
| File Format | `/wp-json/wp/v2/file_format` |

## Meta Box Fields

Supported custom fields from MB REST API:

- `intro_text` - Intro paragraph
- `text_content` - Main WYSIWYG content
- `timer_title` - Countdown heading
- `timer_single_datetime` - Countdown target
- `version` - Resource version
- `updated_for_year` - Year designation
- `group_features` - Features list (array)
- `group_changelog` - Changelog entries (array)
- `download_sections` - Download links (nested array)

## Security

- Credentials stored in `.env.local` (gitignored)
- Application passwords can be revoked in WP Admin
- HTTPS required in production
- No credentials exposed to client-side code

## Troubleshooting

**"Failed to sync" error:**
- Check your `.env.local` credentials
- Verify WordPress REST API is accessible
- Ensure MB REST API plugin is active

**"Conflict detected" when pushing:**
- Someone modified the resource in WordPress
- Click Sync to get latest data
- Re-apply your changes and push again

**Empty resource list:**
- Run a Full Sync first
- Check if your WP user has read permissions

## License

Private - PlexKits internal tool
