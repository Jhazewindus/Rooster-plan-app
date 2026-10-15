import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyPlannerData, PlannerData, Schedule } from '../src/domain';
import { applyDownloads, baselineFromRemote, parseRemotePart, planSync, RemoteParts, weekPartId } from '../src/cloud/model';

const week = (date: string, id: string): Schedule => ({
  id, weekStart: `${date}T00:00:00.000Z`, status: 'draft', createdAt: '', updatedAt: '', shifts: [],
});
const employee = { id: 'ann', firstName: 'Ann', lastName: '', displayName: 'Ann', role: '', color: '#000000',
  weeklyContractMinutes: 2400, active: true, availability: {} };

test('a first sync can upload local data and download another week independently', () => {
  const local: PlannerData = { ...emptyPlannerData(), employees: [employee], schedules: [week('2026-10-12', 'local')] };
  const remote: RemoteParts = { 'week-2026-10-19': { revision: 1, payload: week('2026-10-19', 'remote') } };
  const plan = planSync(local, {}, remote);
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.uploads.map(({ id }) => id), ['employees', 'week-2026-10-12']);
  assert.deepEqual(plan.downloads.map(({ id }) => id), ['week-2026-10-19']);
  assert.deepEqual(applyDownloads(local, plan.downloads).schedules.map(({ id }) => id), ['local', 'remote']);
});

test('divergent edits to the same part are conflicts, never silent overwrites', () => {
  const original = [employee];
  const baseline = { employees: { revision: 1, payload: original } };
  const local = { ...emptyPlannerData(), employees: [{ ...employee, displayName: 'Anne' }] };
  const remote: RemoteParts = { employees: { revision: 2, payload: [{ ...employee, displayName: 'Anna' }] } };
  const result = planSync(local, baseline, remote);
  assert.deepEqual(result.conflicts, ['employees']);
  assert.deepEqual(result.uploads, []);
  assert.deepEqual(result.downloads, []);
});

test('a removed week becomes a versioned tombstone and can be downloaded as a deletion', () => {
  const old = week('2026-10-12', 'old');
  const baseline = { 'week-2026-10-12': { revision: 3, payload: old } };
  const removed = planSync(emptyPlannerData(), baseline, baseline);
  assert.deepEqual(removed.uploads, [{ id: 'week-2026-10-12', expectedRevision: 3, payload: null }]);
  const local = { ...emptyPlannerData(), schedules: [old] };
  const remote: RemoteParts = { 'week-2026-10-12': { revision: 4, payload: null } };
  const download = planSync(local, baseline, remote);
  assert.deepEqual(applyDownloads(local, download.downloads).schedules, []);
});

test('the baseline is a snapshot and remote weeks must match their document IDs', () => {
  const original = week('2026-10-12', 'one');
  const remote: RemoteParts = { 'week-2026-10-12': { revision: 1, payload: original } };
  const baseline = baselineFromRemote(remote);
  original.status = 'final';
  assert.equal((baseline['week-2026-10-12']?.payload as Schedule).status, 'draft');
  assert.equal(weekPartId(original), 'week-2026-10-12');
  assert.throws(() => parseRemotePart('week-2026-10-19', { schemaVersion: 1, revision: 1, payload: original }));
  assert.throws(() => parseRemotePart('week-2026-10-12', { schemaVersion: 1, revision: 0, payload: original }));
});
