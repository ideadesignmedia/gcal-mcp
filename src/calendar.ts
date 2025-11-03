
import { google } from 'googleapis';
import { DB, get } from './db';
import { decryptAesGcm } from './crypto';
export type CalendarConfig = { db: DB; dek?: Buffer; readOnly?: boolean; };
export type AccountRow = { id: string; email: string; google_user_id: string; display_name?: string; scopes_json: string; };
export async function listAccounts(db: DB): Promise<AccountRow[]> {
  const rows = await new Promise<any[]>((res, rej) => (db as any).all('SELECT id,email,google_user_id,display_name,scopes_json FROM accounts ORDER BY email', [], (e: any, r: any[]) => e ? rej(e) : res(r)));
  return rows;
}
export async function getAccountByKey(db: DB, key: string): Promise<AccountRow | undefined> {
  const row = await get<any>(db, 'SELECT id,email,google_user_id,display_name,scopes_json FROM accounts WHERE id=? OR email=?', [key, key]);
  return row;
}
export async function getCalendarClient(cfg: CalendarConfig, accountId: string) {
  const cred = await get<any>(cfg.db, 'SELECT refresh_token, refresh_token_ct, refresh_token_iv, refresh_token_tag FROM credentials WHERE account_id=?', [accountId]);
  if (!cred) throw new Error('Account credentials not found');
  let refreshToken: string | undefined;
  if (cred.refresh_token) refreshToken = cred.refresh_token;
  else {
    if (!cfg.dek) throw new Error('Database is locked and password has not been provided');
    const aad = Buffer.from(`credentials.refresh_token:${accountId}:v1`);
    const pt = decryptAesGcm(cfg.dek, cred.refresh_token_iv, cred.refresh_token_tag, cred.refresh_token_ct, aad);
    refreshToken = pt.toString('utf8');
  }
  const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID || '', process.env.GOOGLE_CLIENT_SECRET || '');
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  return { calendar, oauth2Client };
}
export async function listCalendars(cfg: CalendarConfig, accountId: string) {
  const { calendar } = await getCalendarClient(cfg, accountId);
  const resp = await calendar.calendarList.list({});
  return resp.data.items || [];
}
export async function listEvents(cfg: CalendarConfig, accountId: string, calendarId: string, opts: { q?: string; timeMin?: string; timeMax?: string; maxResults?: number } = {}) {
  const { calendar } = await getCalendarClient(cfg, accountId);
  const resp = await calendar.events.list({ calendarId, q: opts.q, timeMin: opts.timeMin, timeMax: opts.timeMax, singleEvents: true, orderBy: 'startTime', maxResults: opts.maxResults || 50 });
  return resp.data.items || [];
}
export async function getEvent(cfg: CalendarConfig, accountId: string, calendarId: string, eventId: string) {
  const { calendar } = await getCalendarClient(cfg, accountId);
  const resp = await calendar.events.get({ calendarId, eventId });
  return resp.data;
}
export async function createEvent(cfg: CalendarConfig, accountId: string, calendarId: string, event: any) {
  if (cfg.readOnly) throw new Error('Server is in read-only mode');
  const { calendar } = await getCalendarClient(cfg, accountId);
  const resp = await calendar.events.insert({ calendarId, requestBody: event });
  return resp.data;
}
export async function updateEvent(cfg: CalendarConfig, accountId: string, calendarId: string, eventId: string, patch: any) {
  if (cfg.readOnly) throw new Error('Server is in read-only mode');
  const { calendar } = await getCalendarClient(cfg, accountId);
  const resp = await calendar.events.patch({ calendarId, eventId, requestBody: patch });
  return resp.data;
}
export async function deleteEvent(cfg: CalendarConfig, accountId: string, calendarId: string, eventId: string) {
  if (cfg.readOnly) throw new Error('Server is in read-only mode');
  const { calendar } = await getCalendarClient(cfg, accountId);
  await calendar.events.delete({ calendarId, eventId });
  return { ok: true };
}
