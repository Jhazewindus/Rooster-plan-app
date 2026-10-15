import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackup, parseBackup, parseLegacyData } from '../src/backup';
import { Employee, emptyPlannerData, PlannerData, Schedule, Shift } from '../src/domain';
import { canUndo, recordChange, undoLast } from '../src/history';
import { publicationIssues } from '../src/publication';

const monday = new Date(2026, 9, 12);
const at = (day: Date, hour: number, minute = 0): string => {
  const result = new Date(day); result.setHours(hour, minute, 0, 0); return result.toISOString();
};
const person = (id: string, kind: Employee['kind'] = 'regular'): Employee => ({
  id, firstName: id, lastName: '', displayName: id, role: '', color: '#000000',
  weeklyContractMinutes: 2400, active: true, kind, availability: {},
});
const shift = (day: Date, employeeId: string | null, id: string): Shift => ({
  id, employeeId, originalEmployeeId: null, startAt: at(day, 7), endAt: at(day, 19, 30), source: 'manual', notes: '',
});
const schedule = (day: Date, id: string, shifts: Shift[] = []): Schedule => ({
  id, weekStart: day.toISOString(), status: 'draft', createdAt: day.toISOString(), updatedAt: day.toISOString(), shifts,
});

test('backup round-trips planning and history, and rejects invalid files before restore', () => {
  const initial = { data: emptyPlannerData(), history: [] };
  const changed = recordChange(initial, { ...initial.data, employees: [person('Lisa')] }, 'Lisa toegevoegd');
  const text = createBackup(changed, '2026-10-15T10:00:00.000Z');
  const parsed = parseBackup(text);
  assert.deepEqual(parsed.archive, changed);
  assert.equal(parsed.exportedAt, '2026-10-15T10:00:00.000Z');
  assert.deepEqual(parseLegacyData(JSON.stringify(changed.data)), { data: changed.data, history: [] });
  assert.throws(() => parseBackup(text.replace('"version": 1', '"version": 2')), /ondersteunde/);
  const damaged = JSON.parse(text);
  damaged.data.employees[0].availability['1'] = { startMinute: 900, endMinute: 600 };
  assert.throws(() => parseBackup(JSON.stringify(damaged)), /geldige/);
});

test('undo restores only changed weeks and keeps an honest local history', () => {
  const nextMonday = new Date(monday); nextMonday.setDate(nextMonday.getDate() + 7);
  const first = schedule(monday, 'first');
  const second = schedule(nextMonday, 'second');
  const original: PlannerData = { ...emptyPlannerData(), schedules: [first, second] };
  const archive = { data: original, history: [] };
  const edited = recordChange(archive, { ...original, schedules: [first, { ...second, status: 'final' }] }, 'Tweede week aangepast');
  assert.deepEqual(edited.history[0].before.weeks?.map(({ id }) => id), ['week-2026-10-19']);
  assert.equal(recordChange(edited, edited.data, 'Geen wijziging'), edited);
  const restored = undoLast(edited, '2026-10-15T11:00:00.000Z');
  assert.deepEqual(restored.data, original);
  assert.equal(restored.history[0].undoneAt, '2026-10-15T11:00:00.000Z');
  assert.equal(canUndo(restored), false);
});

test('a full week can be published only with five distinct workers all day', () => {
  const employees = Array.from({ length: 5 }, (_, index) => person(`staff-${index}`));
  const shifts = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(monday); day.setDate(day.getDate() + offset);
    return employees.map((employee) => shift(day, employee.id, `${offset}-${employee.id}`));
  }).flat();
  const ready = schedule(monday, 'week', shifts);
  assert.deepEqual(publicationIssues(ready, employees), []);
  const reduced = { ...ready, shifts: shifts.filter((item) => item.id !== '2-staff-4') };
  assert.deepEqual(publicationIssues(reduced, employees).map(({ kind }) => kind), ['coverage']);
});

test('publication check reports open shifts and interns without supervision', () => {
  const intern = person('intern', 'intern');
  const draft = schedule(monday, 'week', [shift(monday, null, 'open'), shift(monday, intern.id, 'intern')]);
  const issues = publicationIssues(draft, [intern]);
  assert.ok(issues.some(({ kind, day }) => kind === 'open' && day === '2026-10-12'));
  assert.ok(issues.some(({ kind, day }) => kind === 'intern' && day === '2026-10-12'));
  assert.equal(issues.filter(({ kind }) => kind === 'coverage').length, 7);
});

test('a paid intern counts as the fifth worker and needs no supervisor', () => {
  const employees = [...Array.from({ length: 4 }, (_, index) => person(`staff-${index}`)), person('intern', 'intern')];
  const shifts = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(monday); day.setDate(day.getDate() + offset);
    return employees.map((employee) => ({ ...shift(day, employee.id, `${offset}-${employee.id}`), paidInternShift: employee.kind === 'intern' }));
  }).flat();
  assert.deepEqual(publicationIssues(schedule(monday, 'week', shifts), employees), []);
});
