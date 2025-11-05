import { z } from 'zod';
import type { ChatToolParametersSchema, JsonValue, McpToolHandlerOptions } from '@ideadesignmedia/open-ai.js';
import { DB } from './db';
import { CalendarConfig, listAccounts, resolveAccount, searchAccounts, listEvents, getEvent, createEvent, updateEvent, deleteEvent } from './calendar';

const emptyParams = {
  type: 'object',
  properties: {},
  additionalProperties: false
} as const satisfies ChatToolParametersSchema;

const resolveAccountParams = {
  type: 'object',
  additionalProperties: false,
  properties: {
    query: { type: 'string', description: 'Email, id, or partial (case-insensitive). If omitted or blank, returns all accounts.' }
  }
} as const satisfies ChatToolParametersSchema;

const searchEventsParams = {
  type: 'object',
  additionalProperties: false,
  properties: {
    account: { type: 'string', description: 'Account identifier (email, id, or partial). Optional when only one linked account exists.' },
    q: { type: 'string' },
    timeMin: { type: 'string' },
    timeMax: { type: 'string' },
    maxResults: { type: 'integer', minimum: 1, maximum: 250 }
  }
} as const satisfies ChatToolParametersSchema;

const getEventParams = {
  type: 'object',
  additionalProperties: false,
  required: ['eventId'],
  properties: {
    account: { type: 'string', description: 'Account identifier (email, id, or partial). Optional when only one linked account exists.' },
    eventId: { type: 'string' }
  }
} as const satisfies ChatToolParametersSchema;

const createEventParams = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'start', 'end'],
  properties: {
    account: { type: 'string', description: 'Account identifier (email, id, or partial). Optional when only one linked account exists.' },
    summary: { type: 'string' },
    description: { type: 'string' },
    location: { type: 'string' },
    start: {
      type: 'object',
      additionalProperties: false,
      properties: {
        dateTime: { type: 'string' },
        date: { type: 'string' },
        timeZone: { type: 'string' }
      }
    },
    end: {
      type: 'object',
      additionalProperties: false,
      properties: {
        dateTime: { type: 'string' },
        date: { type: 'string' },
        timeZone: { type: 'string' }
      }
    },
    attendees: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['email'],
        properties: {
          email: { type: 'string' }
        }
      }
    }
  }
} as const satisfies ChatToolParametersSchema;

const updateEventParams = {
  type: 'object',
  additionalProperties: false,
  required: ['eventId', 'patch'],
  properties: {
    account: { type: 'string', description: 'Account identifier (email, id, or partial). Optional when only one linked account exists.' },
    eventId: { type: 'string' },
    patch: { type: 'object' }
  }
} as const satisfies ChatToolParametersSchema;

const deleteEventParams = {
  type: 'object',
  additionalProperties: false,
  required: ['eventId'],
  properties: {
    account: { type: 'string', description: 'Account identifier (email, id, or partial). Optional when only one linked account exists.' },
    eventId: { type: 'string' }
  }
} as const satisfies ChatToolParametersSchema;

// No calendar listing; operations target the primary calendar automatically
const searchEventsSchema = z.object({
  account: z.string().optional(),
  q: z.string().optional(),
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
  maxResults: z.number().int().min(1).max(250).optional()
});
const getEventSchema = z.object({ account: z.string().optional(), eventId: z.string() });
const createEventSchema = z.object({
  account: z.string().optional(),
  summary: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.object({
    dateTime: z.string().optional(),
    date: z.string().optional(),
    timeZone: z.string().optional()
  }),
  end: z.object({
    dateTime: z.string().optional(),
    date: z.string().optional(),
    timeZone: z.string().optional()
  }),
  attendees: z.array(z.object({ email: z.string() })).optional()
});
const updateEventSchema = z.object({
  account: z.string().optional(),
  eventId: z.string(),
  patch: z.record(z.any())
});
const deleteEventSchema = z.object({ account: z.string().optional(), eventId: z.string() });

export function buildTools(db: DB, dek: Buffer | undefined, readOnly = false): McpToolHandlerOptions[] {
  const cfg: CalendarConfig = { db, dek, readOnly };

  const tools: McpToolHandlerOptions[] = [
    {
      tool: {
        type: 'function',
        function: {
          name: 'gcal-list_accounts',
          description: 'List linked Google Calendar accounts you can operate on. Use this to get a valid `account` identifier (email or id).',
          parameters: emptyParams
        }
      },
      handler: async () => {
        const rows = await listAccounts(db);
        const accounts = rows.map(r => ({
          id: r.id,
          email: r.email,
          displayName: r.display_name ?? null
        }));
        return { accounts } as JsonValue;
      }
    },
    {
      tool: {
        type: 'function',
        function: {
          name: 'gcal-resolve_account',
          description: 'Resolve an account identifier to candidates without throwing. Accepts email, id, or partial. Returns matches and whether the match is exact or ambiguous.',
          parameters: resolveAccountParams
        }
      },
      handler: async (args) => {
        const input = z.object({ query: z.string().optional() }).parse(args);
        const q = (input.query ?? '').trim();
        // Try exact match first when provided
        if (q) {
          const exact = await (async () => {
            const rows = await searchAccounts(db, q);
            // Check for exact by id/email
            const exactByEmailOrId = rows.find(r => r.email === q || r.id === q);
            return exactByEmailOrId ? [exactByEmailOrId] : [];
          })();
          if (exact.length === 1) {
            const matches = exact.map(r => ({ id: r.id, email: r.email, displayName: r.display_name ?? null }));
            return { query: q, matches, exact: true, ambiguous: false, count: matches.length } as JsonValue;
          }
        }
        const rows = await searchAccounts(db, q);
        const matches = rows.map(r => ({ id: r.id, email: r.email, displayName: r.display_name ?? null }));
        return { query: q, matches, exact: false, ambiguous: matches.length > 1, count: matches.length } as JsonValue;
      }
    },
    {
      tool: {
        type: 'function',
        function: {
          name: 'gcal-search_events',
          description: 'Search events by query and/or time window on the primary calendar of a linked account. If `account` is omitted and only one account is linked, it will be used. Otherwise, call `gcal-list_accounts` to choose.',
          parameters: searchEventsParams
        }
      },
      handler: async (args) => {
        const input = searchEventsSchema.parse(args);
        const acc = await resolveAccount(db, input.account);
        const items = await listEvents(cfg, acc.id, 'primary', {
          q: input.q,
          timeMin: input.timeMin,
          timeMax: input.timeMax,
          maxResults: input.maxResults
        });
        const events = (items || []).map(event => event as unknown as JsonValue);
        return { events } as JsonValue;
      }
    },
    {
      tool: {
        type: 'function',
        function: {
          name: 'gcal-get_event',
          description: 'Get a single event from the primary calendar of a linked account. `account` may be email, id, or partial (optional when only one account exists).',
          parameters: getEventParams
        }
      },
      handler: async (args) => {
        const input = getEventSchema.parse(args);
        const acc = await resolveAccount(db, input.account);
        const event = await getEvent(cfg, acc.id, 'primary', input.eventId);
        return event as unknown as JsonValue;
      }
    },
    {
      tool: {
        type: 'function',
        function: {
          name: 'gcal-create_event',
          description: 'Create an event on the primary calendar of a linked account. If unsure which account to use, call `gcal-list_accounts`. `account` accepts email, id, or a partial match.',
          parameters: createEventParams
        }
      },
      handler: async (args) => {
        const input = createEventSchema.parse(args);
        const acc = await resolveAccount(db, input.account);
        const event = {
          summary: input.summary,
          description: input.description,
          location: input.location,
          start: input.start,
          end: input.end,
          attendees: input.attendees
        };
        const created = await createEvent(cfg, acc.id, 'primary', event);
        return created as unknown as JsonValue;
      }
    },
    {
      tool: {
        type: 'function',
        function: {
          name: 'gcal-update_event',
          description: 'Update an event (patch) on the primary calendar of a linked account. `account` accepts email, id, or partial (optional when only one account exists).',
          parameters: updateEventParams
        }
      },
      handler: async (args) => {
        const input = updateEventSchema.parse(args);
        const acc = await resolveAccount(db, input.account);
        const updated = await updateEvent(cfg, acc.id, 'primary', input.eventId, input.patch || {});
        return updated as unknown as JsonValue;
      }
    },
    {
      tool: {
        type: 'function',
        function: {
          name: 'gcal-delete_event',
          description: 'Delete an event from the primary calendar of a linked account. `account` accepts email, id, or partial (optional when only one account exists).',
          parameters: deleteEventParams
        }
      },
      handler: async (args) => {
        const input = deleteEventSchema.parse(args);
        const acc = await resolveAccount(db, input.account);
        const result = await deleteEvent(cfg, acc.id, 'primary', input.eventId);
        return result as JsonValue;
      }
    }
  ];

  return tools;
}
