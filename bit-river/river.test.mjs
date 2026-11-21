import assert from 'node:assert/strict';
import test from 'node:test';
import { replyFront, replySample, riverGeometry } from './river.js';

test('the reply builds from the tag to the reader over the reveal chapters', () => {
  assert.equal(replyFront(.22), 0);
  assert.ok(replyFront(.37) > 0);
  assert.ok(replyFront(.55) > replyFront(.37) && replyFront(.55) < 1);
  assert.equal(replyFront(.77), 1);
});

test('the example byte shows the subcarrier burst in the encoded half of each bit', () => {
  for (const [index, bit] of [1, 1, 0, 1, 1, 1, 1, 0].entries()) {
    assert.equal(Math.round(replySample(index + .03125)), bit);
    assert.equal(Math.round(replySample(index + .53125)), 1 - bit);
  }
});

test('the card, reader and draggable packets share the river at every zoom', () => {
  for (const [w, h, compact] of [[1440, 700, false], [390, 320, true], [320, 160, true]]) {
    for (const zoom of [0, .5, 1]) {
      const river = riverGeometry(w, h, zoom, compact);
      assert.deepEqual(river.point(0), river.tag);
      assert.ok(Math.abs(river.point(1).x - river.reader.x) < .001);
      assert.ok(Math.abs(river.point(1).y - river.reader.y) < .001);
      for (let step = 1; step < 100; step++) {
        for (const lane of [-.88, 0, .88]) {
          const { x, y } = river.point(step / 100, lane);
          assert.ok(river.contains(x, y), 'a packet in its lane can be dropped back safely');
          assert.ok(!river.contains(x, -h), 'dragging clear of the stream triggers the Easter egg');
        }
      }
      assert.ok(!river.contains(river.tag.x + 1, river.tag.y));
    }
  }
});
