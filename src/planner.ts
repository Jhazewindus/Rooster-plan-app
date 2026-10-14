import {
  Absence,
  CoveragePlan,
  CoverageSegment,
  Employee,
  makeId,
  mondayOf,
  PlannerData,
  Recommendation,
  Schedule,
  Shift,
  TimeWindow,
  toIsoWeekday,
} from './domain';

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean => aStart < bEnd && bStart < aEnd;
const asDate = (value: string): Date => new Date(value);

function subtract(blockStart: Date, blockEnd: Date, window: [Date, Date]): [Date, Date][] {
  if (!overlaps(window[0], window[1], blockStart, blockEnd)) return [window];
  const pieces: [Date, Date][] = [];
  if (window[0] < blockStart) pieces.push([window[0], new Date(Math.min(window[1].getTime(), blockStart.getTime()))]);
  if (blockEnd < window[1]) pieces.push([new Date(Math.max(window[0].getTime(), blockEnd.getTime())), window[1]]);
  return pieces.filter(([start, end]) => end > start);
}

function splitShift(shift: Shift, absences: Absence[]): Shift[] {
  const intervals = absences
    .map((absence) => [
      new Date(Math.max(asDate(shift.startAt).getTime(), asDate(absence.startAt).getTime())),
      new Date(Math.min(asDate(shift.endAt).getTime(), asDate(absence.endAt).getTime())),
    ] as [Date, Date])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0].getTime() - b[0].getTime());
  if (intervals.length === 0) return [shift];

  const merged: [Date, Date][] = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval[0] <= previous[1]) previous[1] = new Date(Math.max(previous[1].getTime(), interval[1].getTime()));
    else merged.push(interval);
  }

  const result: Shift[] = [];
  let cursor = asDate(shift.startAt);
  for (const [start, end] of merged) {
    if (start > cursor) result.push({ ...shift, id: makeId(), startAt: cursor.toISOString(), endAt: start.toISOString() });
    result.push({
      id: makeId(), employeeId: null, originalEmployeeId: shift.employeeId ?? shift.originalEmployeeId,
      startAt: start.toISOString(), endAt: end.toISOString(), source: 'replacement', notes: 'Open door afwezigheid',
    });
    cursor = new Date(Math.max(cursor.getTime(), end.getTime()));
  }
  if (cursor < asDate(shift.endAt)) result.push({ ...shift, id: makeId(), startAt: cursor.toISOString() });
  return result;
}

function orderShifts(a: Shift, b: Shift): number {
  const byStart = asDate(a.startAt).getTime() - asDate(b.startAt).getTime();
  if (byStart !== 0) return byStart;
  if (Boolean(a.employeeId) !== Boolean(b.employeeId)) return a.employeeId ? 1 : -1;
  return (a.employeeId ?? '').localeCompare(b.employeeId ?? '');
}

export function generateWeek(starting: Date, employees: Employee[], absences: Absence[] = []): Schedule {
  const weekStart = mondayOf(starting);
  const shifts: Shift[] = [];
  for (const employee of employees.filter((item) => item.active)) {
    for (const [weekdayText, window] of Object.entries(employee.availability)) {
      const weekday = Number(weekdayText);
      if (weekday < 1 || weekday > 7 || !window || window.endMinute <= window.startMinute) continue;
      const day = new Date(weekStart);
      day.setDate(day.getDate() + weekday - 1);
      const start = new Date(day);
      start.setHours(Math.floor(window.startMinute / 60), window.startMinute % 60, 0, 0);
      const end = new Date(day);
      end.setHours(Math.floor(window.endMinute / 60), window.endMinute % 60, 0, 0);
      const base: Shift = {
        id: makeId(), employeeId: employee.id, originalEmployeeId: null,
        startAt: start.toISOString(), endAt: end.toISOString(), source: 'default', notes: '',
      };
      const matchingAbsences = absences.filter((absence) =>
        absence.employeeId === employee.id && overlaps(start, end, asDate(absence.startAt), asDate(absence.endAt)));
      shifts.push(...splitShift(base, matchingAbsences));
    }
  }
  shifts.sort(orderShifts);
  const now = new Date().toISOString();
  return { id: makeId(), weekStart: weekStart.toISOString(), status: 'draft', createdAt: now, updatedAt: now, shifts };
}

export function applyAbsence(schedule: Schedule, absence: Absence): Schedule {
  const absenceStart = asDate(absence.startAt);
  const absenceEnd = asDate(absence.endAt);
  const shifts = schedule.shifts.flatMap((shift) => {
    if (shift.employeeId !== absence.employeeId || !overlaps(asDate(shift.startAt), asDate(shift.endAt), absenceStart, absenceEnd)) return [shift];
    return splitShift(shift, [absence]);
  }).sort(orderShifts);
  return { ...schedule, shifts, updatedAt: new Date().toISOString() };
}

export function recommendations(openShift: Shift, schedule: Schedule, employees: Employee[], absences: Absence[]): Recommendation[] {
  const activeEmployees = employees.filter((employee) => employee.active);
  const minutesByEmployee = new Map<string, number>();
  for (const shift of schedule.shifts) {
    if (shift.employeeId) minutesByEmployee.set(shift.employeeId, (minutesByEmployee.get(shift.employeeId) ?? 0) + Math.round((asDate(shift.endAt).getTime() - asDate(shift.startAt).getTime()) / 60_000));
  }
  const leastMinutes = activeEmployees.length === 0 ? 0 : Math.min(...activeEmployees.map((employee) => minutesByEmployee.get(employee.id) ?? 0));
  const targetRole = employees.find((employee) => employee.id === openShift.originalEmployeeId)?.role;
  const openStart = asDate(openShift.startAt);
  const openEnd = asDate(openShift.endAt);
  const duration = Math.round((openEnd.getTime() - openStart.getTime()) / 60_000);

  return activeEmployees.map((employee) => {
    const absent = absences.some((absence) => absence.employeeId === employee.id && overlaps(openStart, openEnd, asDate(absence.startAt), asDate(absence.endAt)));
    const conflict = schedule.shifts.some((shift) => shift.id !== openShift.id && shift.employeeId === employee.id && overlaps(openStart, openEnd, asDate(shift.startAt), asDate(shift.endAt)));
    const scheduled = minutesByEmployee.get(employee.id) ?? 0;
    const projected = scheduled + duration;
    const exceedsContract = employee.weeklyContractMinutes > 0 && projected > employee.weeklyContractMinutes;
    const weekday = toIsoWeekday(openStart);
    const usualDay = Boolean(employee.availability[weekday]);
    let score = 0;
    const reasons: string[] = [];

    if (absent) { score -= 100; reasons.push('Afwezig op dit moment'); }
    else if (conflict) { score -= 100; reasons.push('Heeft al een overlappende dienst'); }
    else { score += 40; reasons.push('Beschikbaar, geen roosterconflict'); }
    if (usualDay) { score += 20; reasons.push('Werkt normaal op deze dag'); }
    else { score -= 20; reasons.push('Normale vrije dag'); }
    if (employee.weeklyContractMinutes > 0) {
      if (exceedsContract) { score -= 30; reasons.push('Komt boven contracturen uit'); }
      else { score += 20; reasons.push('Blijft binnen contracturen'); }
    } else reasons.push('Contracturen niet ingesteld');
    if (targetRole && employee.role.toLocaleLowerCase() === targetRole.toLocaleLowerCase()) {
      score += 10;
      reasons.push('Dezelfde functie');
    }
    if (scheduled <= leastMinutes + duration) {
      score += 10;
      reasons.push('Extra uren eerlijk verdeeld');
    }

    return { employee, score, canCover: !absent && !conflict, projectedWeeklyMinutes: projected, exceedsContract, reasons };
  }).sort((a, b) => Number(b.canCover) - Number(a.canCover) || b.score - a.score || a.employee.displayName.localeCompare(b.employee.displayName));
}

export function suggestCoverage(openShift: Shift, schedule: Schedule, employees: Employee[], absences: Absence[]): CoveragePlan {
  const openStart = asDate(openShift.startAt);
  const openEnd = asDate(openShift.endAt);
  const weekday = toIsoWeekday(openStart);
  const possible: { employee: Employee; start: Date; end: Date }[] = [];

  for (const employee of employees.filter((item) => item.active)) {
    const normal = employee.availability[weekday];
    const windows: [Date, Date][] = [];
    if (normal) {
      const start = new Date(openStart); start.setHours(Math.floor(normal.startMinute / 60), normal.startMinute % 60, 0, 0);
      const end = new Date(openStart); end.setHours(Math.floor(normal.endMinute / 60), normal.endMinute % 60, 0, 0);
      windows.push([start, end]);
    } else windows.push([openStart, openEnd]); // A usual day off can still be offered as an extra shift.

    let free = windows;
    for (const shift of schedule.shifts) {
      if (shift.employeeId === employee.id && shift.id !== openShift.id) {
        free = free.flatMap((window) => subtract(asDate(shift.startAt), asDate(shift.endAt), window));
      }
    }
    for (const absence of absences) {
      if (absence.employeeId === employee.id) free = free.flatMap((window) => subtract(asDate(absence.startAt), asDate(absence.endAt), window));
    }
    for (const [start, end] of free) {
      const clippedStart = new Date(Math.max(start.getTime(), openStart.getTime()));
      const clippedEnd = new Date(Math.min(end.getTime(), openEnd.getTime()));
      if (clippedEnd > clippedStart) possible.push({ employee, start: clippedStart, end: clippedEnd });
    }
  }

  const points = Array.from(new Set([openStart.getTime(), openEnd.getTime(), ...possible.flatMap(({ start, end }) => [start.getTime(), end.getTime()])])).sort((a, b) => a - b);
  const segments: CoverageSegment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = new Date(points[index]);
    const end = new Date(points[index + 1]);
    const options = possible.filter((item) => item.start <= start && item.end >= end).sort((a, b) => {
      const normalA = Boolean(a.employee.availability[weekday]);
      const normalB = Boolean(b.employee.availability[weekday]);
      return Number(normalB) - Number(normalA) || a.employee.displayName.localeCompare(b.employee.displayName);
    });
    const selected = options[0];
    if (!selected) return { segments, isComplete: false };
    const previous = segments.at(-1);
    if (previous?.employeeId === selected.employee.id && previous.endAt === start.toISOString()) previous.endAt = end.toISOString();
    else segments.push({ employeeId: selected.employee.id, startAt: start.toISOString(), endAt: end.toISOString() });
  }
  return { segments, isComplete: segments.length > 0 && segments[0].startAt === openStart.toISOString() && segments.at(-1)?.endAt === openEnd.toISOString() };
}

export function assignReplacement(schedule: Schedule, shiftId: string, employeeId: string): Schedule {
  return {
    ...schedule,
    updatedAt: new Date().toISOString(),
    shifts: schedule.shifts.map((shift) => shift.id === shiftId && shift.employeeId === null
      ? { ...shift, employeeId, source: 'replacement' as const, notes: '' }
      : shift).sort(orderShifts),
  };
}

export function hoursForEmployee(schedule: Schedule, employeeId: string): number {
  return schedule.shifts.filter((shift) => shift.employeeId === employeeId).reduce((total, shift) => total + Math.max(0, asDate(shift.endAt).getTime() - asDate(shift.startAt).getTime()) / 3_600_000, 0);
}

export function currentSchedule(data: PlannerData, weekStart: Date): Schedule | undefined {
  const key = dateKey(mondayOf(weekStart));
  return data.schedules.find((schedule) => dateKey(new Date(schedule.weekStart)) === key);
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function windowFromMinutes(startMinute: number, endMinute: number): TimeWindow {
  return { startMinute, endMinute };
}
