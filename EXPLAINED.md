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
- [The RFID scan and cutaway](#the-rfid-scan-and-cutaway-jsscanjs-jsscan-scenejs-jsscan-timingjs)
- [The 3D hand](#the-3d-hand-jsscan-handjs-modelsscan-handglb)
- [Bit River transmission](#bit-river-transmission-bit-river)

---

### Landing page layout and style (`index.html`, `styles.css`)
Written by Claude (Claude Code) for Mina Vian · 2026-11-20 · Issues #3, #5

**What it does.** One screen: on the left, the three everyday RFID objects (key fob, phone, contactless card) in 3D; on the right, the headline "Those are the things you use every day." and the line "and almost nobody knows how it works…". On phones the words sit on top and the objects below.

**How it works.**
- `index.html` holds the words as real text (an `h1` and a `p`), an empty `#stage` for the 3D canvas, and loads `js/lockscreen.js`, `js/models.js` and `js/landing.js`.
- A tiny script in `<head>` adds `data-intro` to the page before anything is drawn, so the opening can start from a blank state without a flash. If the visitor prefers reduced motion, it is not added and the page simply appears finished.
- `styles.css` uses a two-column grid on wide screens and a stacked layout when the window is taller than wide or narrower than 760 px. The stage covers the whole page behind the words, so objects are never cut off by a column edge. A faint SVG noise texture over everything gives a printed-paper feel.
- Codex for Akris Luno · 2026-11-21 · Issue #16. The link below the headline brings the contactless card to the front and carries it into the scan. The carousel only captures arrow keys while focused and stops rendering when it leaves the viewport.
- Codex for the project team · 2026-11-21. The import maps on the landing page and the standalone Bit River page load the same bundled Three.js 0.170 files. `vendor/fonts/fonts.css` supplies Inter Tight and Antonio for the English text and phone clock. The original licenses are bundled alongside the assets. `index.html` detects `file://` and shows the setup link before the intro starts.

**Why it is built this way.** The words are real HTML (not drawn in 3D) so they are sharp, selectable and readable by screen readers. No build step, so anyone can open the folder and serve it.

**How to check it.** Follow the server command in `README.md`. With internet access disabled, open the landing page and standalone Bit River through that server. Both should load their models and fonts. Open `index.html` from disk to check the setup note.

**Likely questions.**
- Q: Why does the page need a server? A: Browsers block loading model files straight from disk for security; any static host works.
- Q: Why does the intro wait for the fonts? A: The headline is measured for the animation. The page waits up to 3 seconds for the bundled font so the text keeps its shape as it moves.

---

### Opening animation and carousel (`js/landing.js`)
Written by Claude (Claude Code) for Mina Vian · 2026-11-20 · Issues #3, #5

**What it does.** The opening: the headline appears full-screen with every word faint, each word pops to full strength one by one, the headline glides to its place, the three objects spin in and land on the key fob, and the subline fades in (about 8 seconds). Afterwards the visitor can drag, fling, tap or use the arrow keys to turn the objects; after 6 idle seconds the carousel drifts back to the key fob.

**How it works.**
- **One playhead.** `TIMELINE` at the top lists every timing. `applyIntro(t)` sets every element's style as a pure function of the time `t`, so any moment can be recreated exactly (add `?t=4.2` to the URL to freeze the opening at 4.2 s).
- **Word pops** use `pop()`, a damped spring (it overshoots about 3% and settles).
- **The glide** lays the headline out at its large size and scales it down to its final place (`placeHeadline`), so the text is never blurry. A hidden copy (`slot`) holds the final position so nothing reflows when it lands.
- **The carousel** is a small physics model: a position `phase` (0 = key fob in front, 1 = phone, 2 = card) and a `velocity`. Each object's screen position comes from its angle on a tilted circle (`computePoses`): the front object is large and sharp; the other two sit behind it, bottom-left and top-right.
- **Moves** use a Hermite curve (`travel`, `advanceFlight`) that starts at the current position *and speed*, so a new input never makes anything jump.
- **Interrupting the opening** (`finishIntro(true)`): any click, key, wheel or touch freezes every element where it is and blends it to its final state. The headline's blend starts at the speed it was already moving (its easing curve is computed from that speed), and the spinning carousel lands on the key fob from its current speed.
- **Dragging** follows the diagonal between the back objects; releasing with speed flings it on (`release`).

**Why it is built this way.** A single playhead makes the opening easy to tune and to interrupt cleanly; a physics carousel feels natural and never snaps.

**How to check it.** Open the page and click at any point in the opening: nothing jumps. `?t=<seconds>` freezes the opening for screenshots. `?debug` exposes `window.__hero` with `state`, `skip()`, `bring(i)` and `bench(frames)`.

**Likely questions.**
- Q: What happens with "reduce motion" turned on? A: No opening; objects swap with a quick fade instead of orbiting (`calm`).
- Q: Why does the carousel return to the key fob? A: The fob is the object the story starts with.

---

### 3D rendering pipeline (`js/landing.js`, `createScene`)
Written by Claude (Claude Code) for Mina Vian · 2026-11-20 · Issues #3, #5

**What it does.** Draws the three objects with soft studio lighting; the ones behind are blurred, grey and faded like a camera's shallow focus, and a soft motion trail follows the fast spin.

**How it works.**
1. The objects are drawn with Three.js into an off-screen image with depth (`target`, 4× antialiasing, 2× on dense screens, high-precision colour). The camera is orthographic and measured in screen pixels, so a pose of "400 px tall" really is 400 px.
2. A full-screen shader (`composite`) then reads that image and its depth: pixels far back are blurred with 24 samples in three rings, turned grey and mixed toward the paper colour. It also does the colour conversion by hand (ACES tone mapping and sRGB, exposure 0.82). During the fast spin it blends in the previous frame for the trail.
3. Lighting: a soft "room" environment for reflections, a sky/ground light and two directional lights.

**Performance work** (the phone used to lag):
- The canvas covers only the area the objects can reach, not the whole page.
- Resolution adapts (`tune`): it drops in steps while frames are slow and rises again when they are fast.
- All shaders compile and textures upload while the page loads (`warm`), so nothing stalls mid-animation.
- Empty paper is skipped in the shader with four quick samples.

**Why it is built this way.** The blur-and-grey look is what the sketches showed for the objects behind; doing it in one shader pass is far cheaper than blurring each object.

**How to check it.** With `?debug`, run `__hero.bench(60)` in the console: it prints milliseconds per frame, draw calls and triangles.

**Likely questions.**
- Q: Why not just use Three.js's built-in tone mapping? A: The image is processed after rendering (blur, grey, trail), so the conversion has to happen in that same final step.

---

### The three 3D objects (`js/models.js`, `models/`)
Models by nduchuy348-art (`models/*.glb`, branch `create-new-model`); loading code by Claude (Claude Code) for Mina Vian · 2026-11-20 · Issue #5

**What it does.** Loads the key fob, phone and contactless card, and gives each a small behaviour: the fob's lock button presses and its light glows; the phone turns around and its screen wakes; the card flips.

**How it works.**
- `load()` loads each `.glb` file with `GLTFLoader`, centres it and measures its size so it can be scaled to a pixel size.
- **Sealed parts** (`SEALED`): the loader removes internal parts from the fob and phone for the carousel. It keeps the card’s coil and chip hidden inside the card until the cutaway.
- **Flicker fix** (`liftDecals`): flat printed layers (the card's artwork, its chip contacts) sit at exactly the same depth as the plastic underneath, which made the GPU flicker between them. Those flat sheets are nudged toward the camera in depth only.
- **Phone back** (`refineBack`, `deepenCover`): the faint brushed swirl and logo in the back's texture are strengthened (fine detail amplified, broad shading kept). The flash gets a drawn frosted lens with two LEDs (`flashFace`).
- **The H** (`redrawH`): the H on the camera island is replaced with an outline traced from a photo of the real phone (`H_PHOTO`). The island's printed layer shows its texture upside down, so the H is drawn flipped.
- Codex for Akris Luno · 2026-11-21 · Issue #16. The carousel lends the card to the scan scene with its `open(progress)` method intact. That method scrubs the existing `Explode` clip using the keyframe interpolation approach from `feat/9-fob-story`. At zero it restores the original closed transforms. `loadObject()` supplies the camera-ready card for direct visits to the scan.

**Why it is built this way.** The teammate's models are kept untouched on disk; every change happens when they load, so a newer model can be dropped in.

**How to check it.** Open the page, bring each object to the front with the arrow keys, and press Enter to trigger its action.

**Likely questions.**
- Q: Are the dropped internals gone for good? A: Only on the landing page; the files still contain them, and the "Explode" animation in each file can show them later.

---

### The phone's lock screen (`js/lockscreen.js`)
Written by Claude (Claude Code) for Mina Vian · 2026-11-20 · Issue #5

**What it does.** The phone has an always-on display (a dim clock on black). When it comes to the front it turns around and wakes into a lock screen: a blue-grey wallpaper, a tall live clock, the date, four widget tiles and two shortcut buttons, which arrive one after another.

**How it works.** Each element is its own flat layer on top of the phone's glass, with a picture painted once: the wallpaper, an "atlas" of icons, the clock (repainted once a minute) and the date (repainted once a day). The animation only changes each layer's opacity, position and size (`update`), so nothing is redrawn while it moves. Layers are stacked a hair apart and drawn in a fixed order so they never fight.

**Why it is built this way.** The first version redrew one large picture every frame and sent it to the graphics card, which took about 37 ms per frame and made the phone stutter. Layers bring that to the same cost as a still frame.

**How to check it.** Bring the phone to the front: it turns and wakes. The clock shows your real time.

**Likely questions.**
- Q: Is the lock screen copied from a real phone? A: It is drawn in code and modelled on a ColorOS lock screen; no personal details are shown.

---

### The RFID scan and cutaway (`js/scan.js`, `js/scan-scene.js`, `js/scan-timing.js`)
Written by OpenAI Codex for Akris Luno · 2026-11-21 · Issue #16

**What it does.** The contactless card from the carousel slides into the scan. A short gesture suggests moving it toward the reader. The reader’s contactless symbol brightens as the card approaches. Moving it close enough, or focusing the card and pressing Enter, triggers the simulated scan. The shockwave sweeps the reader away and carries the card toward the center as “How It Works?” fades in behind it. Scrolling opens the same card and takes it into Bit River.

**How it works.**

- The carousel supplies the card’s screen position, size and rotation through `getPose()`. `borrowCard()` moves that same Three.js object from the landing scene to the scan scene. `drawHandoff()` starts with its rendered pose and blends it into the scan while the page scrolls.
- `scan.js` projects the card and reader into screen coordinates. `paintGuidance()` moves a gesture cue toward the reader and passes pointer position, attention and distance to `drawScan()`. The card tilts with the pointer and gently rocks while hovered. The reader light responds as the card approaches. The card follows a captured mouse or touch pointer and returns to rest if released too far away. The simulated read threshold unlocks the cutaway and Bit River. Reduced motion keeps the instruction and light feedback while removing the gesture and tilt.
- `drawScan()` follows the card from contact through the expanding wave to the first cutaway pose. The keyboard path places the hand around a point on the card so the grip moves with it. `SCAN_TIMING` aligns the chime, reader indicator, wave and heading fade.
- `drawInside()` moves the camera and opens the card as the visitor scrolls. `drawRiver()` closes the card and moves it to Bit River’s projected position. The scan canvas follows the card throughout the embedded Bit River section.
- Codex for the project team · 2026-11-21. If 3D setup fails, `scan.js` shows stills of the reader and card from Bit River. The **Scan card** button advances to the explanation and allows Bit River to draw its own card.

**Why it is built this way.** Visitors control the distance to the reader before the scan succeeds. Preserving one model lets each transition start at the previous scene’s pose. A scan button and the text explanation remain available if 3D fails to load. Reduced motion uses still poses for the landing flight, wave and scroll transitions.

**How to check it.** Serve the repo with `python -m http.server` and follow “Try an RFID scan.” Wait for the short visual cue. Bring the card near the reader and watch the light respond. Release the card out of range to see it return, then move it close enough to scan. You can replay from the reveal and press Enter on the focused card to try the keyboard path.

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

**What it does.** Follow a passive card's simulated reply to the reader and inspect example packets.

**How it works.** `bit-river.js` registers `<rfid-bit-river>`. The element's scroll position selects a chapter, and the chapter buttons jump to those same positions. `card.js` renders the team's card. `river.js` assigns positions to the field strands and data packets on canvas. The sample values are fictional. The reader detects the passive card's reply as changes in the load on its antenna.

The warm paper backdrop and copper signal stay the same throughout the chapters. Packet controls fade and slide into place as the transmission begins. On phones the inspector reserves space so the plot stays the same height. On the main page, `getCardTarget()` gives the scan canvas the card’s position, size and rotation as the river moves. The standalone demo draws its own model and crossfades it in over its poster.

**Why it is built this way.** The element contains its own styles and controls so the same component works after the cutaway and at `/bit-river/`.

**How to check it.** Scroll past the cutaway or follow “Follow the signal.” Choose “Transmit,” then inspect or lift a packet. Run `node --test bit-river/river.test.mjs` to check the path and chapter geometry.

**Likely questions.**

- Q: How does the card stay lined up with the signal? A: Bit River computes both positions from the same chapter progress and plot dimensions.
