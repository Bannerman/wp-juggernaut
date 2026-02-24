# Juggernaut MCP Server

The Juggernaut MCP server lets AI assistants (Claude Code, Claude Desktop, Cursor, etc.) read and write WordPress content through Juggernaut's local SQLite database.

Changes made via MCP are **local only** — they mark posts as dirty so you can review them in the Juggernaut UI before pushing to WordPress.

## Setup

### 1. Build the server

```bash
cd src
npm run build:mcp
```

This compiles `src/mcp-server/index.ts` to `src/mcp-server/dist/index.js`.

### 2. Configure your MCP client

The repo includes a `.mcp.json` at the project root that Claude Code picks up automatically:

```json
{
  "mcpServers": {
    "juggernaut": {
      "command": "node",
      "args": ["src/mcp-server/dist/index.js"]
    }
  }
}
```

For **Claude Desktop**, add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "juggernaut": {
      "command": "node",
      "args": ["/full/path/to/wp-juggernaut/src/mcp-server/dist/index.js"],
      "env": {
        "DATABASE_PATH": "/full/path/to/wp-juggernaut/src/data/plexkits.db"
      }
    }
  }
}
```

### 3. Database path

The server looks for the database in this order:

1. `DATABASE_PATH` environment variable (if set)
2. `src/data/juggernaut.db` (default, relative to compiled output)

If your database has a different name (e.g. `plexkits.db`), set the `DATABASE_PATH` env var in your MCP config.

**Important:** The database must already be initialized by the Juggernaut app (run at least one sync first). The MCP server does not run migrations.

## Available Tools

### list_posts

List posts with optional filters. Returns summaries (no full content).

| Parameter | Type | Description |
|-----------|------|-------------|
| `post_type` | string | Filter by post type (`resource`, `post`, `product`) |
| `status` | string | Filter by status (`publish`, `draft`, `pending`, `private`, `trash`, `future`) |
| `is_dirty` | boolean | Filter by dirty flag (`true` = locally modified) |
| `search` | string | Search in title and content |
| `limit` | number | Max results (default: 50, max: 200) |
| `offset` | number | Pagination offset (default: 0) |

**Example prompt:** "List all draft resources"

### get_post

Get a single post with full content, meta fields, taxonomy terms, and plugin data (SEO).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | WordPress post ID |

**Example prompt:** "Get the details for post 10573"

### update_post

Update a post's fields and/or meta data. Marks the post as dirty.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | WordPress post ID |
| `title` | string | | Post title |
| `content` | string | | Post content (HTML) |
| `excerpt` | string | | Post excerpt |
| `slug` | string | | URL slug |
| `status` | string | | Post status (`publish`, `draft`, `pending`, `private`) |
| `meta` | object | | Meta fields as key-value pairs |

**Example prompt:** "Update the title of post 100 to 'New Guide Title'"

**Example prompt:** "Set the download_version meta field to '2.1' on post 3631"

### update_seo

Update SEO metadata for a post. Stored as SEOPress plugin data.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `post_id` | number | Yes | WordPress post ID |
| `title` | string | | SEO title |
| `description` | string | | Meta description |
| `canonical` | string | | Canonical URL |
| `og_title` | string | | Open Graph title |
| `og_description` | string | | Open Graph description |
| `og_image` | string | | Open Graph image URL |
| `noindex` | boolean | | Set noindex |
| `nofollow` | boolean | | Set nofollow |

**Example prompt:** "Write an SEO description for post 100 based on its content"

### list_terms

List taxonomy terms, optionally filtered by taxonomy.

| Parameter | Type | Description |
|-----------|------|-------------|
| `taxonomy` | string | Taxonomy slug to filter (e.g. `category`, `resource-type`). Omit to list all. |

**Example prompt:** "What resource types are available?"

### update_post_terms

Assign taxonomy terms to a post. Replaces all existing terms for the given taxonomy.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `post_id` | number | Yes | WordPress post ID |
| `taxonomy` | string | Yes | Taxonomy slug |
| `term_ids` | number[] | Yes | Array of term IDs to assign |

**Example prompt:** "Categorize post 300 under News and Updates"

### get_stats

Get overview statistics about posts in the local database.

| Parameter | Type | Description |
|-----------|------|-------------|
| `post_type` | string | Filter stats by post type |

**Example prompt:** "How many dirty posts need to be pushed?"

### get_post_history

View the change log for a post — what fields were changed, with old and new values.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `post_id` | number | Yes | WordPress post ID |
| `limit` | number | | Max entries (default: 20, max: 100) |

**Example prompt:** "Show me what changed on post 100"

## Workflow

The MCP server is designed for a **review-before-publish** workflow:

1. **AI makes changes** via MCP tools (update_post, update_seo, update_post_terms)
2. **Posts are marked dirty** — changes only exist in the local database
3. **Review in Juggernaut UI** — open the app, see dirty indicators on changed fields
4. **Push when ready** — use the Juggernaut push feature to send changes to WordPress

This means the AI can never accidentally publish changes directly to your live site.

## Concurrent Access

The MCP server runs as a separate process from the Juggernaut Electron app. Both can access the SQLite database simultaneously thanks to:

- **WAL mode** — allows concurrent readers and a single writer
- **busy_timeout = 5000ms** — waits up to 5 seconds if the database is locked

## Troubleshooting

**Server won't start / "database not found"**
- Make sure you've run at least one sync in the Juggernaut app first
- Check that `DATABASE_PATH` points to the correct `.db` file
- Run `npm run build:mcp` from `src/` to compile

**Changes not showing in the app**
- The Juggernaut UI reads from the same database, but you may need to refresh the resource list
- Changes made via MCP mark posts as `is_dirty = 1` — look for the dirty indicators

**"SQLITE_BUSY" errors**
- This can happen if both the app and MCP server are writing simultaneously
- The 5-second busy_timeout handles most cases, but heavy concurrent writes may need retry logic
