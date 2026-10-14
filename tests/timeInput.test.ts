import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTimeInput, parseTimeInput } from '../src/timeInput';

test('hour-only entries become a full time', () => {
  assert.equal(normalizeTimeInput('07'), '07:00');
  assert.equal(normalizeTimeInput('7'), '07:00');
  assert.equal(normalizeTimeInput('17'), '17:00');
  assert.equal(parseTimeInput('07'), 7 * 60);
});

test('minute entries keep the intended hour and minute', () => {
  assert.equal(normalizeTimeInput('0730'), '07:30');
  assert.equal(normalizeTimeInput('7:5'), '07:05');
  assert.equal(normalizeTimeInput(' 7:30 '), '07:30');
  assert.equal(parseTimeInput('0730'), 7 * 60 + 30);
});

test('invalid times are rejected rather than changed into another time', () => {
  for (const input of ['', '24', '07:60', '2460', '7:abc']) {
    assert.equal(parseTimeInput(input), null);
  }
});
