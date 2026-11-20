import assert from 'node:assert/strict';
import test from 'node:test';
import { riverGeometry } from './river.js';

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
