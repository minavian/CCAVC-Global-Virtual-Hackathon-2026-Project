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
- [Bit River transmission](#bit-river-transmission-bit-river)

---

### Landing page layout and style (`index.html`, `styles.css`)
Written by Claude (Claude Code) for Mina Vian · 2026-11-20 · Issues #3, #5

**What it does.** One screen: on the left, the three everyday RFID objects (key fob, phone, contactless card) in 3D; on the right, the headline "Those are the things you use every day." and the line "and almost nobody knows how it works…". On phones the words sit on top and the objects below.

**How it works.**
- `index.html` holds the words as real text (an `h1` and a `p`), an empty `#stage` for the 3D canvas, and loads three scripts: `js/lockscreen.js`, `js/models.js`, `js/landing.js`. Three.js 0.170 comes from the jsDelivr CDN through an import map; the fonts (Inter Tight, and Antonio for the phone's clock) come from Google Fonts.
- A tiny script in `<head>` adds `data-intro` to the page before anything is drawn, so the opening can start from a blank state without a flash. If the visitor prefers reduced motion, it is not added and the page simply appears finished.
- `styles.css` uses a two-column grid on wide screens and a stacked layout when the window is taller than wide or narrower than 760 px. The stage covers the whole page behind the words, so objects are never cut off by a column edge. A faint SVG noise texture over everything gives a printed-paper feel.

**Why it is built this way.** The words are real HTML (not drawn in 3D) so they are sharp, selectable and readable by screen readers. No build step, so anyone can open the folder and serve it.

**How to check it.** Serve the folder (for example `python -m http.server`) and open it. The `.glb` models do not load from `file://`, so double-clicking `index.html` shows the words only.

**Likely questions.**
- Q: Why does the page need a server? A: Browsers block loading model files straight from disk for security; any static host works.
- Q: Why Google Fonts with `display=block`? A: The headline is measured for the animation; swapping fonts mid-animation would make it jump, so the page waits up to 3 seconds for the real font.

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
- **Sealed parts are dropped** (`SEALED`): the models include internals for exploded views (the phone's battery and circuit board, the fob's chip and coil, the card's antenna). They can't be seen on the landing page, so removing them halves the drawing work.
- **Flicker fix** (`liftDecals`): flat printed layers (the card's artwork, its chip contacts) sit at exactly the same depth as the plastic underneath, which made the GPU flicker between them. Those flat sheets are nudged toward the camera in depth only.
- **Phone back** (`refineBack`, `deepenCover`): the faint brushed swirl and logo in the back's texture are strengthened (fine detail amplified, broad shading kept). The flash gets a drawn frosted lens with two LEDs (`flashFace`).
- **The H** (`redrawH`): the H on the camera island is replaced with an outline traced from a photo of the real phone (`H_PHOTO`). The island's printed layer shows its texture upside down, so the H is drawn flipped.

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

### Bit River transmission (`bit-river/`)
Written by OpenAI Codex for Akris Luno · 2026-11-21 · Issue #12

**What it does.** Scroll from the team's contactless card into a river of bits. The reader's field supplies energy to the card. The chip varies the load on its antenna, and the reader detects those changes as a reply. The river, packet labels and replacement trick are illustrations. [NXP antenna guide, section 2.1](https://www.nxp.com/docs/en/application-note/AN12549.pdf)

**How it works.**

- `index.html` is the standalone demo. The reusable part is the `<rfid-bit-river>` element in `bit-river.js`. Its `layout()` function measures how far the visitor has scrolled through the element. That position sets the chapter and camera view. The buttons move to positions on the same scroll track.
- `loadCard()` in `card.js` opens the existing `models/contactless-card.glb`. It tilts the complete card as the view moves toward the air gap. The still in `assets/card.webp` is rendered from that model and covers loading time or loss of 3D support. The reader image is a studio render of a small tabletop reader made for this demo.
- `riverGeometry()` in `river.js` maps positions along the curve to the screen. `drawTraffic()` shows the reader field reaching the card, followed by the copper reply. `replyFront()` uses scroll progress to extend the reply toward the reader. Inner strands appear first, and the bundle widens as outer strands catch up. When the reply reaches the reader, the connection indicator appears.
- `replySample()` shapes the center line with a slowed example of the card's load modulation. The example uses byte `7B` from the simulated ID, least significant bit first. Type A at 106 kbit/s switches the 847.5 kHz subcarrier on for the first half of a one and the second half of a zero. The bright strands illustrate signal activity. The animation loop sleeps outside the viewport and draws fewer details on phones. [NXP PN512 data sheet](https://www.nxp.com/docs/en/data-sheet/PN512.pdf)
- `fadeText()` fades the current chapter line or readout out before revealing its replacement in the same space. If the visitor scrolls or selects another packet mid-fade, it starts from the current opacity and uses the latest text. Reduced motion swaps text immediately.
- `inspect()` shows the fictional value in the existing readout. Hover makes the packet translucent and scatters copper particles around it. Tap or click pins the reveal. Keyboard focus also reveals the value. `steal()` shows “Packet missing,” replaces the packet after 1.5 seconds, and briefly confirms “Packet replaced.” A live region announces each outcome. The river and other packets keep moving during the interaction. Sound starts after the visitor enables it.

**Why it is built this way.** The scene owns its markup, styles and input handlers inside a shadow root. That keeps the landing carousel and the river independent. Both use the project's existing Three.js import map and static file server.

**How to combine it with the landing page.** Place these lines after the existing hero or story section, outside its fixed or clipped stage.

```html
<rfid-bit-river></rfid-bit-river>
<script type="module" src="./bit-river/bit-river.js"></script>
```

The component uses normal document scrolling. For the current single-screen hero, these host styles enable the handoff and preserve vertical swipes over the carousel. A landing page that already scrolls can use the element directly.

```css
html { overflow-y: auto; }
body { height: auto; overflow: visible; }
.stage { touch-action: pan-y; }
```

**How to check it.** Serve the repository root and open `/bit-river/`. Scroll down and back to see the reader pulse, gradual copper reveal and moving packets. Enable sound before the reply reaches the reader for the chime. Hover, tap or Tab to a packet to inspect it. Drag it away, use **Lift packet**, or press Delete while it has focus. The missing notice should give way to a brief confirmation. Replay takes you back to the card. Run `node --test bit-river/river.test.mjs` with Node 22.7 or newer to check the reveal, drag boundaries and encoded bit timing.

**Likely questions.**

- Q: Does the demo read a real card? A: Every value comes from the small `packets` array. It runs entirely in the browser.
- Q: Does RFID send a replacement when someone takes a packet? A: That sequence is a game mechanic. Real card communication uses protocol-specific commands and responses.
