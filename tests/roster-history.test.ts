import assert from 'node:assert/strict';
import test from 'node:test';
import { Employee, PlannerData, Schedule, Shift } from '../src/domain';
import { historicalRosterDay, moveCalendarMonths } from '../src/rosterHistory';

const at = (day: number, hour: number) => new Date(2023, 9, day, hour).toISOString();
const shift = (id: string, employeeId: string | null, day: number, from: number, until: number): Shift => ({
  id, employeeId, originalEmployeeId: null, startAt: at(day, from), endAt: at(day, until), source: 'default', notes: '',
});

test('past-day lookup includes archived staff, counts people once and keeps other dates out', () => {
  const archived: Employee = {
    id: 'old', firstName: 'Mila', lastName: '', displayName: 'Mila', role: 'Dierenverzorging', color: '#B76445',
    weeklyContractMinutes: 2400, active: false, availability: {},
  };
  const roster: Schedule = {
    id: 'week', weekStart: at(9, 0), status: 'published', createdAt: '', updatedAt: '',
    shifts: [shift('later', 'old', 11, 7, 12), shift('second', 'old', 10, 15, 19), shift('first', 'old', 10, 7, 12), shift('open', null, 10, 12, 15)],
  };
  const data: PlannerData = { employees: [archived], absences: [], schedules: [roster] };
  const result = historicalRosterDay(data, new Date(2023, 9, 10));
  assert.equal(result.schedule?.id, 'week');
  assert.deepEqual(result.entries.map(({ shift: item }) => item.id), ['first', 'open', 'second']);
  assert.equal(result.entries[0].employee?.displayName, 'Mila');
  assert.equal(result.employeeCount, 1);
  assert.equal(result.openCount, 1);
  assert.equal(historicalRosterDay(data, new Date(2022, 9, 10)).schedule, undefined);
});

test('month and year jumps clamp the date in shorter months', () => {
  assert.equal(moveCalendarMonths(new Date(2024, 0, 31), 1).getDate(), 29);
  assert.equal(moveCalendarMonths(new Date(2026, 9, 15), -36).getFullYear(), 2023);
  assert.equal(moveCalendarMonths(new Date(2026, 2, 31), -1).getDate(), 28);
});
