import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COUNTER_ORIGIN, evaluateTimeline, TOTAL_DURATION } from '../js/taps/timeline.js';

test('payment stays confirmed while the station card crosses the counter before the turn', () => {
  const before = evaluateTimeline(2.2);
  const pickup = evaluateTimeline(4.1);
  assert.ok(before.terminal.success > 0.9);
  assert.equal(before.stationCard.visible, true);
  assert.equal(pickup.terminal.success, 1);
  const sliding = evaluateTimeline(3.3).stationCard;
  assert.equal(before.stationCard.pos.z, evaluateTimeline(0.5).stationCard.pos.z);
  assert.ok(sliding.pos.z > before.stationCard.pos.z);
  assert.ok(pickup.stationCard.pos.z > sliding.pos.z);
  for (const card of [before.stationCard, sliding, pickup.stationCard]) {
    assert.ok(Math.abs(card.pos.y - COUNTER_ORIGIN.y) < 0.004);
    assert.deepEqual(card.quat, sliding.quat);
    assert.ok(card.pos.z < COUNTER_ORIGIN.z + 0.38);
  }
  assert.ok(evaluateTimeline(4.7).stationCard.pos.y > pickup.stationCard.pos.y);
  assert.ok(evaluateTimeline(5).camera.target.x < pickup.camera.target.x);
  assert.ok(evaluateTimeline(9.5).camera.pos.z < evaluateTimeline(8.2).camera.pos.z);
});

test('the fare gate signals entry only after the glass leaves clear the aisle', () => {
  const locked = evaluateTimeline(6.45).gate;
  assert.equal(locked.barrierOpen, 0);
  assert.equal(locked.passageClear, false);

  const opening = evaluateTimeline(7.55).gate;
  assert.equal(opening.authorized, 1);
  assert.ok(opening.barrierOpen > 0 && opening.barrierOpen < 1);
  assert.equal(opening.passageClear, false);

  const open = evaluateTimeline(8.2).gate;
  assert.equal(open.barrierOpen, 1);
  assert.equal(open.passageClear, true);
});

test('the waiting train closes its doors, accelerates right, and rolls through the descent', () => {
  const waiting = evaluateTimeline(9.8).train;
  assert.equal(waiting.visible, true);
  assert.equal(waiting.doorOpen, 1);
  const closing = evaluateTimeline(10.5).train;
  assert.ok(closing.doorOpen > 0 && closing.doorOpen < 1);
  assert.equal(closing.xOffset, waiting.xOffset);
  const departing = evaluateTimeline(11).train;
  assert.equal(departing.doorOpen, 0);
  assert.equal(departing.xOffset, waiting.xOffset);
  const at12 = evaluateTimeline(12).train;
  const at13 = evaluateTimeline(13).train;
  assert.ok(at13.xOffset - at12.xOffset > at12.xOffset - departing.xOffset);
  const descent = evaluateTimeline(15).train;
  assert.equal(descent.visible, true);
  assert.ok(descent.xOffset > at13.xOffset);
  assert.ok(Math.abs(descent.wheelAngle + descent.xOffset / 0.42) < 1e-9);
});

test('the remote activates before the car confirms unlock and opens its door', () => {
  assert.equal(TOTAL_DURATION, 22);
  assert.equal(evaluateTimeline(17).vehicle.doorOpen, 0);
  assert.ok(evaluateTimeline(17.95).fob.press > 0.8);
  assert.equal(evaluateTimeline(17.95).vehicle.lightFlash, 0);
  assert.ok(evaluateTimeline(18.5).vehicle.lightFlash > 0.8);
  assert.equal(evaluateTimeline(19.4).vehicle.doorOpen, 0);
  assert.equal(evaluateTimeline(TOTAL_DURATION).vehicle.doorOpen, 1);
});
