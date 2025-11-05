# @ideadesignmedia/gcal-mcp

Private MCP server (stdio) and CLI for linking and operating multiple Google Calendar accounts. It stores tokens in a local SQLite database and can encrypt refresh tokens at rest with a user password.

The server speaks MCP over stdio and keeps stdout clean (JSON‑RPC only); all human‑readable logs go to stderr.

## Requirements

- Node.js >= 18.17
- A Google Cloud OAuth client (Web application) with Calendar API enabled
  - You will need `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

## One‑liner (npx)

Use `npx` to run without installing globally. The package name is `@ideadesignmedia/gcal-mcp` and the binary is `gcal-mcp`.

```bash
# Help
npx -y @ideadesignmedia/gcal-mcp --help

# Link an account (prints an authorization URL)
npx -y @ideadesignmedia/gcal-mcp add \
  --client-id "$GOOGLE_CLIENT_ID" \
  --client-secret "$GOOGLE_CLIENT_SECRET"

# Lock the database (encrypts existing refresh tokens)
npx -y @ideadesignmedia/gcal-mcp passwd --pass 'your-strong-pass'

# Start the MCP server over stdio (stdout is JSON only)
GMAIL_MCP_DB_PASS='your-strong-pass' \
  npx -y @ideadesignmedia/gcal-mcp start
```

## Database

- Default location: `~/.idm/gcal-mcp/db.sqlite`
- Override with `--db <path>` on any command
- When locked, refresh tokens are encrypted with AES‑GCM using a DEK derived from your password via scrypt

## Global Flags

- `--db <path>`: SQLite database path (defaults above)
- `--pass <pass>`: Database password (where applicable). For `start`, consider `GMAIL_MCP_DB_PASS` instead.
- `--read-only`: Start server with write tools disabled (create/update/delete)

Environment variables:

- `GMAIL_MCP_DB_PASS`: Password used by `start` (and as a fallback elsewhere)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: OAuth credentials (used by `add` if flags not supplied)

## Commands

- `start`
  - Starts the MCP server over stdio
  - Respects `--read-only`
  - Stdout: JSON‑RPC messages only; logs to stderr
  - Examples:
    - `GMAIL_MCP_DB_PASS='...' npx -y @ideadesignmedia/gcal-mcp start`

- `add`
  - Links a Google account and stores its refresh token
  - Options:
    - `--client-id <id>` / `--client-secret <secret>` (or use env vars)
    - `--device` for Device Code flow (headless), otherwise uses loopback redirect and prints a URL to visit (default port 43112; change with `--listen-port <port>`)
    - `--scopes <list>` to provide custom scopes (comma or space separated)
    - `--choose-scopes` to interactively select calendar access (read-only vs read/write) and optionally add extra scopes
  - Example:
    - `npx -y @ideadesignmedia/gcal-mcp add --client-id $GOOGLE_CLIENT_ID --client-secret $GOOGLE_CLIENT_SECRET`
    - `npx -y @ideadesignmedia/gcal-mcp add --choose-scopes --client-id $GOOGLE_CLIENT_ID --client-secret $GOOGLE_CLIENT_SECRET`

- `list`
  - Lists linked accounts (id, email, display name, created)

- `remove <key>`
  - Removes an account and its tokens by id or email

- `passwd`
  - Locks the database or rotates an existing password
  - Options:
    - `--pass <pass>`: Password to set when locking, or new password when rotating
    - `--rotate`: Rotate the existing password (requires `--old-pass`)
    - `--old-pass <old>`: Old password for rotation
    - `--hint <text>`: Optional password hint stored alongside the KDF parameters

## MCP Server Integration

Any MCP‑capable client can launch this server as a stdio process. A generic config entry looks like:

```json
{
  "mcpServers": {
    "gcal-mcp": {
      "command": "npx",
      "args": ["-y", "@ideadesignmedia/gcal-mcp", "start"],
      "env": {
        "GMAIL_MCP_DB_PASS": "${secret:GCAL_DB_PASS}",
        "GOOGLE_CLIENT_ID": "${env:GOOGLE_CLIENT_ID}",
        "GOOGLE_CLIENT_SECRET": "${env:GOOGLE_CLIENT_SECRET}"
      }
    }
  }
}
```

Notes:

- The `start` command writes only JSON‑RPC to stdout as required by MCP stdio.
- Use your client’s secret storage for `GMAIL_MCP_DB_PASS` where available.

## Provided Tools

The server exposes the following tools. Names and parameter schemas follow the Chat Completions function tool shape.

Primary calendar only:

- All operations target the account’s primary calendar automatically; there is no `calendarId` parameter.
  - This removes confusion between account vs calendar. The server passes `primary` internally.

Account resolution rules (applies wherever `account` is accepted):

- Accepts exact `email` or `id`.
- Also accepts a partial, case-insensitive match on email or display name.
- If `account` is omitted and exactly one account is linked, that account is used.
- If multiple accounts would match or are linked with no `account` provided, the tool throws a helpful error. Use `gcal-list_accounts` to choose deterministically.

- `gcal-list_accounts`
  - Parameters: none
  - Returns: `{ accounts: Array<{ id: string, email: string, displayName: string | null }> }`

- `gcal-resolve_account`
  - Parameters:
    - `query` (string; optional; email/id or partial). If omitted or blank, returns all accounts.
  - Returns: `{ query: string, matches: Array<{ id: string, email: string, displayName: string | null }>, exact: boolean, ambiguous: boolean, count: number }`

- `gcal-search_events`
  - Parameters:
    - `account` (string; optional)
    - `q` (string, optional)
    - `timeMin` (ISO string, optional)
    - `timeMax` (ISO string, optional)
    - `maxResults` (integer 1..250, optional)
  - Returns: `{ events: GoogleCalendarEvent[] }` (verbatim event objects)

- `gcal-get_event`
  - Parameters:
    - `account` (string; optional)
    - `eventId` (string)
  - Returns: `GoogleCalendarEvent`

- `gcal-create_event`
  - Parameters:
    - `account` (string; optional)
    - `summary` (string)
    - `description` (string, optional)
    - `location` (string, optional)
    - `start` (object: `{ dateTime?: string, date?: string, timeZone?: string }`)
    - `end` (object: `{ dateTime?: string, date?: string, timeZone?: string }`)
    - `attendees` (array of `{ email: string }`, optional)
  - Returns: `GoogleCalendarEvent`

- `gcal-update_event`
  - Parameters:
    - `account` (string; optional)
    - `eventId` (string)
    - `patch` (object; partial event resource)
  - Returns: `GoogleCalendarEvent`

- `gcal-delete_event`
  - Parameters:
    - `account` (string; optional)
    - `eventId` (string)
  - Returns: `{ ok: true }` on success

Read‑only mode:

- Start with `--read-only` to disable `gcal-create_event`, `gcal-update_event`, and `gcal-delete_event`.

## OAuth Flows

- Default: Loopback flow. The CLI opens your browser to grant access and listens on `127.0.0.1:43112` for the redirect (customizable via `--listen-port`).
- Headless: Device Code flow with `--device`. The CLI prints a code and verification URL to the terminal.
- Scopes used: `https://www.googleapis.com/auth/calendar`, plus `openid email profile` to capture account identity.

## Security Notes

- When locked, refresh tokens are encrypted at rest (AES‑GCM). The key is derived with scrypt using per‑DB salt and stored KDF parameters.
- The MCP `start` command emits no human‑readable output on stdout.
- Prefer setting `GMAIL_MCP_DB_PASS` via your MCP client’s secret system; avoid committing secrets in configs.

## Troubleshooting

- Database is locked
  - Set `GMAIL_MCP_DB_PASS` or pass `--pass` when needed. For `start`, use the env var.

- OAuth did not return a refresh_token
  - Ensure you used the provided `add` command (it requests offline access with consent). If you previously granted access without offline permission, remove prior consent in your Google Account or create a new OAuth client.

- Loopback callback failed
  - Check firewall or try `--device` for Device Code flow.

- MCP client shows parse errors
  - Verify you are launching the server with `start` and not another command. STDOUT must remain clean JSON‑RPC.

---

MIT © Idea Design Media
