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
- [The RFID scan and reveal](#the-rfid-scan-and-reveal-jsscanjs-jsscan-scenejs-jsscan-timingjs)
- [The 3D hand](#the-3d-hand-jsscan-handjs-modelsscan-handglb)
- [Bit River transmission](#bit-river-transmission-bit-river)
- [The story: a film played by scrolling](#the-story-a-film-played-by-scrolling-jsstoryjs-jslandingjs)
- [The simulation: physics, protocol and reader](#the-simulation-physics-protocol-and-reader-jsrfid)
- [The lab: Power, Reply, Break it](#the-lab-power-reply-break-it-jslabjs)
- [Take it apart: scenes 6 to 17](#take-it-apart-scenes-6-to-17-jsdeepjs)
- [The checks](#the-checks-tests)

---

### Landing page layout and style (`index.html`, `styles.css`)
Owner: Mina Vian · 2026-11-20, updated 2026-11-21 · Issues #3, #5, #9

**What it does.** The first screen: on the left, the three everyday RFID objects (key fob, phone, contactless card) in 3D; on the right, the headline "Those are the things you use every day." and the line "and almost nobody knows how it works…". On phones the words sit on top and the objects below. Scrolling then plays the story (see its own entry).

**How it works.**
- `index.html` holds the words as real text (an `h1` and a `p`), an empty `#stage` for the 3D canvas, and loads `js/lockscreen.js`, `js/models.js` and `js/landing.js`.
- A tiny script in `<head>` adds `data-intro` to the page before anything is drawn, so the opening can start from a blank state without a flash. If the visitor prefers reduced motion, it is not added and the page simply appears finished.
- `styles.css` uses a two-column grid on wide screens and a stacked layout when the window is taller than wide or narrower than 760 px. The stage covers the whole page behind the words, so objects are never cut off by a column edge. A faint SVG noise texture over everything gives a printed-paper feel.
- Codex for Akris Luno · 2026-11-21 · Issue #16. The link below the headline brings the contactless card to the front and carries it into the scan. The carousel only captures arrow keys while focused and stops rendering when it leaves the viewport.
- Codex for the project team · 2026-11-21. The import maps on the landing page and the standalone Bit River page load the same bundled Three.js 0.170 files. `vendor/fonts/fonts.css` supplies Inter Tight and Antonio for the English text and phone clock. The original licenses are bundled alongside the assets. `index.html` detects `file://` and shows the setup link before the intro starts.
- Codex for the project team · 2026-11-21. If the browser cannot create a 3D context or loses it, `loadScene()` and the context-loss handler show the card image from Bit River in the landing stage. The scan also has a static preview and a button to continue.

**Why it is built this way.** The words are real HTML (not drawn in 3D) so they are sharp, selectable and readable by screen readers. No build step, so anyone can open the folder and serve it.

**How to check it.** Follow the server command in `README.md`. With internet access disabled, open the landing page and standalone Bit River through that server. Both should load their models and fonts. Open `index.html` from disk to check the setup note.

**Likely questions.**
- Q: Why does the page need a server? A: Browsers block loading model files straight from disk for security; any static host works.
- Q: Why does the intro wait for the fonts? A: The headline is measured for the animation. The page waits up to 3 seconds for the bundled font so the text keeps its shape as it moves.

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

### The RFID scan and reveal (`js/scan.js`, `js/scan-scene.js`, `js/scan-timing.js`)
Written by OpenAI Codex for Akris Luno · 2026-11-21 · Issue #16

**What it does.** The contactless card from the carousel slides into the scan. A short gesture suggests moving it toward the reader. The reader’s contactless symbol brightens as the card approaches. Moving it close enough, or focusing the card and pressing Enter, triggers the simulated scan. The shockwave sweeps the reader away and carries the card toward the center as “How It Works?” fades in behind it. Scroll or choose **Continue** to join the key and phone.

**How it works.**

- The carousel supplies the card’s screen position, size and rotation through `getPose()`. `borrowCard()` moves that same Three.js object from the landing scene to the scan scene. `drawHandoff()` starts with its rendered pose and blends it into the scan while the page scrolls.
- `scan.js` projects the card and reader into screen coordinates. `paintGuidance()` moves a gesture cue toward the reader and passes pointer position, attention and distance to `drawScan()`. The card tilts with the pointer and gently rocks while hovered. The reader light responds as the card approaches. The card follows a captured mouse or touch pointer and returns to rest if released too far away. The simulated read unlocks the film, Bit River and the deeper experiments. Reduced motion keeps the instruction and light feedback while removing the gesture and tilt.
- `drawScan()` follows the card from contact through the expanding wave to the centered reveal. The keyboard path places the hand around a point on the card so the grip moves with it. `SCAN_TIMING` aligns the chime, reader indicator, wave and heading fade.
- OpenAI Codex for the project team · 2026-11-21. The scan and the film share a sticky viewport. `setStoryProgress()` moves the landing stage into that viewport and gives `drawStory()` the card's next screen position, size and rotation. The card is already at that pose when it returns to the landing stage. Scrolling backwards reverses the handoff.
- If 3D setup fails, `scan.js` shows stills of the reader and card from Bit River. The **Scan card** button advances to the title and the chapters.

**Why it is built this way.** Visitors control the distance to the reader before the scan succeeds. Preserving one model lets each transition start at the previous scene’s pose. A scan button and the text explanation remain available if 3D fails to load. Reduced motion uses still poses for the landing flight, wave and scroll transitions.

**How to check it.** Serve the repo with `python -m http.server` and follow “Try an RFID scan.” Wait for the short visual cue. Bring the card near the reader and watch the light respond. Release the card out of range to see it return, then move it close enough to scan. Choose **Continue** at the title and watch the card join the key and phone. Scroll back to the title and replay with Enter on the focused card.

**Likely questions.**

- Q: Is a real reader involved? A: The browser plays a simulated successful read. The wave marks that moment. A real scan uses an electromagnetic field and the three devices can use different frequencies and protocols.
- Q: What if someone opens the scan directly? A: The scan loads the same card asset into its own scene because the visitor starts at the reader.

---

### The 3D hand (`js/scan-hand.js`, `models/scan-hand.glb`)
Integration by OpenAI Codex for Akris Luno · 2026-11-21 · Issue #16

**What it does.** A right hand reaches in and closes its fingers around the item.

**How it works.** `createScanHand()` loads the hand, converts it from meters to centimeters around the wrist, and adds a cuff. `grip()` bends three joints in each finger and rotates the thumb toward the fingers. Each pose starts from the same saved rest angles, so replay resets cleanly. [CC0 Innerscene hand based on MakeHuman](https://www.innerscene.com/tools/library/3d-parts/posable-anatomical-right-hand-f6098b4f)

**Why it is built this way.** The mesh bends continuously at the knuckles because each vertex is attached to nearby bones. The scan scene can pose it with a single value from zero to one.

**How to check it.** Focus the card and press Enter. Watch the fingers close before the wrist moves toward the reader.

**Likely questions.**

- Q: Does the hand track a camera feed? A: Its motion is scripted around a grip point on the card.

---

### Bit River transmission (`bit-river/`)
Written by OpenAI Codex for Akris Luno · 2026-11-21 · Issue #12. Embedded in the scan story for Issue #16.

**What it does.** Follow a passive card's simulated reply to the reader and inspect example packets. The reader's field supplies energy to the card. The chip varies the load on its antenna, and the reader detects those changes as a reply.

**How it works.**

- `bit-river.js` registers `<rfid-bit-river>`. The element's scroll position sets the chapter and camera view. The chapter buttons move along the same scroll track. The paper background stays the same throughout.
- `river.js` draws the reader's charging pulse and the card's copper reply. Drawing, packet positions, and drag checks use the same curve. `replyFront()` extends the reply as the visitor scrolls. `replySample()` illustrates the load modulation for byte `7B` of the simulated ID, least significant bit first. [NXP PN512 data sheet](https://www.nxp.com/docs/en/data-sheet/PN512.pdf)
- Packet buttons drift along the curve, fade as they wrap, and pause in place while they have visible keyboard focus. `fadeText()` eases changes to the chapter copy and packet readout. Lifting a packet shows a missing notice followed by a replacement confirmation. Reduced motion keeps the packet effects static.
- OpenAI Codex for the project team merged `feat/12-bit-river` at `1ca893a`. The mobile readout reserves space across chapters so the plot stays in place when packet text changes. The merged film leads to Bit River after the live lab as a close-up of the reply. Both the embedded and standalone views load bundled assets and fade from the card poster to the model after the first rendered frame.

**Why it is built this way.** The element contains its own styles and controls so the same component works after the film and at `/bit-river/`.

**How to check it.** Scroll past the live lab or choose **Bit River** in the chapter bar. Watch the reader's field form, then the copper reply travel back. Choose “Transmit,” then hover, tap, or use Tab to inspect a packet. Drag the packet away, use **Lift packet**, or press Delete while it has focus. Run `node --test bit-river/river.test.mjs` with Node 22.7 or newer to check the path, reveal, and sample bit timing.

**Likely questions.**

- Q: How does the card stay lined up with the signal? A: Bit River computes both positions from the same chapter progress and plot dimensions.
- Q: Does the demo read or replace a real packet? A: The values come from a local array, and packet replacement is an effect within the demo.

---

### The story: a film played by scrolling (`js/story.js`, `js/landing.js`)
Owner: Mina Vian · 2026-11-21, updated 2026-11-21 · Issues #9, #19

**What it does.** After the scan reveal, scrolling plays the first two minutes of `SCRIPT.md`. One plain sentence is on screen at a time, always top left, and a part is labelled while the sentence names it.
- **Intro:** The camera holds on the overlapping key, phone and card arrangement. The models then spread into a line.
- **Inside:** "They all use RFID." Then the objects turn to glass: "Inside each one: a coil and a chip." Each object gets `Coil` and `Chip` labels.
- **No battery:**
  - "The key has a battery." and "Pull it out.": the visitor drags the battery (or scrolling pulls it).
  - "The buttons stop working." and "The coil and chip don't need it."
  - The card comes back: "Your bank card has no battery at all." and "So what powers its chip?"
- **Power, Reply, Break it:** the lab (`js/lab.js`) runs these, and supplies the sentences that depend on what the visitor does.

The chapter bar links Intro, Inside, No battery, Power, Reply, Break it and Bit River. The chapter names fit on phones as well.

**How it works.**
- **Progress in screens.** OpenAI Codex for the project team merged the film after the scan on 2026-11-21. The start of the film track is the zero point for the chapter buttons and the 3D timeline. `landing.js` eases `scrollNow` toward that local scroll position so mouse wheel steps feel like smooth playback.
- **One timeline.** `story.js` holds the timing (`TIME`), and `timeline(s)` turns `s` into progress values for the 3D. The sentences that depend only on the scroll are a list of ranges (`SAY`, and `AFTER` for after the battery is out). `sentence()` picks the one for the moment. In the lab scenes, it takes the lab's sentence instead. `speak()` swaps the text and replays a short fade-in.
- **Labels** (`CALLOUTS`) each name the sentences that show them (`when`). They fade in and out with the sentence, and each sits outside its object, joined to its part by a thin line.
- **The battery handle** is a real button over the battery. Dragging it more than 22 mm (in the key's own size) frees the battery; Enter, Space or an arrow key does the same.
- **One design frame.** The whole film is laid out on a 1440 × 900 frame (390 × 844 on phones), scaled by one factor to fit the window and centred (`designFrame` in `landing.js`). It sets `--u` (one design pixel), `--fx` and `--fy` for the CSS, and every size and place in the film comes from them. So every screen of the same shape shows exactly the same picture, only bigger or smaller.

**Why it is built this way.** The visitors are ordinary people. One short sentence at a time, beside the thing it names, is quicker to read than a list. The brief rejects videos, so the visitor drives it: the first hands-on moment (pulling the battery) comes at about 0:20.

**How to check it.** Serve the folder, open it and scroll. With `?debug`, `__hero.state.scroll` shows the progress. Resize the window: the picture keeps its layout.

**Likely questions.**
- Q: Does a real key have a coin battery? A: Yes, for its buttons, which unlock the car by radio. The model has none, so the film adds one. The RFID part needs no battery, which is the point of the scene.
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

### The lab: Power, Reply, Break it (`js/lab.js`)
Owner: Mina Vian · 2026-11-21, updated 2026-11-21 · Issue #19

**What it does.** The reader and the key, live, in three scenes.
- **Power.** The visitor brings the key to the reader (scrolling also lowers it). Field lines rise from the reader's coil, copper sparks run round the key's coil, and a power bar fills toward its wake-up line. The sentences step forward one at a time:
  1. "Move the key to the reader."
  2. "The reader makes a magnetic field."
  3. "The field makes electricity in the coil."
  4. "Enough power wakes the chip."
  5. "The reader is the battery."
- **Reply.** "Now the chip replies." "It has no radio." "It takes more power, then less." With each change, the key's coil glows brighter or dimmer. A trace under the reader, labelled "What the reader feels", dips with each change. The ID display fills in `3F 9A 12 C7`, decoded from those dips: "That's the 'ID' in RFID."
- **Break it.** Three buttons (Turn it, Add metal, Use a card) and the drag. The sentence says what broke ("Too far. Not enough power.", "Turned. The field misses the coil.", "Metal pushes the field away.") and asks for the next way to break it. Then: "That's why you tap close and flat." After 4 idle seconds, a ghost hand lifts the key once.

**How it works.**
- **Every frame**, `update` calls `physics.solve` with the key's distance (plus about a millimetre of hand drift), angle and metal.
- **The power sentences** come from the physics: out of reach, field only, electricity, awake. They only move forward one step at a time, and each stays at least 1.5 s, so a fast scroll can't skip one.
- **The key's reply** is made one bit at a time, slowed to 70 ms per bit (really 512 µs). The reader decides each bit from those samples. When a whole message has passed, `reader.hearKey` checks it from the samples alone before the display turns green. At the "spell" moment the reader starts listening afresh, from the end of one message into the next one's header.
- **The card** replies only when asked: each time it wakes, a whole conversation runs through `channel` and `reader.activate`, and the trace plays the samples back.
- **What broke** (`reasonFor`) is the one change that would fix the read: metal first, then the turn, then the distance.
- **Timings people see** (how long a sentence stays, idle time) use real seconds. The simulation uses the frame clock.
- **Sizes** come from the design frame (`geo.u`), like the rest of the film.

**Why it is built this way.** The first hands-on part should teach by doing. Each sentence only appears when the thing it says is really happening in the simulation.

**How to check it.** Scroll to Power and drag the key. With `?debug`, `__lab.bits` shows the bits the reader decided, and `__lab.fastForward(70)` plays 70 bits at once.

**Likely questions.**
- Q: Is the ID really decoded? A: Yes. The display only shows what the reader read from the samples, and turns green only when the message passes its checks.
- Q: Why 2.5 cm when scrolling? A: Close enough to read, and close enough to the edge that metal or a turn breaks it, so every lesson is one click away.

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
