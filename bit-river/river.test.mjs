import assert from 'node:assert/strict';
import test from 'node:test';
import { linkAt, replyFront, riverPoint } from './river.js';
import { subcarrierSample } from './waveform.js';

const field = {
  tag: { x: 2, y: 1, z: 0 },
  reader: { x: -2, y: -1, z: .5 },
  front: .9, time: 1, width: 1, bend: 1,
  ripple: { time: -10, at: 0, strength: 0 }
};
const sample = (t, lane, state = field, depth = 0) =>
  riverPoint(t, lane, { set: (x, y, z) => ({ x, y, z }) }, state, depth);

test('scroll reveals a reversible front from the tag toward the reader', () => {
  assert.equal(replyFront(.135), 0);
  assert.ok(replyFront(.30) > 0);
  assert.ok(replyFront(.57) > replyFront(.30) && replyFront(.57) < 1);
  assert.equal(replyFront(.86), 1);
  const forward = Array.from({ length: 101 }, (_, i) => replyFront(i / 100));
  assert.ok(forward.every((position, i) => !i || position >= forward[i - 1]));
  assert.deepEqual(Array.from({ length: 101 }, (_, i) => replyFront((100 - i) / 100)), forward.reverse());
});

test('all strands stay attached to the card and reader while their middle gains depth', () => {
  for (const lane of [-1, 0, 1]) {
    assert.deepEqual(sample(0, lane), field.tag);
    assert.deepEqual(sample(1, lane), field.reader);
  }
  assert.deepEqual(sample(.5, 1, { ...field, front: .5 }), sample(.5, -1, { ...field, front: .5 }));
  assert.notEqual(sample(.5, 0, field, -1).z, sample(.5, 0, field, 1).z);
});

test('a capsule disturbance deforms the stream locally and fades out', () => {
  const ripple = { time: .8, at: .53, strength: .9 };
  assert.notEqual(sample(.58, 0, { ...field, ripple }).y, sample(.58, 0).y);
  assert.deepEqual(sample(.58, 0, { ...field, time: 3, ripple }), sample(.58, 0, { ...field, time: 3 }));
  assert.deepEqual(sample(1, 0, { ...field, ripple }), field.reader);
});

test('gap and alignment affect coupling while interference affects readability', () => {
  const aligned = linkAt(1, 0);
  assert.ok(aligned.strength > linkAt(0, 0).strength);
  assert.equal(aligned.readable, true);
  for (const mode of [1, 2]) {
    assert.ok(linkAt(1, mode).strength < aligned.strength);
    assert.equal(linkAt(1, mode).readable, false);
  }
  assert.equal(linkAt(1, 3).strength, aligned.strength);
  assert.equal(linkAt(1, 3).readable, false);
});

test('the Type A reply gates the subcarrier in the appropriate half-bit', () => {
  const bits = [0, 1, 0, 0, 0, 1, 0, 1];
  for (const [index, bit] of bits.entries()) {
    assert.equal(Math.round(subcarrierSample(index + .03125)), bit);
    assert.equal(Math.round(subcarrierSample(index + .53125)), 1 - bit);
  }
});
