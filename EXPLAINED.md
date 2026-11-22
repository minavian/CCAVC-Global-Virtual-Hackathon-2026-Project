# How this project works, explained by whoever wrote it

In the interviews, **every team member must be able to explain any part of the project**, including the parts a teammate or an AI tool wrote. This file makes that possible. Every part of the code has an entry here, written by whoever built it, for a teammate who has never seen it.

## Rules

- **After you write or change code, add or update its entry here in the same pull request.** This applies to people and to AI agents. AI agents do it without being asked.
- Write for a teammate who has not read the code: plain English, short sentences, no unexplained jargon.
- One entry per part. If you change a part that already has an entry, update that entry rather than adding a new one.
- Say who wrote it (a person, or which AI tool and for whom) and when.
- If something is a simplification or a guess (a simulated value, a made-up threshold), say so.

## Template

```md
### <Part name> (`path/to/file`)
Written by <who> · <date> · Issue #<n>

**What it does.** One or two sentences a visitor would understand.

**How it works.** The mechanism, step by step. Name the key functions so people can find them.

**Why it is built this way.** The decisions and the alternatives that were rejected.

**How to check it.** What to open or run, and what you should see.

**Likely questions.**
- Q: … A: …
```

## Contents

- [RFID scroll story](#rfid-scroll-story-indexhtml-srcexperience)
- [Model assets and rendering](#model-assets-and-rendering-srcassetsmodels-srcreusablethree)
- [Animation and drawing](#animation-and-drawing-srcreusableanimations-srcreusableutilities)
- [RFID simulation and checks](#rfid-simulation-and-checks-srcreusablerfid-tests)

### RFID scroll story (`index.html`, `src/experience/`)

Written by OpenAI Codex for the project team · 2026-11-22

**What it does.** Follows one credit card from the opening gag to an X-ray view and a contactless tap. The visitor controls the story by scrolling and places the card on the reader at the end.

**How it works.**

- `timeline.js` maps scroll distance to a single playhead. The card starts at center, slides right, curls open, releases RFID, and closes before the acronym unfolds. Reading poses hold while the user scrolls through them. The transitions between those poses use shorter stretches of scroll.
- `main.js` moves the same four HTML letters out of the mouth, into the full-name layout, and back into the explanation heading. It also handles pointer capture, dropping the card, retrying, and reduced motion.
- `card-scene.js` loads `contactless-card.glb` once. The front two layers pivot around the right edge, and a vertex shader curls the left edge. The X-ray fades the original shell to reveal the original antenna and chip.
- `signals.js` draws the illustrative waveform and the reader's brass rings. The rings pulse as soon as the reader appears and brighten when the card approaches or is detected. Reduced motion shows the rings as a still image. The moving RFID letters and the “How it work” title use the local Bodoni Moda display font. The title uses regular weight throughout.
- The two `credit-card-*.webp` images are renders of the project's GLB by Codex. They keep the card and its internals visible when WebGL is unavailable.

**Why it is built this way.** A sticky stage preserves the position and identity of the objects while scrolling. Real HTML keeps the letters and copy sharp and readable by assistive technology. The static server continues to work without a build step.

**How to check it.** Serve the project using [README.md](README.md). Scroll from the centered card to watch it move right, curl, release RFID, and close its mouth before the letters unfold. Scroll back to rewind the opening. At the end, drag the card from the right onto the reader at left. The button also supports a tap, click, or keyboard activation.

**Likely questions.**

- Q: Does the reader use NFC hardware? A: Detection is a hit test against the illustrated reader.

### Model assets and rendering (`src/assets/models/`, `src/reusable/three/`)

Original models by the project team. Organized and decoupled from the pages by OpenAI Codex for the project team · 2026-11-22

**What it does.** Keeps the models, their materials and embedded data, and the code that loads and animates them available for the rebuild.

**How it works.** `models.js` exports `load` and `loadObject`. They center the key fob, phone, and subway card and expose named parts and their explode poses. `lockscreen.js` draws the phone display as a model texture. `scan-hand.js` exports `createScanHand`, which maps a grip amount to finger bones. `scan-scene.js` mounts a scan renderer in a supplied viewport. After `showObject(index)`, call `drawScan` to sample the scan by time. `card.js` draws the subway card on a supplied canvas. `depth-composite.js` renders a Three.js scene with depth blur and an optional trail. After sizing the renderer, call the pass's `resize` with the same CSS size, then `render`, and call `dispose` to release GPU resources.

**Why it is built this way.** The modules still work with the bundled Three.js and load assets relative to their own files. Each renderer can be imported when needed.

**How to check it.** Serve the project and request a model under `/src/assets/models/`. Use the import map in the README when calling the renderers from a browser.

**Likely questions.**

- Q: Where are the fonts and fallback illustrations? A: In `src/assets/fonts/` and `src/assets/images/`.

### Animation and drawing (`src/reusable/animations/`, `src/reusable/utilities/`)

Extracted by OpenAI Codex for the project team · 2026-11-22

**What it does.** Keeps the easing curves, standalone signal animation, and helpers for drawing and measuring signals.

**How it works.** `easing.js` provides cubic Bézier, spring, and Hermite motion functions. In `river.mjs`, `riverGeometry` computes points along the field. `drawField` and `drawTraffic` take a canvas context and time and draw the field and reply. The other modules provide an in-place FFT for power-of-two input lengths, unit formatting, and a canvas curve helper.

**Why it is built this way.** A caller can reuse the calculations and graphics while choosing its own layout, timing, and controls.

**How to check it.** Run `node --test tests/river.test.mjs`.

**Likely questions.**

- Q: Does the signal animation start on its own? A: The caller passes a time and progress value to draw each frame.

### RFID simulation and checks (`src/reusable/rfid/`, `tests/`)

Original simulation by the project team. Moved and checked by OpenAI Codex for the project team · 2026-11-22

**What it does.** Simulates the field, the tag's reply, and the reader that decodes it.

**How it works.** `physics.js` estimates coupling and power. `tag.js`, `lf.js`, and `iso14443a.js` model the tags and their messages. `air.js` computes a sampled signal and `reader.js` decodes it. `channel.js` orchestrates the simulated exchange. `field-lines.js` traces the magnetic field using the caller's loop field function.

**Why it is built this way.** The calculations run independently of the website. Hardware values have been simplified for the simulation.

**How to check it.** Run `node --test tests/rfid.test.js`. See [the RFID reference](docs/rfid-reference.md) for calibration notes and sources.

**Likely questions.**

- Q: Is the reader talking to real tags? A: The checks use simulated samples and need no hardware.
