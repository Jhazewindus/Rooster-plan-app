import assert from 'node:assert/strict';
import test from 'node:test';
import { Absence, Employee, Schedule, Shift } from '../src/domain';
import { coverageGapCandidates, weeklyHoursOverview } from '../src/planner';

const day = new Date(2026, 9, 19);
const at = (hour: number, minute = 0) => { const value = new Date(day); value.setHours(hour, minute, 0, 0); return value.toISOString(); };
const person = (id: string, availability: Employee['availability'] = {}, kind: Employee['kind'] = 'regular'): Employee => ({
  id, firstName: id, lastName: '', displayName: id, role: 'Dierenverzorging', color: '#B76445',
  weeklyContractMinutes: 8 * 60, active: true, kind, availability,
});
const shift = (id: string, employeeId: string | null, start: number, end: number, paidInternShift = false): Shift => ({
  id, employeeId, originalEmployeeId: null, startAt: at(start), endAt: at(end), source: 'manual', notes: '', paidInternShift,
});
const roster = (shifts: Shift[]): Schedule => ({ id: 'week', weekStart: day.toISOString(), status: 'draft', createdAt: '', updatedAt: '', shifts });

test('weekly insight uses net hours, separates paid stage, and retains archived staff with past shifts', () => {
  const archived = { ...person('oud'), active: false };
  const intern = person('stagiair', {}, 'intern');
  const schedule = roster([shift('old', archived.id, 7, 15), shift('paid', intern.id, 17, 20, true), shift('open', null, 7, 19)]);
  const settings = { breaks: [
    { id: 'day', kind: 'day' as const, label: 'Lunch', weekdays: [1 as const], startMinute: 12 * 60, endMinute: 12 * 60 + 30 },
    { id: 'evening', kind: 'evening' as const, label: 'Avond', weekdays: [1 as const], startMinute: 18 * 60, endMinute: 18 * 60 + 15 },
  ] };
  const rows = weeklyHoursOverview(schedule, [archived, intern], settings);
  assert.deepEqual(rows.map((row) => [row.employee.id, row.plannedMinutes, row.paidInternMinutes]), [
    ['oud', 450, 0], ['stagiair', 165, 165],
  ]);
});

test('gap suggestions split around conflicts and absences, while excluding interns and expired workers', () => {
  const gap = { startAt: at(17), endAt: at(19), staffCount: 3 };
  const usual = person('vast', { 1: { startMinute: 7 * 60, endMinute: 19 * 60 + 30 } });
  const extra = person('extra', { 1: { startMinute: 7 * 60, endMinute: 16 * 60 } });
  const busy = person('bezet');
  const absent = person('ziek');
  const intern = person('stage', {}, 'intern');
  const periodic = { ...person('periode', {}, 'periodic'), period: { startDate: '2026-10-01', endDate: '2026-10-18' } };
  const schedule = roster([shift('busy', busy.id, 16, 18)]);
  const absences: Absence[] = [{ id: 'sick', employeeId: absent.id, type: 'sick', startAt: at(18), endAt: at(20), notes: '' }];
  const candidates = coverageGapCandidates(gap, schedule, [extra, busy, absent, intern, periodic, usual], absences);
  assert.deepEqual(candidates.filter((item) => item.coversWholeGap).map((item) => [item.employee.id, item.withinRegularHours]), [['vast', true], ['extra', false]]);
  const busyOption = candidates.find((item) => item.employee.id === busy.id);
  const absentOption = candidates.find((item) => item.employee.id === absent.id);
  assert.deepEqual([busyOption?.startAt, busyOption?.endAt], [at(18), at(19)]);
  assert.deepEqual([absentOption?.startAt, absentOption?.endAt], [at(17), at(18)]);
  assert.equal(candidates.some((item) => item.employee.id === intern.id || item.employee.id === periodic.id), false);
  assert.equal(candidates[0].projectedWeeklyMinutes, 120);
  assert.equal(candidates[0].exceedsContract, false);
});
