import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COUNTER_ORIGIN, evaluateTimeline, TOTAL_DURATION } from '../js/taps/timeline.js';

test('payment stays confirmed while the station card crosses the counter before the turn', () => {
  const before = evaluateTimeline(1.15);
  const pickup = evaluateTimeline(2.06);
  assert.ok(before.terminal.success > 0.9);
  assert.equal(before.stationCard.visible, true);
  assert.equal(pickup.terminal.success, 1);
  const sliding = evaluateTimeline(1.60).stationCard;
  assert.equal(before.stationCard.pos.z, evaluateTimeline(0.30).stationCard.pos.z);
  assert.ok(sliding.pos.z > before.stationCard.pos.z);
  assert.ok(pickup.stationCard.pos.z > sliding.pos.z);
  for (const card of [before.stationCard, sliding, pickup.stationCard]) {
    assert.ok(Math.abs(card.pos.y - COUNTER_ORIGIN.y) < 0.004);
    assert.deepEqual(card.quat, sliding.quat);
    assert.ok(card.pos.z < COUNTER_ORIGIN.z + 0.38);
  }
  assert.ok(evaluateTimeline(2.45).stationCard.pos.y > pickup.stationCard.pos.y);
  assert.ok(evaluateTimeline(2.70).camera.target.x < pickup.camera.target.x);
  assert.ok(evaluateTimeline(5.20).camera.pos.z < evaluateTimeline(4.46).camera.pos.z);
});

test('the fare gate signals entry only after the glass leaves clear the aisle', () => {
  const locked = evaluateTimeline(3.45).gate;
  assert.equal(locked.barrierOpen, 0);
  assert.equal(locked.passageClear, false);

  const opening = evaluateTimeline(4.04).gate;
  assert.equal(opening.authorized, 1);
  assert.ok(opening.barrierOpen > 0 && opening.barrierOpen < 1);
  assert.equal(opening.passageClear, false);

  const open = evaluateTimeline(4.46).gate;
  assert.equal(open.barrierOpen, 1);
  assert.equal(open.passageClear, true);
});

test('the waiting train closes its doors, accelerates right, and rolls through the descent', () => {
  const waiting = evaluateTimeline(5.42).train;
  assert.equal(waiting.visible, true);
  assert.equal(waiting.doorOpen, 1);
  const closing = evaluateTimeline(5.82).train;
  assert.ok(closing.doorOpen > 0 && closing.doorOpen < 1);
  assert.equal(closing.xOffset, waiting.xOffset);
  const departing = evaluateTimeline(6.20).train;
  assert.equal(departing.doorOpen, 0);
  assert.equal(departing.xOffset, waiting.xOffset);
  const early = evaluateTimeline(6.70).train;
  const later = evaluateTimeline(7.20).train;
  assert.ok(later.xOffset - early.xOffset > early.xOffset - departing.xOffset);
  const descent = evaluateTimeline(8.35).train;
  assert.equal(descent.visible, true);
  assert.ok(descent.xOffset > later.xOffset);
  assert.ok(Math.abs(descent.wheelAngle + descent.xOffset / 0.42) < 1e-9);
});

test('the remote activates before the car confirms unlock and opens its door', () => {
  assert.equal(TOTAL_DURATION, 12);
  assert.equal(evaluateTimeline(9.30).vehicle.doorOpen, 0);
  assert.ok(evaluateTimeline(9.70).fob.press > 0.8);
  assert.equal(evaluateTimeline(9.70).vehicle.lightFlash, 0);
  assert.ok(evaluateTimeline(10.01).vehicle.lightFlash > 0.8);
  assert.equal(evaluateTimeline(10.48).vehicle.doorOpen, 0);
  assert.equal(evaluateTimeline(TOTAL_DURATION).vehicle.doorOpen, 1);
});
