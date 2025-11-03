import { DB } from '../db';
import { buildTools } from '../tools';
import { McpServer } from '@ideadesignmedia/open-ai.js';
export async function startMcp(db: DB, dek: Buffer | undefined, readOnly = false) {
  const tools = buildTools(db, dek, readOnly);
  const server = new McpServer({
    transports: ['stdio'],
    metadata: { name: 'gcal-mcp', description: 'Private Google Calendar MCP server for linked accounts' }
  });
  for (const tool of tools) {
    server.registerTool(tool);
  }
  await server.start();
}
