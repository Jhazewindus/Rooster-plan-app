import { Absence, Employee, emptyPlannerData, PlannerData, PlannerSettings, Schedule } from '../domain';

export const CLOUD_SCHEMA_VERSION = 1;
export type CloudPartId = 'employees' | 'absences' | 'settings' | `week-${string}`;
export type CloudPayload = Employee[] | Absence[] | PlannerSettings | Schedule | null;
export type CloudParts = Partial<Record<CloudPartId, CloudPayload>>;
export type RemotePart = { revision: number; payload: CloudPayload };
export type RemoteParts = Partial<Record<CloudPartId, RemotePart>>;
export type SyncBaseline = Partial<Record<CloudPartId, RemotePart>>;
export type Upload = { id: CloudPartId; expectedRevision: number; payload: CloudPayload };
export type Download = { id: CloudPartId; payload: CloudPayload };
export type SyncPlan = { uploads: Upload[]; downloads: Download[]; conflicts: CloudPartId[] };

const BASIC_PARTS: CloudPartId[] = ['employees', 'absences', 'settings'];
const PART_PATTERN = /^(employees|absences|settings|week-\d{4}-\d{2}-\d{2})$/;

export function isCloudPartId(value: string): value is CloudPartId { return PART_PATTERN.test(value); }

function amsterdamDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Rooster bevat een ongeldige weekdatum.');
  const parts = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const field = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${field('year')}-${field('month')}-${field('day')}`;
}

export function weekPartId(schedule: Schedule): CloudPartId { return `week-${amsterdamDate(schedule.weekStart)}`; }

export function splitPlannerData(data: PlannerData): CloudParts {
  const parts: CloudParts = { employees: data.employees, absences: data.absences, settings: data.settings ?? { breaks: [] } };
  for (const schedule of data.schedules) {
    const id = weekPartId(schedule);
    if (parts[id]) throw new Error(`Dubbel rooster voor ${id.slice(5)}.`);
    parts[id] = schedule;
  }
  return parts;
}

function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b))) : item);
}

function same(a: unknown, b: unknown): boolean { return canonical(a) === canonical(b); }

function empty(id: CloudPartId, value: CloudPayload): boolean {
  if (value === null) return true;
  if (id === 'employees' || id === 'absences') return Array.isArray(value) && value.length === 0;
  if (id === 'settings') return !Array.isArray(value) && 'breaks' in value && value.breaks.length === 0;
  return false;
}

/** No automatic overwrite: divergent edits to the same part must be resolved explicitly. */
export function planSync(local: PlannerData, baseline: SyncBaseline, remote: RemoteParts): SyncPlan {
  const localParts = splitPlannerData(local);
  const ids = new Set<CloudPartId>([...BASIC_PARTS, ...Object.keys(localParts), ...Object.keys(baseline), ...Object.keys(remote)].filter(isCloudPartId));
  const plan: SyncPlan = { uploads: [], downloads: [], conflicts: [] };
  for (const id of ids) {
    const localValue = localParts[id] ?? null;
    const remoteValue = remote[id]?.payload ?? null;
    const old = baseline[id];
    if (old === undefined) {
      if (same(localValue, remoteValue) || (empty(id, localValue) && empty(id, remoteValue))) continue;
      if (empty(id, localValue)) plan.downloads.push({ id, payload: remoteValue });
      else if (empty(id, remoteValue)) plan.uploads.push({ id, expectedRevision: remote[id]?.revision ?? 0, payload: localValue });
      else plan.conflicts.push(id);
      continue;
    }
    const localChanged = !same(localValue, old.payload);
    const remoteChanged = !same(remoteValue, old.payload);
    if (same(localValue, remoteValue)) continue;
    if (localChanged && remoteChanged) plan.conflicts.push(id);
    else if (localChanged) plan.uploads.push({ id, expectedRevision: remote[id]?.revision ?? 0, payload: localValue });
    else if (remoteChanged) plan.downloads.push({ id, payload: remoteValue });
  }
  return plan;
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }

/** Validate the document envelope and the top-level shape before touching local data. */
export function parseRemotePart(id: string, value: unknown): RemotePart {
  if (!isCloudPartId(id) || !isRecord(value) || value.schemaVersion !== CLOUD_SCHEMA_VERSION || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1) throw new Error(`Ongeldig cloud-document: ${id}.`);
  const payload = value.payload;
  const valid = payload === null && id.startsWith('week-')
    || (id === 'employees' || id === 'absences') && Array.isArray(payload)
    || id === 'settings' && isRecord(payload) && Array.isArray(payload.breaks)
    || id.startsWith('week-') && isRecord(payload) && typeof payload.weekStart === 'string' && Array.isArray(payload.shifts)
      && weekPartId(payload as Schedule) === id;
  if (!valid) throw new Error(`Ongeldige roostergegevens in ${id}.`);
  return { revision: value.revision as number, payload: payload as CloudPayload };
}

export function applyDownloads(local: PlannerData, downloads: Download[]): PlannerData {
  const parts = splitPlannerData(local);
  for (const { id, payload } of downloads) {
    if (!isCloudPartId(id)) throw new Error(`Ongeldig cloud-onderdeel: ${id}.`);
    if (id.startsWith('week-') && payload === null) delete parts[id];
    else parts[id] = payload;
  }
  const employees = parts.employees;
  const absences = parts.absences;
  const settings = parts.settings;
  if (!Array.isArray(employees) || !Array.isArray(absences) || !settings || Array.isArray(settings) || !('breaks' in settings)) throw new Error('Cloud-gegevens zijn onvolledig.');
  const schedules = Object.entries(parts).filter(([id]) => id.startsWith('week-')).map(([id, value]) => {
    if (!value || Array.isArray(value) || !('weekStart' in value) || weekPartId(value as Schedule) !== id) throw new Error(`Ongeldig rooster in ${id}.`);
    return value as Schedule;
  }).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  return { ...emptyPlannerData(), employees: employees as Employee[], absences: absences as Absence[], settings: settings as PlannerSettings, schedules };
}

export function baselineFromRemote(remote: RemoteParts): SyncBaseline {
  return Object.fromEntries(Object.entries(remote).filter((entry): entry is [string, RemotePart] => entry[1] !== undefined)
    .map(([id, part]) => [id, { revision: part.revision, payload: JSON.parse(JSON.stringify(part.payload)) as CloudPayload }])) as SyncBaseline;
}
