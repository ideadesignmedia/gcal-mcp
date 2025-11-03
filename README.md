# @ideadesignmedia/gcal-mcp

Private MCP server and CLI that links multiple Google Calendar accounts and exposes tools over stdio. Tokens are stored in SQLite. You can lock the database with a password so the server and all commands require a pass before use.

## Install

```bash
npm i -g @ideadesignmedia/gcal-mcp
# or as npx on first run
npx @ideadesignmedia/gcal-mcp --help
```

## Quick start

```bash
# Link an account
gcal-mcp add --client-id $GOOGLE_CLIENT_ID --client-secret $GOOGLE_CLIENT_SECRET

# Lock the DB
gcal-mcp passwd --pass 'your-strong-pass'

# Start the MCP server
export GMAIL_MCP_DB_PASS='your-strong-pass'
gcal-mcp start
```
