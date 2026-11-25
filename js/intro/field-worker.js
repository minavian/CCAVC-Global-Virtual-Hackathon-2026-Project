// Works out the close-up's real field lines in the background (coil-field.js `solveJob`), so the
// page never stops while they are traced: with a metal plate behind the card they are traced again
// each time the card or the plate moves, about a tenth of a second each time. effects.js sends a
// job and gets the lines back; if this worker can't start, effects.js does the same work itself.
// Owner: Mina Vian. See EXPLAINED.md.
import { solveJob } from './coil-field.js';

addEventListener('message', ({ data: { id, job } }) => {
  const result = solveJob(job);
  postMessage({ id, result }, result.lines.flatMap(line => [line.points.buffer, line.power.buffer]));
});
