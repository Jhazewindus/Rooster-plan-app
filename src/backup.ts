import { PlannerData } from './domain';
import { HistoryEntry, MAX_HISTORY, PlannerArchive } from './history';
import { isCloudPartId, weekPartId } from './cloud/model';

export const BACKUP_FORMAT = 'RoosterPlan-backup';
export const BACKUP_VERSION = 1;

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const string = (value: unknown): value is string => typeof value === 'string';
const date = (value: unknown): value is string => string(value) && Number.isFinite(Date.parse(value));
const integer = (value: unknown): value is number => Number.isSafeInteger(value);
const list = (value: unknown, check: (item: unknown) => boolean): boolean => Array.isArray(value) && value.every(check);
const range = (value: unknown): boolean => object(value) && string(value.startDate) && string(value.endDate) && value.startDate <= value.endDate;

function validEmployee(value: unknown): boolean {
  if (!object(value) || !string(value.id) || !string(value.firstName) || !string(value.lastName)
    || !string(value.displayName) || !string(value.role) || !string(value.color)
    || !integer(value.weeklyContractMinutes) || value.weeklyContractMinutes < 0 || typeof value.active !== 'boolean'
    || !object(value.availability)) return false;
  if (value.kind !== undefined && !['regular', 'intern', 'periodic'].includes(value.kind as string)) return false;
  if (value.internship !== undefined && !range(value.internship)) return false;
  if (value.period !== undefined && !range(value.period)) return false;
  return Object.entries(value.availability).every(([day, window]) => /^[1-7]$/.test(day)
    && object(window) && integer(window.startMinute) && integer(window.endMinute)
    && window.startMinute >= 0 && window.endMinute <= 1440 && window.endMinute > window.startMinute);
}

function validAbsence(value: unknown): boolean {
  return object(value) && string(value.id) && string(value.employeeId)
    && ['sick', 'vacation', 'dayOff', 'specialLeave', 'unavailable', 'other'].includes(value.type as string)
    && date(value.startAt) && date(value.endAt) && value.startAt < value.endAt && string(value.notes);
}

function validShift(value: unknown): boolean {
  return object(value) && string(value.id)
    && (value.employeeId === null || string(value.employeeId))
    && (value.originalEmployeeId === null || string(value.originalEmployeeId))
    && date(value.startAt) && date(value.endAt) && value.startAt < value.endAt
    && ['default', 'replacement', 'manual'].includes(value.source as string) && string(value.notes)
    && (value.paidInternShift === undefined || typeof value.paidInternShift === 'boolean');
}

function validSchedule(value: unknown): boolean {
  return object(value) && string(value.id) && date(value.weekStart)
    && ['draft', 'final', 'published'].includes(value.status as string)
    && string(value.createdAt) && string(value.updatedAt)
    && list(value.shifts, validShift) && (value.manualShifts === undefined || list(value.manualShifts, validShift));
}

function validSettings(value: unknown): boolean {
  return object(value) && list(value.breaks, (rule) => object(rule) && string(rule.id) && string(rule.label)
    && ['day', 'evening'].includes(rule.kind as string)
    && list(rule.weekdays, (day) => integer(day) && (day as number) >= 1 && (day as number) <= 7)
    && integer(rule.startMinute) && integer(rule.endMinute)
    && rule.startMinute >= 0 && rule.endMinute <= 1440 && rule.endMinute > rule.startMinute);
}

function validData(value: unknown): value is PlannerData {
  if (!object(value) || !list(value.employees, validEmployee) || !list(value.absences, validAbsence)
    || !list(value.schedules, validSchedule) || (value.settings !== undefined && !validSettings(value.settings))) return false;
  try {
    const weeks = (value.schedules as PlannerData['schedules']).map(weekPartId);
    return new Set(weeks).size === weeks.length;
  } catch { return false; }
}

function validHistoryEntry(value: unknown): value is HistoryEntry {
  if (!object(value) || !string(value.id) || !date(value.at) || !string(value.label)
    || value.actor !== 'Dit apparaat' || (value.undoneAt !== undefined && !date(value.undoneAt))
    || !object(value.before)) return false;
  const before = value.before;
  if (before.employees !== undefined && !list(before.employees, validEmployee)) return false;
  if (before.absences !== undefined && !list(before.absences, validAbsence)) return false;
  if (before.settings !== undefined && before.settings !== null && !validSettings(before.settings)) return false;
  if (before.weeks !== undefined && !list(before.weeks, (item) => object(item) && string(item.id) && isCloudPartId(item.id)
    && item.id.startsWith('week-') && (item.schedule === null || validSchedule(item.schedule) && weekPartId(item.schedule as PlannerData['schedules'][number]) === item.id))) return false;
  return Object.keys(before).every((key) => ['employees', 'absences', 'settings', 'weeks'].includes(key));
}

export function validateArchive(value: unknown): PlannerArchive {
  if (!object(value) || !validData(value.data) || !list(value.history, validHistoryEntry)
    || (value.history as HistoryEntry[]).length > MAX_HISTORY) throw new Error('Dit bestand bevat geen geldige RoosterPlan-gegevens.');
  return { data: value.data, history: value.history as HistoryEntry[] };
}

export function createBackup(archive: PlannerArchive, now = new Date().toISOString()): string {
  validateArchive(archive);
  return JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, ...archive }, null, 2);
}

export function parseBackup(text: string): { archive: PlannerArchive; exportedAt: string } {
  if (text.length > 32_000_000) throw new Error('Het back-upbestand is te groot.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('Dit bestand is geen leesbare RoosterPlan-back-up.'); }
  if (!object(value) || value.format !== BACKUP_FORMAT || value.version !== BACKUP_VERSION || !date(value.exportedAt))
    throw new Error('Dit is geen ondersteunde RoosterPlan-back-up.');
  return { archive: validateArchive(value), exportedAt: value.exportedAt };
}

export function parseStoredArchive(text: string): PlannerArchive {
  try { return validateArchive(JSON.parse(text) as unknown); }
  catch { throw new Error('Opgeslagen roostergegevens zijn beschadigd. Herstel een back-up.'); }
}

export function parseLegacyData(text: string): PlannerArchive {
  try { return validateArchive({ data: JSON.parse(text) as unknown, history: [] }); }
  catch { throw new Error('Opgeslagen roostergegevens zijn beschadigd. Herstel een back-up.'); }
}
