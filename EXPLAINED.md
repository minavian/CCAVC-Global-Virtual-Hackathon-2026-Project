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

- [Landing page layout and style](#landing-page-layout-and-style-indexhtml-stylescss)
- [Opening animation and carousel](#opening-animation-and-carousel-jslandingjs)
- [3D rendering pipeline](#3d-rendering-pipeline-jslandingjs-createscene)
- [The three 3D objects](#the-three-3d-objects-jsmodelsjs-models)
- [The phone's lock screen](#the-phones-lock-screen-jslockscreenjs)
- [The story: a film played by scrolling](#the-story-a-film-played-by-scrolling-jsstoryjs-jslandingjs)
- [The simulation: physics, protocol and reader](#the-simulation-physics-protocol-and-reader-jsrfid)
- [The lab: scenes 4 and 5](#the-lab-scenes-4-and-5-jslabjs)
- [Take it apart: scenes 6 to 17](#take-it-apart-scenes-6-to-17-jsdeepjs)
- [The checks](#the-checks-tests)

---

### Landing page layout and style (`index.html`, `styles.css`)
Owner: Mina Vian · 2026-11-20, updated 2026-11-21 · Issues #3, #5, #9

**What it does.** The first screen: on the left, the three everyday RFID objects (key fob, phone, contactless card) in 3D; on the right, the headline "Those are the things you use every day." and the line "and almost nobody knows how it works…". On phones the words sit on top and the objects below. Scrolling then plays the story (see its own entry).

**How it works.**
- `index.html` holds the words as real text (an `h1` and a `p`), an empty `#stage` for the 3D canvas, the story's words (`.story`) and an empty `.track` that only gives the page its scroll length. It loads four scripts: `js/lockscreen.js`, `js/models.js`, `js/story.js`, `js/landing.js`. Three.js 0.170 comes from the jsDelivr CDN through an import map; the fonts (Inter Tight, and Antonio for the phone's clock) come from Google Fonts.
- A tiny script in `<head>` adds `data-intro` to the page before anything is drawn, so the opening can start from a blank state without a flash. If the visitor prefers reduced motion, it is not added and the page simply appears finished.
- `styles.css` pins the hero and the 3D stage to the screen (`position: fixed`), like a video frame, and hides the scrollbar; the page underneath still scrolls normally. It uses a two-column grid on wide screens and a stacked layout when the window is taller than wide or narrower than 760 px. The stage covers the whole page behind the words, so objects are never cut off by a column edge. A faint SVG noise texture over everything gives a printed-paper feel.

**Why it is built this way.** The words are real HTML (not drawn in 3D) so they are sharp, selectable and readable by screen readers. No build step, so anyone can open the folder and serve it.

**How to check it.** Serve the folder (for example `python -m http.server`) and open it. The `.glb` models do not load from `file://`, so double-clicking `index.html` shows the words only.

**Likely questions.**
- Q: Why does the page need a server? A: Browsers block loading model files straight from disk for security; any static host works.
- Q: Why Google Fonts with `display=block`? A: The headline is measured for the animation; swapping fonts mid-animation would make it jump, so the page waits up to 3 seconds for the real font.

---

### Opening animation and carousel (`js/landing.js`)
Owner: Mina Vian · 2026-11-20 · Issues #3, #5

**What it does.** The opening: the headline appears full-screen with every word faint, each word pops to full strength one by one, the headline glides to its place, the three objects spin in and land on the key fob, and the subline fades in (about 8 seconds). Afterwards the visitor can drag, fling, tap or use the arrow keys to turn the objects; after 6 idle seconds the carousel drifts back to the key fob.

**How it works.**
- **One playhead.** `TIMELINE` at the top lists every timing. `applyIntro(t)` sets every element's style as a pure function of the time `t`, so any moment can be recreated exactly (add `?t=4.2` to the URL to freeze the opening at 4.2 s).
- **Word pops** use `pop()`, a damped spring (it overshoots about 3% and settles).
- **The glide** lays the headline out at its large size and scales it down to its final place (`placeHeadline`), so the text is never blurry. A hidden copy (`slot`) holds the final position so nothing reflows when it lands.
- **The carousel** is a small physics model: a position `phase` (0 = key fob in front, 1 = phone, 2 = card) and a `velocity`. Each object's screen position comes from its angle on a tilted circle (`computePoses`): the front object is large and sharp; the other two sit behind it, bottom-left and top-right.
- **Moves** use a Hermite curve (`travel`, `advanceFlight`) that starts at the current position *and speed*, so a new input never makes anything jump.
- **Interrupting the opening** (`finishIntro(true)`): any click, key, wheel or touch freezes every element where it is and blends it to its final state. The headline's blend starts at the speed it was already moving (its easing curve is computed from that speed), and the spinning carousel lands on the key fob from its current speed.
- **Dragging** follows the diagonal between the back objects; releasing with speed flings it on (`release`). The left and right arrow keys turn it (up and down are left for scrolling). Once the story starts playing, the carousel stops taking input.

**Why it is built this way.** A single playhead makes the opening easy to tune and to interrupt cleanly; a physics carousel feels natural and never snaps.

**How to check it.** Open the page and click at any point in the opening: nothing jumps. `?t=<seconds>` freezes the opening for screenshots. `?debug` exposes `window.__hero` with `state`, `skip()`, `bring(i)` and `bench(frames)`.

**Likely questions.**
- Q: What happens with "reduce motion" turned on? A: No opening; objects swap with a quick fade instead of orbiting (`calm`).
- Q: Why does the carousel return to the key fob? A: The fob is the object the story starts with.

---

### 3D rendering pipeline (`js/landing.js`, `createScene`)
Owner: Mina Vian · 2026-11-20 · Issues #3, #5

**What it does.** Draws the three objects with soft studio lighting; the ones behind are blurred, grey and faded like a camera's shallow focus, and a soft motion trail follows the fast spin.

**How it works.**
1. The objects are drawn with Three.js into an off-screen image with depth (`target`, 4× antialiasing, 2× on dense screens, high-precision colour). The camera is orthographic and measured in screen pixels, so a pose of "400 px tall" really is 400 px.
2. A full-screen shader (`composite`) then reads that image and its depth: pixels far back are blurred with 24 samples in three rings, turned grey and mixed toward the paper colour. It also does the colour conversion by hand (ACES tone mapping and sRGB, exposure 0.82). During the fast spin it blends in the previous frame for the trail.
3. Lighting: a soft "room" environment for reflections, a sky/ground light and two directional lights.
4. Each frame, every object's pose (position, size, depth and rotation) comes from `computePoses`; `draw` just applies it. The story uses three hooks: `open(i, e, push)` opens a model, `fit(i, rect, …)` works out where it must stand and how big it must be to fill a rectangle (optionally only some of its parts), and `points(i, names)` reports where named parts are on screen, for the labels.

**Performance work** (the phone used to lag):
- On the first screen the canvas covers only the area the objects can reach, not the whole page (during the story it covers the screen, because the objects travel across it).
- Resolution adapts (`tune`): it drops in steps while frames are slow and rises again when they are fast.
- All shaders compile and textures upload while the page loads (`warm`), so nothing stalls mid-animation.
- Empty paper is skipped in the shader with four quick samples.

**Why it is built this way.** The blur-and-grey look is what the sketches showed for the objects behind; doing it in one shader pass is far cheaper than blurring each object.

**How to check it.** With `?debug`, run `__hero.bench(60)` in the console: it prints milliseconds per frame, draw calls and triangles.

**Likely questions.**
- Q: Why not just use Three.js's built-in tone mapping? A: The image is processed after rendering (blur, grey, trail), so the conversion has to happen in that same final step.

---

### The three 3D objects (`js/models.js`, `models/`)
Models by nduchuy348-art (`models/*.glb`, branch `create-new-model`); loading code owner: Mina Vian · 2026-11-20, updated 2026-11-21 · Issues #5, #9

**What it does.** Loads the key fob, phone and contactless card, and gives each a small behaviour: the fob's lock button presses and its light glows; the phone turns around and its screen wakes; the card flips. Each model can also be opened up to show its insides.

**How it works.**
- `load()` loads each `.glb` file with `GLTFLoader`, centres it and measures its size so it can be scaled to a pixel size.
- **Sealed parts stay hidden** (`SEALED`): the models include internals for exploded views (the phone's battery and circuit board, the fob's chip and coil, the card's antenna). They can't be seen while the object is closed, so they are hidden, which halves the drawing work.
- **Opening** (`opener`, returned as `open(e, push)`): every model carries an animation called "Explode" that moves its parts apart. Instead of playing it, `open(e)` reads its keyframes at e (0 = closed, 1 = fully open), so scrolling forwards or backwards poses it exactly. The sealed parts appear as soon as it starts to open, except the fob's see-through resin potting (`STAY_HIDDEN`): it writes no depth, so the background blur would smear it into a grey square. `push` (0 to 1) then sends the outer shells further away (`PUSH`: the fob's front shell lifts up, its rear shell drops down), so the inside is left on its own.
- **Flicker fix** (`liftDecals`): flat printed layers (the card's artwork, its chip contacts) sit at exactly the same depth as the plastic underneath, which made the GPU flicker between them. Those flat sheets are nudged toward the camera in depth only.
- **Phone back** (`refineBack`, `deepenCover`): the faint brushed swirl and logo in the back's texture are strengthened (fine detail amplified, broad shading kept). The flash gets a drawn frosted lens with two LEDs (`flashFace`).
- **The H** (`redrawH`): the H on the camera island is replaced with an outline traced from a photo of the real phone (`H_PHOTO`). The island's printed layer shows its texture upside down, so the H is drawn flipped.
- **One call sets the whole look** (`looker`, returned as `look(state)`): how open it is, how much it is turned to glass, how much the coil and chip glow, whether the chip is lit (awake), the key's battery (in, being dragged, or out) and whether the key's buttons are lit. In glass, every part except the RFID parts (`RFID_PARTS`: each object's coil and chip) fades to 14% opacity but still writes depth, because the depth-of-field pass would otherwise blur it as if it were far away. Only what changed is touched, so calling it every frame costs nothing.
- **Added parts.** The fob gets a coin battery (`addCoinBattery`, 18 mm, with its + face drawn on a canvas), because a real key has one and scene 3 pulls it out. The phone gets a small NFC chip (`addNfcChip`) beside its antenna's feed, so the "Chip" label points at a real object. The lab adds a reader pad (`readerPad`: a metal puck with a three-turn copper coil under smoked glass, looking like no particular brand) and a half see-through metal plate (`metalPlate`).

**Why it is built this way.** The teammate's models are kept untouched on disk; every change happens when they load, so a newer model can be dropped in.

**How to check it.** Open the page, bring each object to the front with the arrow keys, and press Enter to trigger its action.

**Likely questions.**
- Q: Why read the animation's keyframes instead of playing it? A: The story is scrubbed by scrolling, backwards as well as forwards. Reading the keyframes at an exact point gives the same pose every time, at any speed.

---

### The phone's lock screen (`js/lockscreen.js`)
Owner: Mina Vian · 2026-11-20 · Issue #5

**What it does.** The phone has an always-on display (a dim clock on black). When it comes to the front it turns around and wakes into a lock screen: a blue-grey wallpaper, a tall live clock, the date, four widget tiles and two shortcut buttons, which arrive one after another.

**How it works.** Each element is its own flat layer on top of the phone's glass, with a picture painted once: the wallpaper, an "atlas" of icons, the clock (repainted once a minute) and the date (repainted once a day). The animation only changes each layer's opacity, position and size (`update`), so nothing is redrawn while it moves. Layers are stacked a hair apart and drawn in a fixed order so they never fight.

**Why it is built this way.** The first version redrew one large picture every frame and sent it to the graphics card, which took about 37 ms per frame and made the phone stutter. Layers bring that to the same cost as a still frame.

**How to check it.** Bring the phone to the front: it turns and wakes. The clock shows your real time.

**Likely questions.**
- Q: Is the lock screen copied from a real phone? A: It is drawn in code and modelled on a ColorOS lock screen; no personal details are shown.

---

### The story: a film played by scrolling (`js/story.js`, `js/landing.js`)
Owner: Mina Vian · 2026-11-21, updated 2026-11-21 · Issues #9, #19

**What it does.** After the first screen, scrolling plays the first two minutes of the script (`SCRIPT.md`) like a film:
1. **Look inside.** The three objects drop into a line under "This is RFID." They turn to glass, and inside each one a copper coil and a tiny chip glow, each labelled `Coil` and `Chip`.
2. **No battery.** The key comes forward and opens. Labels point out its buttons, its battery, its RFID coil and its RFID chip. The visitor drags the battery out (or scrolling pulls it out): "The buttons die. The coil and the chip don't care." Then the card comes back in glass: "Your bank card has no battery at all. So what powers its chip?"
3. **The reader.** The key closes, stays in glass, and the reader pad rises under it. From here the lab (`js/lab.js`) takes over.

A chapter bar at the bottom (Intro, RFID, Inside, No battery, The reader, Break it) works like a video's scrubber. On phones it shows the current chapter's name and a dot for each of the others.

**How it works.**
- **Progress in screens.** `landing.js` turns the scroll position into `scrollNow`, measured in screens (1 = one window height), and eases it toward the real scroll position, so a mouse wheel's steps feel like smooth playback.
- **One timeline.** `story.js` holds the timing (`TIME`) and `timeline(s)`, which turns `s` into progress values from 0 to 1 for each beat. Everything is a pure function of `s` except one thing the visitor does by hand: the battery. Pulling it out is remembered (and animated over 0.7 s) until the visitor scrolls back before the key opened.
- **The battery handle** is a real button over the battery (`.battery-handle`). Dragging it more than 22 mm (in the key's own size) frees the battery. Enter, Space or an arrow key does the same, so it works without a mouse.
- **The 3D poses** (`storyPoses` in `landing.js`): each object blends from its carousel pose to its place in the line, then the key to its featured pose. That pose is measured, not hard-coded: `fit` finds where the open key must stand to fill the right-hand area. In the lab, poses come from the lab's state: the key sits `distance` meters above the pad, with depth worked out from the camera's tilt, so the closer object always draws in front.
- **Looks.** Each frame, `storyPoses` also writes a look for each object (`looks`): glass, glow, chip light, battery and buttons. `render` hands them to `look()` in `models.js`.
- **The labels** follow their parts. Each frame, `points` reports where each part is on screen, for any of the objects (`"object:part"`, with `*` for the whole object and `coil` or `chip` for its RFID parts). Each label sits just outside its frame on the side given, and its line runs straight to it.

**Why it is built this way.** The page should feel like a film, but the brief rejects videos, so the visitor drives it: scrolling plays it, and the first hands-on moment (pulling the battery) comes at about 0:25. Keeping the timing in one pure function makes it easy to tune and impossible to get out of sync.

**How to check it.** Serve the folder, open it and scroll. With `?debug`, `__hero.state.scroll` shows the progress. Drag the dashed ring over the battery in the "No battery" chapter.

**Likely questions.**
- Q: Does a real key have a coin battery? A: Yes, for its buttons, which send a radio signal to unlock the car. The model has none, so the film adds one. The RFID part (coil and chip) needs no battery, which is the point of the scene.
- Q: What if someone doesn't scroll or drag? A: A "Scroll" cue sits under the first screen, and scrolling alone pulls the battery out and brings the key to the reader.

---

### The simulation: physics, protocol and reader (`js/rfid/`)
Owner: Mina Vian · 2026-11-21 · Issue #19

**What it does.** Everything the site shows reacting is computed here, from the visitor's inputs, in real units. Seven small files, each with one job:

| File | Job |
|---|---|
| `physics.js` | The coils: the field, the voltage at the chip, whether it wakes, and the size of its answer |
| `iso14443a.js` | The card standard both sides share: frames, check bits, CRC_A, and how bits become pauses and flickers |
| `lf.js` | The car key's 125 kHz message (the EM4100 format: a header, the ID, row and column check bits) |
| `tag.js` | The chips: the card's chip with the standard's states, and the key's chip |
| `air.js` | Turns pauses and switch patterns into the samples a reader measures, with noise |
| `reader.js` | The receiver: reads IDs from samples alone, and runs a whole conversation with a card |
| `channel.js` | Joins a reader to the cards in its field, and records every exchange for drawing |

**How it works.**
- **Physics** (`physics.js`, `solve`). The reader's coil and the tag's coil are treated as coaxial circular loops of the real parts' sizes (as circles of the same area). Their link is the mutual inductance from Maxwell's formula with elliptic integrals (`loopMutual`, `ellipticKE`), times the cosine of the angle between them. The voltage induced in the tag's coil is V = ω·M·I (Faraday's law). The tag is a tuned circuit: the coil (inductance from its size and turns, `coilInductance`) in series with the capacitor and the chip, solved with complex numbers. The chip is modelled as a resistor. Above its limit (3.3 V for the card) it soaks up the extra, which looks like a smaller resistor; `solve` finds that resistor by bisection.
- **Calibration** (runs once). The card's chip load is set so it wakes exactly where the pad's field falls to 1.5 A/m, the standard's minimum (ISO/IEC 14443-2); that puts the pad's range at 4.85 cm. The pad's current is set so its field at the centre is 7.5 A/m, the standard's maximum. The car's reader is set so the key wakes up to 4 cm away. The card's chip ends up drawing about 5 mW and the key's about 75 µW, both realistic.
- **The answer.** When the chip closes its switch, it changes the impedance the tag reflects into the reader's coil, (ωM)²/Z, and the reader's current changes by the fraction `dip`. That dip is the answer.
- **Metal** is a perfect conductor, handled with mirror images: a second reader coil behind the plate, mirrored, with the current reversed (cutting the field at the tag), and a mirror of the tag's own coil (lowering its inductance, so its tuning rises).
- **The card standard** (`iso14443a.js`). Reader to card: each bit is placed as a pause by modified Miller coding (`millerPauses`), and the card decodes the pauses back (`millerDecode`). Card to reader: Manchester coding on an 847.5 kHz subcarrier (`manchesterSwitch`): flicker in the first half of a bit is a 1, in the second half a 0. Every byte carries an odd parity bit; the longer messages carry CRC_A. The card waits the standard's delay before answering (`answerDelay`).
- **The chips** (`tag.js`). The card's chip only ever gets the bits it decoded from pauses in the field, and only answers by choosing bits for its switch. It follows the standard's states (IDLE, READY, ACTIVE, HALT): it answers "Anyone there?" with ATQA, its ID during anticollision (only if its ID starts with the bits the reader names), and SAK when selected. A card with random IDs makes up a new one, starting with 08, each time it powers up.
- **The reader** (`reader.js`) gets nothing but samples. `hearCard` measures the noise in the quiet stretch before a card may answer, then slides a 16-sample window along, correlating it with a sine and cosine at 847.5 kHz to measure the flicker. It finds the start of the answer, then reads each bit by comparing its two halves; flicker in both halves, about equally, is a clash between two cards. `activate` runs the whole conversation: REQA, then anticollision (narrowing down at each clash by choosing a side), then SELECT, with every check bit and check number tested. `hearKey` tries every alignment of the key's message until one passes all its checks.
- **The channel** (`channel.js`) is the only file that knows both sides. It renders each exchange, lets each powered card hear and answer, and adds each card's dip to the reader's samples. A card whose storage capacitor can't carry it through a pause resets instead of answering.

**Why it is built this way.** The brief says outputs must be computed from inputs, and the organisers' own example falls short because its receiver could peek at the sender's data. Here the reader is a separate file that only gets samples, and a test checks that it never refers to the tag, the channel or the physics. Every file works both as a plain browser script and in Node, so the same code runs on the site and in the tests.

**How to check it.** Run `node --test tests/` or open `tests/` in the browser. In the console, `RFID.physics.solve({ tag: 'card', distance: .03 })` returns the numbers for a card 3 cm from the pad.

**Likely questions.**
- Q: Why model the chip as a resistor? A: To the coil, a running chip is a load drawing power. A resistor is the simplest honest model of that. The limiter makes it a smaller resistor when there is extra power, as a real chip's shunt regulator does.
- Q: Is the car key's protocol real? A: The key speaks the EM4100 format, a real and common 125 kHz read-only format. Real car keys differ by maker and many add a secret handshake on top; the scene only needs the part they share: a battery-free chip answering through the field.
- Q: What is simplified? A: The coils are treated as circles of the same area; the reader holds its current steady; metal is a perfect conductor; noise is plain random noise. The tests check the parts that are exact: the standard's own CRC examples, the coding, and that 1.5 A/m wakes the card.

---

### The lab: scenes 4 and 5 (`js/lab.js`)
Owner: Mina Vian · 2026-11-21 · Issue #19

**What it does.** The reader and the tag, live. The visitor drags the key toward the reader (scrolling also brings it closer). As it comes close, the five steps on the left light up one by one, and each step only lights when it really happens in the simulation:
1. the field;
2. electricity in the key's coil;
3. the chip waking;
4. the chip answering;
5. the reader reading the ID.

The volts meter beside the key shows the chip's voltage against its wake-up line. The strip shows the reader's signal, and the reader's display fills in the ID, `3F 9A 12 C7`, digit by digit. In scene 5, controls appear: distance, angle, a metal plate and a key/card switch. When the read fails, one line says why: too far, turned, or metal.

**How it works.**
- **Every frame**, `update` calls `physics.solve` with the key's distance (plus about a millimetre of hand drift, so the edge flickers like a real one), angle and metal plate.
- **The key's answer** is made one bit at a time, slowed down to 85 ms per bit (really 512 µs). Each bit becomes 16 samples, dipped by the physics' `dip` and with the reader's noise added. The reader decides each bit from those samples. Digits appear as soon as their four bits are heard, and when a whole message has passed, `reader.hearKey` checks it from the samples alone before the display turns green.
- **The card** answers only when asked: each time it wakes, a whole conversation runs through `channel` and `reader.activate`, and the strip plays the recorded samples back over seven seconds.
- **Field lines** are traced through the field of the reader's coil (`physics.loopField`), plus its mirror image when there is metal. Lines that pass through the tag's coil are drawn in copper. They are only recomputed when the reader, the metal or the tag's height changes.
- **The reason line** names the one change that would fix the read: metal first, then the angle, then the distance (`reasonFor`).

**Why it is built this way.** The visitor's first real input changes real outputs, so the lesson comes from doing: closer, flat, and away from metal.

**How to check it.** Scroll to "The reader" and drag the key. With `?debug`, `__lab.bits` shows the bits the reader decided, and `__lab.fastForward(140)` plays 140 bits at once.

**Likely questions.**
- Q: Is the ID really decoded, or just shown? A: It is decoded. The display only shows what the reader read from the samples, and it only turns green when the message passes its row and column checks.
- Q: Why 2.5 cm when scrolling? A: Close enough to read, and close enough to the edge that a metal plate or a 70° turn breaks it, so every lesson is one click away.

---

### Take it apart: scenes 6 to 17 (`js/deep.js`)
Owner: Mina Vian · 2026-11-21 · Issue #19

**What it does.** Twelve scenes after the film, each one layer deeper into the same idea, each with one thing to try:
- **6** Distance and coil size against field and volts.
- **7** A still magnet makes nothing.
- **8** The tuning capacitor.
- **9** Metal: field lines with a plate.
- **10** Riding through the pauses: the chip's stored volts.
- **11** Load modulation at true size and zoomed.
- **12** The subcarrier, in a spectrum.
- **13** Manchester coding against a drifting clock.
- **14** Check bits and CRC with noise.
- **15** The whole conversation as a river and a chat.
- **16** Two cards at once.
- **17** Why a phone can't read a car key.

**How it works.**
- `plate(id, draw)` wires each scene: its canvas, inputs and readout. It redraws when an input changes, and only while it is on screen (an `IntersectionObserver`). Scenes 7 and 15 move, so they draw every frame while visible.
- Every number comes from `js/rfid`. Scene 6 sweeps `physics.solve` across distance. Scene 8 sweeps frequency (`physics.sweep`) and finds the range by bisection (`physics.range`). Scene 9 traces field lines with the metal's mirror coil. Scene 10 runs the REQA command's real pauses through the chip's storage capacitor (200 µA drawn, reset below 1.8 V). Scene 11 plots a real exchange's samples. Scene 12 takes a Fourier transform (`fft`, written here) of a card's answer with and without the flicker. Scene 13 decodes a letter with a reader whose clock runs fast or slow. Scenes 14 to 16 run `reader.activate` on real channels: with noise and the checks on or off; with a packet stolen on the air (its samples wiped, so the check fails and the phone asks again); with up to three cards. Scene 17 plots the tag's tuning curve against the reader's frequency.

**Why it is built this way.** The brief asks for one idea taken as far as possible. Each scene takes away or changes one part of the same mechanism, so the explanation comes from what the visitor sees break. That is what the organisers' example says a winning entry would do.

**How to check it.** Scroll past the film, then try each control. Every readout should change.

**Likely questions.**
- Q: Scene 8 says the card's range only shrinks, but the key starves. Why the difference? A: A bank card's chip draws about 5 mW, so even with tuning it uses most of what arrives. The key's chip draws about 75 µW and depends on tuning to build up enough voltage. Without the capacitor, its range falls from 4 cm to under 1 cm.
- Q: In scene 14, why doesn't a wrong ID get all the way through with the checks off? A: Because the card checks its own ID when the phone selects it, and refuses a wrong one. That second layer of checking is real.

---

### The checks (`tests/`)
Owner: Mina Vian · 2026-11-21 · Issue #19

**What it does.** 24 checks on the simulation, which run in Node (`node --test tests/`) and in the browser (open `tests/`), with the same list (`tests/cases.js`).

**How it works.** The checks fall into four groups:
- **The standard's own examples:** CRC_A of 50 00 is 57 CD; of E0 50, BC A5.
- **The coding:** 300 random commands survive the pauses; the key's message fails on any single flipped bit.
- **The reader:**
  - it never refers to the tag;
  - it reads 100 random IDs from samples alone;
  - in heavy noise it fails rather than trusting a wrong ID;
  - with its checks off, it accepts a wrong ID that the card then refuses;
  - with two cards, it picks the right one;
  - without a storage capacitor, the card never answers.
- **The physics:**
  - 1.5 A/m wakes the card;
  - 7.5 A/m at the pad's centre;
  - Faraday: a slow field makes no voltage;
  - the capacitor's effect;
  - the tuning peak;
  - metal;
  - the cosine of the angle;
  - Maxwell's formula against the small-loop formula far away.

**Why it is built this way.** No libraries and no build step: Node's own test runner, and a plain page for the browser. Judges can open the checks themselves.

**How to check it.** `node --test tests/`; or serve the folder and open `/tests/`. Every line should be green.
