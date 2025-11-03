import { z } from 'zod';
import type { ChatToolParametersSchema, JsonValue, McpToolHandlerOptions } from '@ideadesignmedia/open-ai.js';
import { DB } from './db';
import { CalendarConfig, listAccounts, getAccountByKey, listCalendars, listEvents, getEvent, createEvent, updateEvent, deleteEvent } from './calendar';

const emptyParams = {
  type: 'object',
  properties: {},
  additionalProperties: false
} as const satisfies ChatToolParametersSchema;

const listCalendarsParams = {
  type: 'object',
  additionalProperties: false,
  required: ['account'],
  properties: {
    account: { type: 'string', description: 'Account email or id' }
  }
} as const satisfies ChatToolParametersSchema;

const searchEventsParams = {
  type: 'object',
  additionalProperties: false,
  required: ['account'],
  properties: {
    account: { type: 'string' },
    calendarId: { type: 'string' },
    q: { type: 'string' },
    timeMin: { type: 'string' },
    timeMax: { type: 'string' },
    maxResults: { type: 'integer', minimum: 1, maximum: 250 }
  }
} as const satisfies ChatToolParametersSchema;

const getEventParams = {
  type: 'object',
  additionalProperties: false,
  required: ['account', 'calendarId', 'eventId'],
  properties: {
    account: { type: 'string' },
    calendarId: { type: 'string' },
    eventId: { type: 'string' }
  }
} as const satisfies ChatToolParametersSchema;

const createEventParams = {
  type: 'object',
  additionalProperties: false,
  required: ['account', 'calendarId', 'summary', 'start', 'end'],
  properties: {
    account: { type: 'string' },
    calendarId: { type: 'string' },
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
  required: ['account', 'calendarId', 'eventId', 'patch'],
  properties: {
    account: { type: 'string' },
    calendarId: { type: 'string' },
    eventId: { type: 'string' },
    patch: { type: 'object' }
  }
} as const satisfies ChatToolParametersSchema;

const deleteEventParams = {
  type: 'object',
  additionalProperties: false,
  required: ['account', 'calendarId', 'eventId'],
  properties: {
    account: { type: 'string' },
    calendarId: { type: 'string' },
    eventId: { type: 'string' }
  }
} as const satisfies ChatToolParametersSchema;

const listCalendarsSchema = z.object({ account: z.string() });
const searchEventsSchema = z.object({
  account: z.string(),
  calendarId: z.string().optional(),
  q: z.string().optional(),
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
  maxResults: z.number().int().min(1).max(250).optional()
});
const getEventSchema = z.object({ account: z.string(), calendarId: z.string(), eventId: z.string() });
const createEventSchema = z.object({
  account: z.string(),
  calendarId: z.string(),
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
  account: z.string(),
  calendarId: z.string(),
  eventId: z.string(),
  patch: z.record(z.any())
});
const deleteEventSchema = z.object({ account: z.string(), calendarId: z.string(), eventId: z.string() });

export function buildTools(db: DB, dek: Buffer | undefined, readOnly = false): McpToolHandlerOptions[] {
  const cfg: CalendarConfig = { db, dek, readOnly };

  const tools: McpToolHandlerOptions[] = [
    {
      tool: {
        type: 'function',
        function: {
          name: 'list_accounts',
          description: 'List linked Google Calendar accounts',
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
          name: 'list_calendars',
          description: 'List calendars for an account',
          parameters: listCalendarsParams
        }
      },
      handler: async (args) => {
        const input = listCalendarsSchema.parse(args);
        const acc = await getAccountByKey(db, input.account);
        if (!acc) throw new Error('Account not found');
        const items = await listCalendars(cfg, acc.id);
        const calendars = (items || []).map(c => ({
          id: c.id ?? null,
          summary: c.summary ?? null,
          primary: !!c.primary
        }));
        return { calendars } as JsonValue;
      }
    },
    {
      tool: {
        type: 'function',
        function: {
          name: 'search_events',
          description: 'Search events by query and/or time window',
          parameters: searchEventsParams
        }
      },
      handler: async (args) => {
        const input = searchEventsSchema.parse(args);
        const acc = await getAccountByKey(db, input.account);
        if (!acc) throw new Error('Account not found');
        const calId = input.calendarId || 'primary';
        const items = await listEvents(cfg, acc.id, calId, {
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
          name: 'get_event',
          description: 'Get a single event',
          parameters: getEventParams
        }
      },
      handler: async (args) => {
        const input = getEventSchema.parse(args);
        const acc = await getAccountByKey(db, input.account);
        if (!acc) throw new Error('Account not found');
        const event = await getEvent(cfg, acc.id, input.calendarId, input.eventId);
        return event as unknown as JsonValue;
      }
    },
    {
      tool: {
        type: 'function',
        function: {
          name: 'create_event',
          description: 'Create an event',
          parameters: createEventParams
        }
      },
      handler: async (args) => {
        const input = createEventSchema.parse(args);
        const acc = await getAccountByKey(db, input.account);
        if (!acc) throw new Error('Account not found');
        const event = {
          summary: input.summary,
          description: input.description,
          location: input.location,
          start: input.start,
          end: input.end,
          attendees: input.attendees
        };
        const created = await createEvent(cfg, acc.id, input.calendarId, event);
        return created as unknown as JsonValue;
      }
    },
    {
      tool: {
        type: 'function',
        function: {
          name: 'update_event',
          description: 'Update an event (patch)',
          parameters: updateEventParams
        }
      },
      handler: async (args) => {
        const input = updateEventSchema.parse(args);
        const acc = await getAccountByKey(db, input.account);
        if (!acc) throw new Error('Account not found');
        const updated = await updateEvent(cfg, acc.id, input.calendarId, input.eventId, input.patch || {});
        return updated as unknown as JsonValue;
      }
    },
    {
      tool: {
        type: 'function',
        function: {
          name: 'delete_event',
          description: 'Delete an event',
          parameters: deleteEventParams
        }
      },
      handler: async (args) => {
        const input = deleteEventSchema.parse(args);
        const acc = await getAccountByKey(db, input.account);
        if (!acc) throw new Error('Account not found');
        const result = await deleteEvent(cfg, acc.id, input.calendarId, input.eventId);
        return result as JsonValue;
      }
    }
  ];

  return tools;
}
