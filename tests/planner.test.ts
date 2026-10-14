import assert from 'node:assert/strict';
import test from 'node:test';
import { Absence, Employee, Schedule, Shift } from '../src/domain';
import { generateWeek, recommendations, suggestCoverage } from '../src/planner';

function person(id: string, name: string, availability: Employee['availability'], hours = 40, role = 'Verkoop'): Employee {
  return { id, firstName: name, lastName: '', displayName: name, role, color: '#B76445', weeklyContractMinutes: hours * 60, active: true, availability };
}

function at(day: Date, hour: number, minute = 0): string {
  const value = new Date(day); value.setHours(hour, minute, 0, 0); return value.toISOString();
}

function schedule(weekStart: Date, shifts: Shift[]): Schedule {
  return { id: 'schedule', weekStart: weekStart.toISOString(), status: 'draft', createdAt: '', updatedAt: '', shifts };
}

test('generates distinct weekly availability intervals for active employees', () => {
  const week = new Date(2026, 9, 12, 14);
  const lisa = person('lisa', 'Lisa', { 1: { startMinute: 8 * 60, endMinute: 17 * 60 }, 5: { startMinute: 8 * 60, endMinute: 15 * 60 } });
  const inactive = { ...person('off', 'Uit', { 1: { startMinute: 8 * 60, endMinute: 17 * 60 } }), active: false };
  const result = generateWeek(week, [lisa, inactive]);
  assert.equal(result.shifts.length, 2);
  assert.equal(new Date(result.weekStart).getDay(), 1);
  assert.deepEqual(result.shifts.map((shift) => Math.round((new Date(shift.endAt).getTime() - new Date(shift.startAt).getTime()) / 60_000)), [540, 420]);
});

test('a multi-day absence opens only the affected part of each default shift', () => {
  const monday = new Date(2026, 9, 12);
  const lisa = person('lisa', 'Lisa', { 1: { startMinute: 8 * 60, endMinute: 17 * 60 }, 2: { startMinute: 8 * 60, endMinute: 17 * 60 } });
  const absence: Absence = { id: 'sick', employeeId: 'lisa', type: 'sick', startAt: at(monday, 12), endAt: at(new Date(2026, 9, 13), 10), notes: '' };
  const result = generateWeek(monday, [lisa], [absence]);
  assert.equal(result.shifts.length, 4);
  assert.deepEqual(result.shifts.map((shift) => [shift.employeeId, new Date(shift.startAt).getDate(), new Date(shift.startAt).getHours(), new Date(shift.endAt).getHours()]), [
    ['lisa', 12, 8, 12], [null, 12, 12, 17], [null, 13, 8, 10], ['lisa', 13, 10, 17],
  ]);
  assert.ok(result.shifts.filter((shift) => shift.employeeId === null).every((shift) => shift.originalEmployeeId === 'lisa'));
});

test('recommendations block conflicts and absences and warn about contract overruns', () => {
  const monday = new Date(2026, 9, 12);
  const open: Shift = { id: 'open', employeeId: null, originalEmployeeId: 'lisa', startAt: at(monday, 8), endAt: at(monday, 12), source: 'replacement', notes: '' };
  const lisa = person('lisa', 'Lisa', { 1: { startMinute: 8 * 60, endMinute: 12 * 60 } });
  const mark = person('mark', 'Mark', { 1: { startMinute: 9 * 60, endMinute: 17 * 60 } }, 40);
  const sophie = person('sophie', 'Sophie', {}, 8);
  const peter = person('peter', 'Peter', {}, 2, 'Service');
  const conflict: Shift = { id: 'mark-shift', employeeId: 'mark', originalEmployeeId: null, startAt: at(monday, 10), endAt: at(monday, 11), source: 'default', notes: '' };
  const absence: Absence = { id: 'sophie-away', employeeId: 'sophie', type: 'vacation', startAt: at(monday, 8), endAt: at(monday, 12), notes: '' };
  const result = recommendations(open, schedule(monday, [open, conflict]), [lisa, mark, sophie, peter], [absence]);
  assert.equal(result.find((item) => item.employee.id === 'mark')?.canCover, false);
  assert.equal(result.find((item) => item.employee.id === 'sophie')?.canCover, false);
  assert.equal(result.find((item) => item.employee.id === 'mark')?.reasons.some((reason) => reason.includes('overlappende')), true);
  assert.equal(result.find((item) => item.employee.id === 'sophie')?.reasons[0], 'Afwezig op dit moment');
  assert.equal(result.find((item) => item.employee.id === 'peter')?.canCover, true);
  assert.equal(result.find((item) => item.employee.id === 'peter')?.exceedsContract, true);
});

test('combines partial availability windows into a complete planner-confirmed cover plan', () => {
  const monday = new Date(2026, 9, 12);
  const open: Shift = { id: 'open', employeeId: null, originalEmployeeId: 'lisa', startAt: at(monday, 8), endAt: at(monday, 17), source: 'replacement', notes: '' };
  const mark = person('mark', 'Mark', { 1: { startMinute: 8 * 60, endMinute: 12 * 60 } });
  const sophie = person('sophie', 'Sophie', { 1: { startMinute: 12 * 60, endMinute: 17 * 60 } });
  const otherShift: Shift[] = [
    { id: 'mark-busy', employeeId: 'mark', originalEmployeeId: null, startAt: at(monday, 12), endAt: at(monday, 17), source: 'default', notes: '' },
    { id: 'sophie-busy', employeeId: 'sophie', originalEmployeeId: null, startAt: at(monday, 8), endAt: at(monday, 12), source: 'default', notes: '' },
  ];
  const result = suggestCoverage(open, schedule(monday, [open, ...otherShift]), [mark, sophie], []);
  assert.equal(result.isComplete, true);
  assert.deepEqual(result.segments.map((segment) => [segment.employeeId, new Date(segment.startAt).getHours(), new Date(segment.endAt).getHours()]), [['mark', 8, 12], ['sophie', 12, 17]]);
});
