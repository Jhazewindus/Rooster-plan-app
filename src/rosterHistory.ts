import { dateKey, Employee, PlannerData, Schedule, Shift } from './domain';
import { currentSchedule } from './planner';

export type HistoricalRosterDay = {
  schedule?: Schedule;
  entries: { shift: Shift; employee?: Employee }[];
  employeeCount: number;
  openCount: number;
};

/** Read the saved roster as it stands now, including archived employees. */
export function historicalRosterDay(data: PlannerData, day: Date): HistoricalRosterDay {
  const schedule = currentSchedule(data, day);
  const key = dateKey(day);
  const byId = new Map(data.employees.map((employee) => [employee.id, employee]));
  const entries = (schedule?.shifts ?? [])
    .filter((shift) => dateKey(new Date(shift.startAt)) === key)
    .sort((a, b) => a.startAt.localeCompare(b.startAt) || a.endAt.localeCompare(b.endAt))
    .map((shift) => ({ shift, employee: shift.employeeId ? byId.get(shift.employeeId) : undefined }));
  return {
    schedule,
    entries,
    employeeCount: new Set(entries.map(({ shift }) => shift.employeeId).filter((id): id is string => Boolean(id))).size,
    openCount: entries.filter(({ shift }) => !shift.employeeId).length,
  };
}

/** Keep the chosen day when moving through months, clamping short months. */
export function moveCalendarMonths(day: Date, offset: number): Date {
  const month = new Date(day.getFullYear(), day.getMonth() + offset, 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return new Date(month.getFullYear(), month.getMonth(), Math.min(day.getDate(), last));
}
