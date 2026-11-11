import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holidayGreeting, holidayMoment } from '@chore-fridge/domain/holidays';

test('November is fall, and Veterans Day and Thanksgiving have their own marks', () => {
  assert.deepEqual(holidayMoment(new Date('2026-11-11T12:00:00')), { season: 'fall', holiday: 'veterans' });
  assert.deepEqual(holidayMoment(new Date('2026-11-26T12:00:00')), { season: 'fall', holiday: 'thanksgiving' });
  assert.deepEqual(holidayMoment(new Date('2026-11-10T12:00:00')), { season: 'fall', holiday: '' });
});

test('December is winter, snowy Christmas, and Christmas Day is distinct', () => {
  assert.deepEqual(holidayMoment(new Date('2026-12-24T12:00:00')), { season: 'winter', holiday: 'christmas' });
  assert.deepEqual(holidayMoment(new Date('2026-12-25T12:00:00')), { season: 'winter', holiday: 'christmas-day' });
  assert.deepEqual(holidayMoment(new Date('2026-01-15T12:00:00')), { season: 'winter', holiday: '' });
  assert.deepEqual(holidayMoment(new Date('2026-07-04T12:00:00')), { season: 'summer', holiday: 'independence' });
});

test('holiday greetings name the day and stay empty for a plain season', () => {
  assert.equal(holidayGreeting(new Date('2026-11-11T12:00:00')), 'Happy Veterans Day');
  assert.equal(holidayGreeting(new Date('2026-11-26T12:00:00')), 'Happy Thanksgiving');
  assert.equal(holidayGreeting(new Date('2026-12-25T12:00:00')), 'Merry Christmas');
  assert.equal(holidayGreeting(new Date('2026-11-10T12:00:00')), '');
});
