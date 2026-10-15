import { Absence, Employee, makeId, PlannerData, PlannerSettings, Schedule } from './domain';
import { weekPartId } from './cloud/model';

export const MAX_HISTORY = 30;
export type PreviousWeek = { id: string; schedule: Schedule | null };
export type PreviousData = {
  employees?: Employee[];
  absences?: Absence[];
  settings?: PlannerSettings | null;
  weeks?: PreviousWeek[];
};
export type HistoryEntry = {
  id: string;
  at: string;
  label: string;
  actor: 'Dit apparaat';
  before: PreviousData;
  undoneAt?: string;
};
export type PlannerArchive = { data: PlannerData; history: HistoryEntry[] };

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

function byWeek(schedules: Schedule[]): Map<string, Schedule> {
  return new Map(schedules.map((schedule) => [weekPartId(schedule), schedule]));
}

/** Store only changed sections and weeks, so a year of rosters is not copied for every edit. */
export function previousData(before: PlannerData, after: PlannerData): PreviousData | null {
  const previous: PreviousData = {};
  if (!same(before.employees, after.employees)) previous.employees = copy(before.employees);
  if (!same(before.absences, after.absences)) previous.absences = copy(before.absences);
  if (!same(before.settings ?? null, after.settings ?? null)) previous.settings = before.settings ? copy(before.settings) : null;
  const oldWeeks = byWeek(before.schedules);
  const newWeeks = byWeek(after.schedules);
  const weeks = [...new Set([...oldWeeks.keys(), ...newWeeks.keys()])].filter((id) => !same(oldWeeks.get(id), newWeeks.get(id)))
    .map((id) => ({ id, schedule: oldWeeks.has(id) ? copy(oldWeeks.get(id)!) : null }));
  if (weeks.length) previous.weeks = weeks;
  return Object.keys(previous).length ? previous : null;
}

export function recordChange(current: PlannerArchive, next: PlannerData, label: string, at = new Date().toISOString()): PlannerArchive {
  const before = previousData(current.data, next);
  if (!before) return current;
  const entry: HistoryEntry = { id: makeId(), at, label, actor: 'Dit apparaat', before };
  return { data: next, history: [...current.history, entry].slice(-MAX_HISTORY) };
}

export function canUndo(archive: PlannerArchive): boolean {
  const latest = archive.history.at(-1);
  return Boolean(latest && !latest.undoneAt);
}

export function undoLast(archive: PlannerArchive, at = new Date().toISOString()): PlannerArchive {
  if (!canUndo(archive)) return archive;
  const latest = archive.history.at(-1)!;
  const previous = latest.before;
  const weeks = byWeek(archive.data.schedules);
  for (const item of previous.weeks ?? []) {
    if (item.schedule) weeks.set(item.id, copy(item.schedule));
    else weeks.delete(item.id);
  }
  const data: PlannerData = {
    ...archive.data,
    employees: previous.employees ? copy(previous.employees) : archive.data.employees,
    absences: previous.absences ? copy(previous.absences) : archive.data.absences,
    schedules: [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
  };
  if ('settings' in previous) {
    if (previous.settings) data.settings = copy(previous.settings);
    else delete data.settings;
  }
  return { data, history: [...archive.history.slice(0, -1), { ...latest, undoneAt: at }] };
}
