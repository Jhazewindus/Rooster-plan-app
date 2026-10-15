import assert from 'node:assert/strict';
import test from 'node:test';
import { Absence, dateKey, Employee, PlannerSettings, Shift } from '../src/domain';
import { generateFutureScheduleRange, generateFutureWeek, generateScheduleRange, generateWeek, rebuildAffectedSchedules, rebuildSchedule, recommendations, workedMinutes } from '../src/planner';

const monday = new Date(2026, 9, 12);
function at(day: Date, hour: number, minute = 0): string {
  const value = new Date(day); value.setHours(hour, minute, 0, 0); return value.toISOString();
}
function employee(id: string, days: Employee['availability'], intern = false): Employee {
  return { id, firstName: id, lastName: '', displayName: id, role: 'Dierenverzorging', color: '#B76445', weeklyContractMinutes: 2400, active: true, availability: days,
    kind: intern ? 'intern' : 'regular', internship: intern ? { startDate: '2026-10-12', endDate: '2026-10-14' } : undefined };
}
function shift(id: string, day: Date, from: number, until: number): Shift {
  return { id, employeeId: 'regular', originalEmployeeId: null, startAt: at(day, from), endAt: at(day, until), source: 'manual', notes: '' };
}

test('intern is generated only within stage dates and alongside a regular coworker', () => {
  const regular = employee('regular', { 1: { startMinute: 420, endMinute: 1020 }, 3: { startMinute: 420, endMinute: 1020 } });
  const intern = employee('intern', { 1: { startMinute: 420, endMinute: 1020 }, 3: { startMinute: 420, endMinute: 1020 }, 5: { startMinute: 420, endMinute: 1020 } }, true);
  const result = generateWeek(monday, [intern, regular]);
  assert.deepEqual(result.shifts.filter((item) => item.employeeId === 'intern').map((item) => dateKey(new Date(item.startAt))), ['2026-10-12', '2026-10-14']);

  const absence: Absence = { id: 'away', employeeId: 'regular', type: 'sick', startAt: at(monday, 7), endAt: at(monday, 17), notes: '' };
  const withAbsence = generateWeek(monday, [regular, intern], [absence]);
  assert.deepEqual(withAbsence.shifts.filter((item) => item.employeeId === 'intern').map((item) => dateKey(new Date(item.startAt))), ['2026-10-14']);
});

test('a manually added regular coworker can supervise a generated intern shift', () => {
  const regular = employee('regular', {});
  const intern = employee('intern', { 1: { startMinute: 420, endMinute: 1020 } }, true);
  const withoutManual = generateWeek(monday, [regular, intern]);
  assert.equal(withoutManual.shifts.length, 0);
  const withManual = rebuildSchedule({ ...withoutManual, manualShifts: [shift('supervisor', monday, 7, 17)] }, [regular, intern], []);
  assert.equal(withManual.shifts.filter((item) => item.employeeId === 'regular').length, 1);
  assert.equal(withManual.shifts.filter((item) => item.employeeId === 'intern').length, 1);
});

test('a valid replacement coworker also keeps an intern supervised on regeneration', () => {
  const regular = employee('regular', { 1: { startMinute: 420, endMinute: 1020 } });
  const backup = employee('backup', {});
  const intern = employee('intern', { 1: { startMinute: 420, endMinute: 1020 } }, true);
  const absence: Absence = { id: 'away', employeeId: regular.id, type: 'sick', startAt: at(monday, 7), endAt: at(monday, 17), notes: '' };
  const generated = generateWeek(monday, [regular, backup, intern], [absence]);
  const covered = { ...generated, shifts: generated.shifts.map((item) => item.employeeId === null ? { ...item, employeeId: backup.id } : item) };
  const rebuilt = rebuildSchedule(covered, [regular, backup, intern], [absence]);
  assert.equal(rebuilt.shifts.some((item) => item.employeeId === backup.id), true);
  assert.equal(rebuilt.shifts.some((item) => item.employeeId === intern.id), true);
});

test('intern cannot be suggested outside the internship period', () => {
  const intern = employee('intern', {}, true);
  const friday = new Date(2026, 9, 16);
  const open: Shift = { ...shift('open', friday, 7, 17), employeeId: null, source: 'replacement' };
  const result = recommendations(open, { id: 'week', weekStart: monday.toISOString(), status: 'draft', createdAt: '', updatedAt: '', shifts: [open] }, [intern], []);
  assert.equal(result[0].canCover, false);
  assert.ok(result[0].reasons.includes('Buiten de stageperiode'));
});

test('day and evening breaks deduct only overlapping time, once, for all staff types', () => {
  const settings: PlannerSettings = { breaks: [
    { id: 'day', kind: 'day', label: 'Lunch', weekdays: [1], startMinute: 720, endMinute: 750 },
    { id: 'overlap', kind: 'day', label: 'Overlap', weekdays: [1], startMinute: 735, endMinute: 750 },
    { id: 'evening', kind: 'evening', label: 'Avond', weekdays: [1], startMinute: 1080, endMinute: 1100 },
  ] };
  assert.equal(workedMinutes(shift('day', monday, 7, 17), settings), 570);
  assert.equal(workedMinutes(shift('evening', monday, 16, 20), settings), 220);
  assert.equal(workedMinutes({ ...shift('intern', monday, 7, 17), employeeId: 'intern' }, settings), 570);
  assert.equal(workedMinutes(shift('early', monday, 7, 11), settings), 240);
});

test('removing an absence restores defaults and manual shifts', () => {
  const regular = employee('regular', { 1: { startMinute: 420, endMinute: 1020 } });
  const tuesday = new Date(2026, 9, 13);
  const manual = shift('manual', tuesday, 18, 20);
  const absence: Absence = { id: 'away', employeeId: 'regular', type: 'sick', startAt: at(monday, 10), endAt: at(monday, 12), notes: '' };
  const withAbsence = rebuildSchedule({ ...generateWeek(monday, [regular], [absence]), manualShifts: [manual] }, [regular], [absence]);
  assert.equal(withAbsence.shifts.filter((item) => item.employeeId === null).length, 1);
  const restored = rebuildSchedule(withAbsence, [regular], []);
  assert.equal(restored.shifts.filter((item) => item.employeeId === null).length, 0);
  assert.equal(restored.shifts.filter((item) => item.employeeId === 'regular').length, 2);
  assert.ok(restored.shifts.some((item) => item.id === manual.id));
});

test('editing an absence rebuilds both the old and new affected week only', () => {
  const regular = employee('regular', { 1: { startMinute: 420, endMinute: 1020 } });
  const weeks = generateScheduleRange(monday, 1, [regular], [], []);
  const oldAbsence: Absence = { id: 'leave', employeeId: 'regular', type: 'vacation', startAt: at(monday, 7), endAt: at(monday, 17), notes: '' };
  const nextMonday = new Date(2026, 9, 19);
  const movedAbsence = { ...oldAbsence, startAt: at(nextMonday, 7), endAt: at(nextMonday, 17) };
  const first = rebuildAffectedSchedules({ employees: [regular], absences: [], schedules: weeks }, [oldAbsence], [oldAbsence]);
  const afterMove = rebuildAffectedSchedules({ employees: [regular], absences: [oldAbsence], schedules: first }, [movedAbsence], [oldAbsence, movedAbsence]);
  assert.equal(afterMove[0].shifts.some((item) => item.employeeId === null), false);
  assert.equal(afterMove[1].shifts.some((item) => item.employeeId === null), true);
  assert.strictEqual(afterMove[2], first[2]);
});

test('rebuilding one absence keeps valid replacements for another absence', () => {
  const regular = employee('regular', { 1: { startMinute: 420, endMinute: 1020 }, 2: { startMinute: 420, endMinute: 1020 } });
  const backup = employee('backup', {});
  const tuesday = new Date(2026, 9, 13);
  const mondayAway: Absence = { id: 'mon', employeeId: regular.id, type: 'sick', startAt: at(monday, 10), endAt: at(monday, 12), notes: '' };
  const tuesdayAway: Absence = { id: 'tue', employeeId: regular.id, type: 'sick', startAt: at(tuesday, 10), endAt: at(tuesday, 12), notes: '' };
  const generated = generateWeek(monday, [regular, backup], [mondayAway, tuesdayAway]);
  const covered = { ...generated, shifts: generated.shifts.map((item) => item.employeeId === null && dateKey(new Date(item.startAt)) === '2026-10-13'
    ? { ...item, employeeId: backup.id } : item) };
  const rebuilt = rebuildSchedule(covered, [regular, backup], [tuesdayAway]);
  assert.equal(rebuilt.shifts.some((item) => item.employeeId === null && dateKey(new Date(item.startAt)) === '2026-10-12'), false);
  assert.equal(rebuilt.shifts.some((item) => item.employeeId === backup.id && dateKey(new Date(item.startAt)) === '2026-10-13'), true);
});

test('generates one, six or twelve months and includes a newly added employee on regeneration', () => {
  const regular = employee('regular', { 1: { startMinute: 420, endMinute: 1020 } });
  const newcomer = employee('new', { 1: { startMinute: 420, endMinute: 1020 } });
  const one = generateScheduleRange(monday, 1, [regular], [], []);
  assert.equal(one.length, 5);
  assert.equal(generateScheduleRange(monday, 6, [regular], [], []).length, 26);
  assert.equal(generateScheduleRange(monday, 12, [regular], [], []).length, 53);
  const regenerated = generateScheduleRange(monday, 1, [regular, newcomer], [], one);
  assert.equal(regenerated.length, 5);
  assert.ok(regenerated.every((item) => item.shifts.some((entry) => entry.employeeId === 'new')));
});

test('paid evening work reclassifies only the overlapping intern hours and survives regeneration', () => {
  const regular = employee('regular', { 1: { startMinute: 420, endMinute: 1170 } });
  const intern = employee('intern', { 1: { startMinute: 420, endMinute: 1170 } }, true);
  const evening: Shift = { ...shift('paid', monday, 17, 19), endAt: at(monday, 19, 30), employeeId: intern.id, paidInternShift: true };
  const generated = generateWeek(monday, [regular, intern]);
  const rebuilt = rebuildSchedule({ ...generated, manualShifts: [evening] }, [regular, intern], []);
  const internShifts = rebuilt.shifts.filter((item) => item.employeeId === intern.id);
  assert.deepEqual(internShifts.map((item) => [item.paidInternShift ?? false, new Date(item.startAt).getHours(), new Date(item.endAt).getHours()]), [[false, 7, 17], [true, 17, 19]]);
  const again = rebuildSchedule(rebuilt, [regular, intern], []);
  assert.deepEqual(again.shifts.filter((item) => item.employeeId === intern.id).map((item) => item.paidInternShift ?? false), [false, true]);
  const alone = rebuildSchedule({ ...generateWeek(monday, [intern]), manualShifts: [evening] }, [intern], []);
  assert.deepEqual(alone.shifts.map((item) => item.id), ['paid']);
});

test('future generation leaves old weeks and earlier days of this week untouched', () => {
  const regular = employee('regular', { 1: { startMinute: 420, endMinute: 1020 }, 4: { startMinute: 420, endMinute: 1020 } });
  const newcomer = employee('new', { 1: { startMinute: 420, endMinute: 1020 }, 4: { startMinute: 420, endMinute: 1020 } });
  const lastMonday = new Date(2026, 9, 5);
  const past = generateWeek(lastMonday, [regular]);
  const current = generateWeek(monday, [regular]);
  current.shifts[0] = { ...current.shifts[0], startAt: at(monday, 9) };
  const today = new Date(2026, 9, 15, 12);
  const result = generateFutureScheduleRange(lastMonday, 1, [regular, newcomer], [], [past, current], today);
  assert.strictEqual(result.find((item) => item.id === past.id), past);
  const refreshed = result.find((item) => item.id === current.id)!;
  assert.deepEqual(refreshed.shifts.filter((item) => dateKey(new Date(item.startAt)) === '2026-10-12'), [current.shifts[0]]);
  assert.equal(refreshed.shifts.some((item) => item.employeeId === newcomer.id && dateKey(new Date(item.startAt)) === '2026-10-12'), false);
  assert.equal(refreshed.shifts.some((item) => item.employeeId === newcomer.id && dateKey(new Date(item.startAt)) === '2026-10-15'), true);
  assert.strictEqual(generateFutureWeek(lastMonday, [regular, newcomer], [], [past, current], today)[0], past);
});
