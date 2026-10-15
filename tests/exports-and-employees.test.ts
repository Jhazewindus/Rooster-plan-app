import assert from 'node:assert/strict';
import test from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { Employee, PlannerData, Schedule, Shift } from '../src/domain';
import { createYearWorkbook } from '../src/exportWorkbook';
import { canWorkOnDate, coverageGapDescription, dailyCoverageGaps, generateWeek, removeEmployeeFromData } from '../src/planner';

const employee = (id: string, kind: Employee['kind'] = 'regular'): Employee => ({
  id, firstName: id, lastName: '', displayName: id, role: 'Dierenzorg & opvang', color: '#B76445',
  weeklyContractMinutes: 2400, active: true, kind,
  availability: { 1: { startMinute: 420, endMinute: 1020 } },
});
const shift = (id: string, employeeId: string | null, startAt: string, endAt: string): Shift => ({
  id, employeeId, originalEmployeeId: null, startAt, endAt, source: 'default', notes: 'Honden & katten',
});
const schedule = (id: string, shifts: Shift[]): Schedule => ({
  id, weekStart: '2026-12-28T00:00:00.000Z', status: 'final', createdAt: '', updatedAt: '', shifts,
});

test('periodic workers are limited to their dates but can supervise interns', () => {
  const periodic = { ...employee('Mila', 'periodic'), period: { startDate: '2026-12-01', endDate: '2026-12-31' } };
  assert.equal(canWorkOnDate(periodic, new Date(2026, 11, 1)), true);
  assert.equal(canWorkOnDate(periodic, new Date(2027, 0, 1)), false);
  assert.equal(canWorkOnDate({ ...periodic, period: undefined }, new Date(2026, 11, 10)), false);
  const intern = { ...employee('Jo', 'intern'), internship: { startDate: '2026-12-01', endDate: '2026-12-31' } };
  assert.deepEqual(new Set(generateWeek(new Date(2026, 11, 28), [periodic, intern]).shifts.map((item) => item.employeeId)), new Set(['Mila', 'Jo']));
  assert.equal(generateWeek(new Date(2027, 0, 4), [periodic, intern]).shifts.length, 0);
});

test('removing a worker archives their history but clears future absences and shifts', () => {
  const mila = employee('Mila');
  const jo = employee('Jo');
  const data: PlannerData = {
    employees: [mila, jo], settings: { breaks: [] },
    absences: [{ id: 'away', employeeId: mila.id, type: 'vacation', startAt: '2026-12-28T00:00:00.000Z', endAt: '2026-12-29T00:00:00.000Z', notes: '' }],
    schedules: [
      { ...schedule('past', [shift('old', mila.id, '2026-12-14T07:00:00.000Z', '2026-12-14T17:00:00.000Z')]), weekStart: '2026-12-14T00:00:00.000Z' },
      schedule('affected', [shift('m', mila.id, '2026-12-28T07:00:00.000Z', '2026-12-28T17:00:00.000Z')]),
    ],
  };
  const result = removeEmployeeFromData(data, mila.id, new Date(2026, 11, 21));
  assert.deepEqual(result.employees.filter((person) => person.active).map((person) => person.id), ['Jo']);
  assert.equal(result.employees.find((person) => person.id === mila.id)?.displayName, 'Mila');
  assert.equal(result.absences.length, 0);
  assert.strictEqual(result.schedules[0], data.schedules[0]);
  assert.equal(result.schedules[1].status, 'draft');
  assert.ok(result.schedules[1].shifts.every((item) => item.employeeId !== mila.id && item.originalEmployeeId !== mila.id));
});

test('daily coverage needs five distinct non-intern staff for the entire 07:00–19:30 interval', () => {
  const day = new Date(2026, 9, 12);
  const at = (hour: number, minute = 0) => new Date(2026, 9, 12, hour, minute).toISOString();
  const workers = Array.from({ length: 5 }, (_, index) => employee(`regular-${index}`));
  const full = workers.map((person) => shift(person.id, person.id, at(7), at(19, 30)));
  assert.deepEqual(dailyCoverageGaps(day, full, workers), []);
  const intern = employee('intern', 'intern');
  const short = [...full.slice(0, 4), shift('intern', intern.id, at(7), at(19, 30))];
  assert.deepEqual(dailyCoverageGaps(day, short, [...workers, intern]).map((gap) => [gap.staffCount, gap.startAt, gap.endAt]), [[4, at(7), at(19, 30)]]);
  const early = [...full.slice(0, 4), shift('early', workers[4].id, at(7), at(10))];
  assert.deepEqual(dailyCoverageGaps(day, early, workers).map((gap) => [gap.staffCount, gap.startAt, gap.endAt]), [[4, at(10), at(19, 30)]]);
  const duplicate = [...short, shift('duplicate', workers[0].id, at(7), at(19, 30))];
  assert.equal(dailyCoverageGaps(day, duplicate, [...workers, intern])[0].staffCount, 4);
  assert.deepEqual(dailyCoverageGaps(day, [...full.slice(0, 4), { ...short[4], paidInternShift: true }], [...workers, intern]), []);
});

test('an empty interval between staffed shifts shows no employees, not a misleading ratio', () => {
  const day = new Date(2026, 9, 12);
  const at = (hour: number, minute = 0) => new Date(2026, 9, 12, hour, minute).toISOString();
  const workers = Array.from({ length: 5 }, (_, index) => employee(`regular-${index}`));
  const shifts = workers.flatMap((person) => [
    shift(`${person.id}-morning`, person.id, at(7), at(12)),
    shift(`${person.id}-evening`, person.id, at(15), at(19, 30)),
  ]);
  const gaps = dailyCoverageGaps(day, shifts, workers);
  assert.deepEqual(gaps, [{ startAt: at(12), endAt: at(15), staffCount: 0 }]);
  assert.equal(coverageGapDescription(gaps[0]), '12:00–15:00: niemand ingepland, nog 5 nodig');
});

test('year export is a readable Excel ZIP with only that year and break-adjusted totals', () => {
  const mila = employee('Mila & Jo');
  const data: PlannerData = {
    employees: [mila], absences: [],
    settings: { breaks: [{ id: 'lunch', label: 'Lunch', kind: 'day', weekdays: [1], startMinute: 720, endMinute: 750 }] },
    schedules: [schedule('week', [
      shift('one', mila.id, '2026-12-28T07:00:00.000Z', '2026-12-28T17:00:00.000Z'),
      shift('two', null, '2026-12-29T07:00:00.000Z', '2026-12-29T12:00:00.000Z'),
      shift('next-year', mila.id, '2027-01-01T07:00:00.000Z', '2027-01-01T10:00:00.000Z'),
    ])],
  };
  const files = unzipSync(createYearWorkbook(data, 2026));
  const details = strFromU8(files['xl/worksheets/sheet2.xml']);
  const summary = strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.match(details, /2026-12-28/);
  assert.doesNotMatch(details, /2027-01-01/);
  assert.match(details, /Mila &amp; Jo/);
  assert.match(details, /<c r="G2" s="0"><v>30<\/v><\/c>/);
  assert.match(details, /<c r="H2" s="0"><v>9\.5<\/v><\/c>/);
  assert.match(details, /<c r="G3" s="0"><v>0<\/v><\/c>/);
  assert.match(summary, /<c r="D14" s="0"><v>9\.5<\/v><\/c>/);
});

test('year export marks paid intern work and totals those hours separately', () => {
  const intern = employee('Jo', 'intern');
  const paid = { ...shift('paid', intern.id, '2026-12-28T17:00:00.000Z', '2026-12-28T19:30:00.000Z'), paidInternShift: true };
  const files = unzipSync(createYearWorkbook({ employees: [intern], absences: [], schedules: [schedule('week', [paid])] }, 2026));
  const details = strFromU8(files['xl/worksheets/sheet2.xml']);
  const summary = strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.match(details, /Betaalde dienst/);
  assert.match(summary, /<c r="E14" s="0"><v>2\.5<\/v><\/c>/);
});
