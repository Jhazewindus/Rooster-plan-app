import {
  Absence,
  atMinute,
  CoveragePlan,
  CoverageSegment,
  Employee,
  dateKey,
  durationMinutes,
  makeId,
  mondayOf,
  PlannerData,
  PlannerSettings,
  Recommendation,
  Schedule,
  Shift,
  TimeWindow,
  toIsoWeekday,
} from './domain';

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean => aStart < bEnd && bStart < aEnd;
const asDate = (value: string): Date => new Date(value);

export function canWorkOnDate(employee: Employee, date: Date): boolean {
  if (!employee.active) return false;
  if (employee.kind !== 'intern' && employee.kind !== 'periodic') return true;
  const key = dateKey(date);
  const range = employee.kind === 'intern' ? employee.internship : employee.period;
  return Boolean(range && range.startDate <= key && key <= range.endDate);
}

export function hasRegularCoverage(start: Date, end: Date, shifts: Shift[], employees: Employee[]): boolean {
  const regularIds = new Set(employees.filter((employee) => employee.active && employee.kind !== 'intern').map((employee) => employee.id));
  const intervals = shifts.filter((shift) => shift.employeeId && regularIds.has(shift.employeeId) && overlaps(start, end, asDate(shift.startAt), asDate(shift.endAt)))
    .map((shift) => [asDate(shift.startAt), asDate(shift.endAt)] as const)
    .sort((a, b) => a[0].getTime() - b[0].getTime());
  let cursor = start.getTime();
  for (const [from, until] of intervals) {
    if (from.getTime() > cursor) return false;
    cursor = Math.max(cursor, until.getTime());
    if (cursor >= end.getTime()) return true;
  }
  return false;
}

export function workedMinutes(shift: Shift, settings?: PlannerSettings): number {
  if (!shift.employeeId) return 0;
  const start = asDate(shift.startAt);
  const end = asDate(shift.endAt);
  const intervals = (settings?.breaks ?? [])
    .filter((rule) => rule.weekdays.includes(toIsoWeekday(start)) && rule.endMinute > rule.startMinute)
    .map((rule) => [Math.max(start.getTime(), atMinute(start, rule.startMinute).getTime()), Math.min(end.getTime(), atMinute(start, rule.endMinute).getTime())] as const)
    .filter(([from, until]) => until > from).sort((a, b) => a[0] - b[0]);
  let deducted = 0;
  let coveredUntil = 0;
  for (const [from, until] of intervals) {
    deducted += Math.max(0, until - Math.max(from, coveredUntil));
    coveredUntil = Math.max(coveredUntil, until);
  }
  return Math.max(0, durationMinutes(shift) - Math.round(deducted / 60_000));
}

export type CoverageGap = { startAt: string; endAt: string; staffCount: number };

/** Count distinct staff; an intern only counts during a marked paid shift. */
export function dailyCoverageGaps(day: Date, shifts: Shift[], employees: Employee[]): CoverageGap[] {
  const start = atMinute(day, 7 * 60).getTime();
  const end = atMinute(day, 19 * 60 + 30).getTime();
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  const windows = shifts.filter((shift) => {
    const employee = shift.employeeId ? byId.get(shift.employeeId) : undefined;
    return Boolean(employee && (employee.kind !== 'intern' || shift.paidInternShift));
  })
    .map((shift) => ({ employeeId: shift.employeeId!, from: Math.max(start, asDate(shift.startAt).getTime()), until: Math.min(end, asDate(shift.endAt).getTime()) }))
    .filter((window) => window.until > window.from);
  const points = [...new Set([start, end, ...windows.flatMap((window) => [window.from, window.until])])].sort((a, b) => a - b);
  const gaps: CoverageGap[] = [];
  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index];
    const until = points[index + 1];
    const staffCount = new Set(windows.filter((window) => window.from <= from && window.until >= until).map((window) => window.employeeId)).size;
    if (staffCount >= 5) continue;
    const previous = gaps.at(-1);
    if (previous && previous.endAt === new Date(from).toISOString() && previous.staffCount === staffCount) previous.endAt = new Date(until).toISOString();
    else gaps.push({ startAt: new Date(from).toISOString(), endAt: new Date(until).toISOString(), staffCount });
  }
  return gaps;
}

function removePaidOverlap(shift: Shift, paidManual: Shift[]): Shift[] {
  if (!shift.employeeId || shift.source !== 'default') return [shift];
  let remaining = [shift];
  for (const paid of paidManual.filter((item) => item.employeeId === shift.employeeId)) {
    remaining = remaining.flatMap((part) => {
      const from = Math.max(asDate(part.startAt).getTime(), asDate(paid.startAt).getTime());
      const until = Math.min(asDate(part.endAt).getTime(), asDate(paid.endAt).getTime());
      if (until <= from) return [part];
      const pieces: Shift[] = [];
      if (asDate(part.startAt).getTime() < from) pieces.push({ ...part, endAt: new Date(from).toISOString() });
      if (until < asDate(part.endAt).getTime()) pieces.push({ ...part, id: pieces.length ? makeId() : part.id, startAt: new Date(until).toISOString() });
      return pieces;
    });
  }
  return remaining;
}

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

function preserveValidReplacements(shifts: Shift[], previous: Schedule, employees: Employee[], absences: Absence[]): Shift[] {
  const assigned = shifts.filter((shift) => shift.employeeId);
  const result: Shift[] = [...assigned];
  const previousReplacements = previous.shifts.filter((shift) => shift.source === 'replacement' && shift.employeeId && shift.originalEmployeeId)
    .sort(orderShifts);
  for (const open of shifts.filter((shift) => !shift.employeeId).sort(orderShifts)) {
    const openStart = asDate(open.startAt).getTime();
    const openEnd = asDate(open.endAt).getTime();
    let cursor = openStart;
    for (const candidate of previousReplacements.filter((shift) => shift.originalEmployeeId === open.originalEmployeeId)) {
      const from = Math.max(cursor, openStart, asDate(candidate.startAt).getTime());
      const until = Math.min(openEnd, asDate(candidate.endAt).getTime());
      if (until <= from) continue;
      const employee = employees.find((item) => item.id === candidate.employeeId);
      const start = new Date(from);
      const end = new Date(until);
      if (!employee || !canWorkOnDate(employee, start)) continue;
      if (absences.some((absence) => absence.employeeId === employee.id && overlaps(start, end, asDate(absence.startAt), asDate(absence.endAt)))) continue;
      if (assigned.some((shift) => shift.employeeId === employee.id && overlaps(start, end, asDate(shift.startAt), asDate(shift.endAt)))) continue;
      if (employee.kind === 'intern' && !hasRegularCoverage(start, end, assigned, employees)) continue;
      if (cursor < from) result.push({ ...open, id: makeId(), startAt: new Date(cursor).toISOString(), endAt: start.toISOString() });
      const restored: Shift = { ...candidate, id: from === asDate(candidate.startAt).getTime() && until === asDate(candidate.endAt).getTime() ? candidate.id : makeId(), startAt: start.toISOString(), endAt: end.toISOString() };
      result.push(restored);
      assigned.push(restored);
      cursor = until;
      if (cursor >= openEnd) break;
    }
    if (cursor < openEnd) result.push({ ...open, id: cursor === openStart ? open.id : makeId(), startAt: new Date(cursor).toISOString() });
  }
  return result.sort(orderShifts);
}

export function generateWeek(starting: Date, employees: Employee[], absences: Absence[] = [], extraSupervisors: Shift[] = []): Schedule {
  const weekStart = mondayOf(starting);
  const shifts: Shift[] = [];
  for (const employee of employees.filter((item) => item.active).sort((a, b) => Number(a.kind === 'intern') - Number(b.kind === 'intern'))) {
    for (const [weekdayText, window] of Object.entries(employee.availability)) {
      const weekday = Number(weekdayText);
      if (weekday < 1 || weekday > 7 || !window || window.endMinute <= window.startMinute) continue;
      const day = new Date(weekStart);
      day.setDate(day.getDate() + weekday - 1);
      if (!canWorkOnDate(employee, day)) continue;
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
      if (employee.kind === 'intern' && !hasRegularCoverage(start, end, [...shifts, ...extraSupervisors], employees)) continue;
      shifts.push(...splitShift(base, matchingAbsences));
    }
  }
  shifts.sort(orderShifts);
  const now = new Date().toISOString();
  return { id: makeId(), weekStart: weekStart.toISOString(), status: 'draft', createdAt: now, updatedAt: now, shifts };
}

/** Rebuild generated shifts, retaining the user's original manual entries. */
export function rebuildSchedule(existing: Schedule, employees: Employee[], absences: Absence[]): Schedule {
  const manualShifts = existing.manualShifts ?? [];
  const eligibleManual = manualShifts.filter((shift) => {
    const employee = employees.find((item) => item.id === shift.employeeId);
    return employee && canWorkOnDate(employee, asDate(shift.startAt));
  }).flatMap((shift) => splitShift(shift, absences.filter((absence) => absence.employeeId === shift.employeeId)));
  const regularManual = eligibleManual.filter((shift) => employees.some((employee) => employee.id === shift.employeeId && employee.kind !== 'intern'));
  const preliminary = generateWeek(asDate(existing.weekStart), employees, absences, regularManual);
  const replacementSupervisors = existing.shifts.filter((shift) => shift.source === 'replacement' && shift.employeeId && employees.some((employee) => employee.id === shift.employeeId && employee.active && employee.kind !== 'intern'))
    .filter((shift) => !absences.some((absence) => absence.employeeId === shift.employeeId && overlaps(asDate(shift.startAt), asDate(shift.endAt), asDate(absence.startAt), asDate(absence.endAt))))
    .filter((shift) => !preliminary.shifts.some((item) => item.employeeId === shift.employeeId && overlaps(asDate(item.startAt), asDate(item.endAt), asDate(shift.startAt), asDate(shift.endAt))));
  const base = generateWeek(asDate(existing.weekStart), employees, absences, [...regularManual, ...replacementSupervisors]);
  const paidManual = eligibleManual.filter((shift) => shift.paidInternShift);
  const generatedShifts = base.shifts.flatMap((shift) => removePaidOverlap(shift, paidManual));
  const visibleManual = eligibleManual.filter((shift) => {
    if (!shift.employeeId) return true;
    const employee = employees.find((item) => item.id === shift.employeeId);
    if (generatedShifts.some((item) => item.employeeId === shift.employeeId && overlaps(asDate(item.startAt), asDate(item.endAt), asDate(shift.startAt), asDate(shift.endAt)))) return false;
    return Boolean(shift.paidInternShift || employee?.kind !== 'intern' || hasRegularCoverage(asDate(shift.startAt), asDate(shift.endAt), [...generatedShifts, ...regularManual], employees));
  });
  const rebuilt = preserveValidReplacements([...generatedShifts, ...visibleManual], existing, employees, absences);
  const shifts = rebuilt.filter((shift) => {
    const intern = employees.find((employee) => employee.id === (shift.employeeId ?? shift.originalEmployeeId) && employee.kind === 'intern');
    return !intern || shift.paidInternShift || hasRegularCoverage(asDate(shift.startAt), asDate(shift.endAt), rebuilt, employees);
  });
  return { ...existing, status: 'draft', updatedAt: new Date().toISOString(), manualShifts, shifts };
}

export function generateScheduleRange(starting: Date, months: 1 | 6 | 12, employees: Employee[], absences: Absence[], existing: Schedule[]): Schedule[] {
  const start = mondayOf(starting);
  const end = new Date(start);
  end.setDate(1);
  end.setMonth(end.getMonth() + months);
  const lastDayOfTargetMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  end.setDate(Math.min(start.getDate(), lastDayOfTargetMonth));
  const generated = new Map<string, Schedule>();
  for (const schedule of existing) generated.set(dateKey(asDate(schedule.weekStart)), schedule);
  for (const day = new Date(start); day < end; day.setDate(day.getDate() + 7)) {
    const key = dateKey(day);
    const current = generated.get(key);
    generated.set(key, current ? rebuildSchedule(current, employees, absences) : generateWeek(day, employees, absences));
  }
  return [...generated.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

function keepPastDays(previous: Schedule | undefined, regenerated: Schedule, today: Date): Schedule {
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  const cutoff = todayStart.getTime();
  const historicalShifts = previous?.shifts.filter((shift) => asDate(shift.startAt).getTime() < cutoff) ?? [];
  const futureShifts = regenerated.shifts.filter((shift) => asDate(shift.startAt).getTime() >= cutoff);
  const historicalManual = previous?.manualShifts?.filter((shift) => asDate(shift.startAt).getTime() < cutoff) ?? [];
  const futureManual = regenerated.manualShifts?.filter((shift) => asDate(shift.startAt).getTime() >= cutoff) ?? [];
  return { ...regenerated, shifts: [...historicalShifts, ...futureShifts].sort(orderShifts), manualShifts: [...historicalManual, ...futureManual] };
}

/** Bulk generation never touches completed weeks or elapsed days in this week. */
export function generateFutureScheduleRange(starting: Date, months: 1 | 6 | 12, employees: Employee[], absences: Absence[], existing: Schedule[], today = new Date()): Schedule[] {
  const currentMonday = mondayOf(today);
  const selectedMonday = mondayOf(starting);
  const start = selectedMonday < currentMonday ? currentMonday : selectedMonday;
  const generated = generateScheduleRange(start, months, employees, absences, existing);
  if (start > currentMonday) return generated;
  const key = dateKey(currentMonday);
  const previous = existing.find((schedule) => dateKey(asDate(schedule.weekStart)) === key);
  return generated.map((schedule) => dateKey(asDate(schedule.weekStart)) === key ? keepPastDays(previous, schedule, today) : schedule);
}

/** A single past week is read-only to the automatic generator. */
export function generateFutureWeek(starting: Date, employees: Employee[], absences: Absence[], existing: Schedule[], today = new Date()): Schedule[] {
  const start = mondayOf(starting);
  const currentMonday = mondayOf(today);
  if (start < currentMonday) return existing;
  const key = dateKey(start);
  const previous = existing.find((schedule) => dateKey(asDate(schedule.weekStart)) === key);
  const regenerated = previous ? rebuildSchedule(previous, employees, absences) : generateWeek(start, employees, absences);
  const next = start.getTime() === currentMonday.getTime() ? keepPastDays(previous, regenerated, today) : regenerated;
  return [...existing.filter((schedule) => dateKey(asDate(schedule.weekStart)) !== key), next].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export function rebuildAffectedSchedules(current: PlannerData, absences: Absence[], changed: Absence[]): Schedule[] {
  return current.schedules.map((schedule) => {
    const start = asDate(schedule.weekStart);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    return changed.some((absence) => asDate(absence.startAt) < end && asDate(absence.endAt) > start)
      ? rebuildSchedule(schedule, current.employees, absences) : schedule;
  });
}

/** Hide a team member from future planning while retaining their historical name and shifts. */
export function removeEmployeeFromData(current: PlannerData, employeeId: string, today = new Date()): PlannerData {
  if (!current.employees.some((employee) => employee.id === employeeId && employee.active)) return current;
  const employees = current.employees.map((employee) => employee.id === employeeId ? { ...employee, active: false } : employee);
  const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
  const absences = current.absences.flatMap((absence) => {
    if (absence.employeeId !== employeeId) return [absence];
    if (asDate(absence.startAt) >= todayStart) return [];
    return [{ ...absence, endAt: asDate(absence.endAt) > todayStart ? todayStart.toISOString() : absence.endAt }];
  });
  const currentMonday = mondayOf(today);
  const schedules = current.schedules.map((schedule) => {
    const weekStart = asDate(schedule.weekStart);
    if (weekStart < currentMonday) return schedule;
    const affected = [...schedule.shifts, ...(schedule.manualShifts ?? [])].some((shift) => shift.employeeId === employeeId || shift.originalEmployeeId === employeeId);
    if (!affected) return schedule;
    const retainedManual = schedule.manualShifts?.filter((shift) => shift.employeeId !== employeeId || (weekStart.getTime() === currentMonday.getTime() && asDate(shift.startAt) < todayStart));
    const regenerated = rebuildSchedule({ ...schedule, manualShifts: retainedManual }, employees, absences);
    return weekStart.getTime() === currentMonday.getTime() ? keepPastDays(schedule, regenerated, today) : regenerated;
  });
  return { ...current, employees, absences, schedules };
}

export function recommendations(openShift: Shift, schedule: Schedule, employees: Employee[], absences: Absence[], settings?: PlannerSettings): Recommendation[] {
  const activeEmployees = employees.filter((employee) => employee.active);
  const minutesByEmployee = new Map<string, number>();
  for (const shift of schedule.shifts) {
    if (shift.employeeId) minutesByEmployee.set(shift.employeeId, (minutesByEmployee.get(shift.employeeId) ?? 0) + workedMinutes(shift, settings));
  }
  const leastMinutes = activeEmployees.length === 0 ? 0 : Math.min(...activeEmployees.map((employee) => minutesByEmployee.get(employee.id) ?? 0));
  const targetRole = employees.find((employee) => employee.id === openShift.originalEmployeeId)?.role;
  const openStart = asDate(openShift.startAt);
  const openEnd = asDate(openShift.endAt);
  const duration = durationMinutes(openShift);

  return activeEmployees.map((employee) => {
    const absent = absences.some((absence) => absence.employeeId === employee.id && overlaps(openStart, openEnd, asDate(absence.startAt), asDate(absence.endAt)));
    const conflict = schedule.shifts.some((shift) => shift.id !== openShift.id && shift.employeeId === employee.id && overlaps(openStart, openEnd, asDate(shift.startAt), asDate(shift.endAt)));
    const outsideStage = !canWorkOnDate(employee, openStart);
    const noSupervisor = employee.kind === 'intern' && !hasRegularCoverage(openStart, openEnd, schedule.shifts, employees);
    const scheduled = minutesByEmployee.get(employee.id) ?? 0;
    const projected = scheduled + workedMinutes({ ...openShift, employeeId: employee.id }, settings);
    const exceedsContract = employee.weeklyContractMinutes > 0 && projected > employee.weeklyContractMinutes;
    const weekday = toIsoWeekday(openStart);
    const usualDay = Boolean(employee.availability[weekday]);
    let score = 0;
    const reasons: string[] = [];

    if (outsideStage) { score -= 100; reasons.push(employee.kind === 'periodic' ? 'Buiten de werkperiode' : 'Buiten de stageperiode'); }
    else if (noSupervisor) { score -= 100; reasons.push('Geen begeleidende medewerker'); }
    else if (absent) { score -= 100; reasons.push('Afwezig op dit moment'); }
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

    return { employee, score, canCover: !outsideStage && !noSupervisor && !absent && !conflict, projectedWeeklyMinutes: projected, exceedsContract, reasons };
  }).sort((a, b) => Number(b.canCover) - Number(a.canCover) || b.score - a.score || a.employee.displayName.localeCompare(b.employee.displayName));
}

export function suggestCoverage(openShift: Shift, schedule: Schedule, employees: Employee[], absences: Absence[]): CoveragePlan {
  const openStart = asDate(openShift.startAt);
  const openEnd = asDate(openShift.endAt);
  const weekday = toIsoWeekday(openStart);
  const possible: { employee: Employee; start: Date; end: Date }[] = [];

  for (const employee of employees.filter((item) => canWorkOnDate(item, openStart) && (item.kind !== 'intern' || hasRegularCoverage(openStart, openEnd, schedule.shifts, employees)))) {
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

export function hoursForEmployee(schedule: Schedule, employeeId: string, settings?: PlannerSettings): number {
  return schedule.shifts.filter((shift) => shift.employeeId === employeeId).reduce((total, shift) => total + workedMinutes(shift, settings), 0) / 60;
}

export function currentSchedule(data: PlannerData, weekStart: Date): Schedule | undefined {
  const key = dateKey(mondayOf(weekStart));
  return data.schedules.find((schedule) => dateKey(new Date(schedule.weekStart)) === key);
}

export function windowFromMinutes(startMinute: number, endMinute: number): TimeWindow {
  return { startMinute, endMinute };
}
