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
Owner: Mina Vian · 2026-11-21 · Issue #9

**What it does.** After the first screen, scrolling plays a short film instead of moving a page:
1. The three objects drop out of the diagonal into a straight line, and the title "This is RFID technology." appears.
2. The key fob is chosen: the phone and card drift out of focus and away, and the fob moves to the right with text on the left.
3. The fob opens: its front shell swings off, and the chip on its little circuit board and the copper coil step out.
4. The shells slide out of frame, the view closes in on the coil and the chip, and labelled lines point out the copper antenna coil, the tuning capacitors and the transponder chip.

A chapter bar at the bottom (Intro, RFID, Key fob, Inside) works like a video's scrubber; clicking a chapter jumps to it.

**How it works.**
- **Progress in screens.** `landing.js` turns the scroll position into `scrollNow`, measured in screens (1 = one window height of scrolling), and eases it toward the real scroll position each frame, so even a mouse wheel's steps feel like smooth playback.
- **One timeline.** `story.js` holds the timing (`TIME`) and `timeline(s)`, which turns `s` into progress values from 0 to 1 for each beat: the hero leaving, each object's drop, the title, the fob being chosen, opening, the close-up, each label and each block of text. Everything is a pure function of `s`, so scrolling back up replays it exactly in reverse.
- **The 3D poses** (`storyPoses` in `landing.js`) blend each object from its carousel pose to its place in the line (`rowPose`, with a gravity fall and a small bounce), then to the featured pose. The featured pose is not hard-coded: `fit` measures the open fob at its current angle and works out where it must stand, and how big it must be, to fill the right-hand area (`featureRect`), or during the close-up just the coil and the chip (`insideRect`, `INSIDE_PARTS`). The fob is also brought closer to the camera so the depth-of-field blur never softens it.
- **The words** (`paint` in `story.js`) are real HTML, faded and moved with styles.
- **The labels** (`CALLOUTS`) follow their parts. Each frame, `points` reports where each part and the piece it belongs to are on screen (their bounding boxes). Each label is placed just outside that piece, on the side given by `side` (`narrowSide` on phones), so it never covers the object at any screen size; if there's no room on the right it moves to the top. Its line runs straight from a spot on the part (`aim`) to the label's nearest edge.
- **Speed.** Objects that have left the frame are hidden, the shells are skipped once they are out of view, and the words are only repainted when the scroll position changes. Frames measured at 0.7 to 5.6 ms on the test machine.

**Why it is built this way.** The page should feel like a video, not an ordinary web page, which would read as basic to judges. A film tied to the scroll keeps the visitor in control (they can stop, go back, or jump with the chapter bar) while still feeling like a video. Keeping the timing in one pure function makes it easy to tune and impossible to get out of sync.

**How to check it.** Serve the folder, open it and scroll. `?t=20` skips the opening; with `?debug`, `__hero.state.scroll` shows the progress and `__hero.bench(60)` measures a frame. Check at desktop size and at phone size (words below the objects).

**Likely questions.**
- Q: Is the open key fob accurate? A: The parts are the team's model: a chip on a small circuit board with two tuning capacitors, and a copper coil (in the real thing, sealed in resin), which is what an RFID transponder contains. The labels describe what each part does.
- Q: What if someone doesn't scroll? A: A "Scroll" cue sits under the first screen, and scrolling (or the keyboard's Page Down or Space) plays the film.
- Q: What about reduced motion? A: The film only moves when the visitor scrolls, and the easing toward the scroll position is switched off.
