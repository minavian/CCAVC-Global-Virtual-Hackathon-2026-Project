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
- [Every day: three taps](#every-day-three-taps-jstapsjs-modelssubway-cardglb)
- [What RFID is: the card intro](#what-rfid-is-the-card-intro-jsintro)
- [The close-up: how a tap works](#the-close-up-how-a-tap-works-jsintrocinemajs)
- [The story: a film played by scrolling](#the-story-a-film-played-by-scrolling-jsstoryjs-jslandingjs)
- [The simulation: physics, protocol and reader](#the-simulation-physics-protocol-and-reader-jsrfid)
- [The lab: Power, Reply, Break it](#the-lab-power-reply-break-it-jslabjs)
- [Take it apart: scenes 6 to 17](#take-it-apart-scenes-6-to-17-jsdeepjs)
- [The checks](#the-checks-tests)

---

While the introduction is being built, the root page previews the standalone [Take it apart chapter](#take-it-apart-scenes-6-to-17-jsdeepjs). The opening entries below describe the introduction.

### Landing page layout and style (`index.html`, `styles.css`)
Owner: Mina Vian · 2026-11-20, updated 2026-11-21 · Issues #3, #5, #9

**What it does.** The first screen: on the left, the three everyday RFID objects (key fob, phone, contactless card) in 3D; on the right, the headline "Those are the things you use every day." and the line "and almost nobody knows how it works…". On phones the words sit on top and the objects below. Scrolling then plays the story (see its own entry).

**How it works.**
- `index.html` holds the words as real text (an `h1` and a `p`), an empty `#stage` for the 3D canvas, the story's words (`.story`) and an empty `.track` that only gives the page its scroll length. It loads four scripts: `js/lockscreen.js`, `js/models.js`, `js/story.js`, `js/landing.js`. Three.js 0.170 comes from the jsDelivr CDN through an import map; the fonts (Inter Tight, and Antonio for the phone's clock) come from Google Fonts.
- A tiny script in `<head>` adds `data-intro` to the page before anything is drawn, so the opening can start from a blank state without a flash. If the visitor prefers reduced motion, it is not added and the page simply appears finished.
- `styles.css` pins the hero and the 3D stage to the screen (`position: fixed`), like a video frame, and hides the scrollbar; the page underneath still scrolls normally. It uses a two-column grid on wide screens and a stacked layout when the window is taller than wide or narrower than 760 px. The stage covers the whole page behind the words, so objects are never cut off by a column edge. A faint SVG noise texture over everything gives a printed-paper feel.

**Layout (desktop).** The words sit in the centre of the screen, and the three objects orbit around them on an ellipse (`layout.ring` in `js/landing.js`). The front object is lowest, the back one highest and smallest. Phones keep the words on top and the objects below. The "Scroll" cue sits bottom left, clear of the front object. `index.html` loads `styles.css` and `landing.js` with a version number (`?v=`), so a changed file is never served from an old cache.

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
- While the taps or the card intro fill the whole screen, the landing page can't be seen, so its frame loop sleeps (`covered` in `frame`). Scrolling wakes it. This leaves the machine to the section on top.

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

### Every day: three taps (`js/taps.js`, `models/subway-card.glb`)

Owner: Mina Vian · 2026-11-22. Metro ticket model by Akris Luno (`nduchuy348-art`, branch `create-new-model`).

**What it does.** The section right under the landing page. Three small 3D scenes play one after another: a metro ticket taps a ticket gate and the gate opens; a bank card taps a payment terminal and the payment is approved; a car key's unlock button is pressed and the car opens. Each has one short line under it: "Tap. The gate opens.", "Tap. The payment goes through.", "Click. The car opens."

**How it works.**
- **Where it sits.** The landing page is pinned to the screen, so the section starts one screen down. It has a paper background and slides up over the landing page like a sheet. It is at least one screen tall, so it covers the landing page fully. The card intro ([What RFID is](#what-rfid-is-the-card-intro-jsintro)) comes next. After it, the landing page shows again and the story starts from its first frame: `landing.js` counts the story's scroll from the top of `.track`, which comes right after the intro.
- **One canvas, three cameras.** `index.html` has a `.taps-row` with three `.tap-view` boxes and one `<canvas>` under them. `js/taps.js` keeps the three scenes in one Three.js scene, 60 m apart, and gives each its own camera. Every frame, it measures each box and draws that scene into it with a scissor box (`draw`). One WebGL context serves all three.
- **Pure functions of time.** Each scene has `apply(t, r)`. `t` is the panel's time (0 to `PLAY`, 3.4 s) and `r` is the reset (0 to 1). The pose is computed from these two numbers alone, so the loop can stop, restart or jump at any point. The timings are in the `PLAY`, `HOLD`, `RESET` and `ARRIVE`/`LEAVE` constants at the top.
- **The order.** On wide screens one clock (`cycle`) plays the gate, then the payment, then the car. All three hold their finished state, reset together, and the loop starts again. On phones the panels are stacked, so each one plays its own loop while at least half of it is on screen (`own`, `shown`). The thin bar under each line fills while its panel plays.
- **The card's flight** (`glider`). The card floats with a slow bob, follows a curve to the reader and lands straight down onto it. It presses once and floats back. The flight eases in and out (`inOut`), and the turn finishes before it lands.
- **The gate** (`gateSet`). It has two rounded cabinets and a dark reader pad. Two glass flaps turn on hinges at the cabinets. Copper rings spread from the pad while the ticket is read (`ripples`: the reader's field, the same copper as the rest of the site). Then the lights turn green, a tick appears on the front display, and the flaps swing open toward the exit.
- **The terminal** (`terminalSet`). The screen is a canvas texture, redrawn only when it changes (`drawScreen`). Four status lights come on one after another while the card is read, like on real card terminals. "Approved" appears as the card leaves.
- **The car** (`carSet`). The body is one side outline extruded across the car with rounded edges. The windscreen and rear window follow the outline's curves (`ribbon`). The near front door is a separate panel on a hinge, with a dark opening behind it that lights up warm. The key is the team's fob model, shown large. Its unlock button moves in by 0.9 mm, rings travel toward the car, the light bar blinks amber twice, and the door swings open.
- **Models** (`loadModel`). The ticket, the bank card and the key are the team's GLB files, loaded and centred here. Parts sealed inside them (coils, chips) can never be seen, so they are not drawn. Flat printed layers get the same depth nudge as in `models.js` (`liftDecals`), so they don't flicker. The gate, terminal and car are built in code from simple shapes. The ticket is drawn 3.6 times its real size so it can be seen next to a full-size gate. The key is drawn 19 times its real size. The terminal and bank card are at true size.
- **Only when needed.** The models load when the section is about one screen away. Frames are drawn only while the section is on screen, the tab is visible and the loop isn't paused.

**Why it is built this way.**
- One shared canvas instead of three: one WebGL context, one set of lights, one frame loop.
- The gate, terminal and car are made from simple shapes rather than detailed models. They are the backdrop: the real models (ticket, card, key) stay the focus. They also stay neutral and look like no real brand.
- The section slides over the pinned landing page rather than pushing it away, because the landing page and the story share one pinned stage. Counting the story from `.track` keeps the film exactly as it was, only later on the page.

**What is simplified.** This section is a picture, not the simulation. Nothing here is computed from RFID physics; the copper rings only show that the reader's field is there. The key's button is powered by the key's own battery, as scene 3 of the story says. The amount on the terminal is made up.

**How to check it.** Serve the folder, scroll one screen down from the landing page, and watch the three scenes play in turn. Press **Pause**: everything stops where it is. With reduced motion turned on in the system, all three show their finished state and nothing moves. Keep scrolling: the card intro plays, then the landing page comes back and the story starts. Add `?debug` to the address and run `__taps.seek(4.5)` in the console to freeze the loop at 4.5 s.

**Likely questions.**
- Q: Why are the ticket and key bigger than life? A: At true size, a ticket next to a 1 m gate, or a key next to a car, would be a few pixels. The scenes are illustrations, so the hero object is scaled up and the backdrop stays at true size.
- Q: What happens on a phone? A: The panels stack, and each plays its own loop while it is on screen, so nobody misses one that played off screen.
- Q: Does it slow the page down? A: All three scenes together took about 3 ms per frame on our test machine. Nothing is drawn while the section is off screen.

---

### What RFID is: the card intro (`js/intro/`)

Original section written by OpenAI Codex for the project team · 2026-11-22 (the team's `ui-rebuild` part 2, in `Teams parts/`). Moved into this page: Owner: Mina Vian · 2026-11-22.

**What it does.** The section after the three taps. One bank card, played by scrolling: it opens like a mouth and lets out the letters R, F, I, D. The letters spell "Radio-Frequency Identification", a line explains that RFID swaps data by radio, an X-ray shows the antenna and the chip, and the card asks how it can work with no battery. At the end you drag the card onto a reader.

**How it works.**
- **Where it sits.** `index.html` has a tall `<section class="intro">` right after the taps. Inside it, `.intro-stage` is `position: sticky`, so it stays on screen while the section scrolls past. Its paper background covers the pinned landing page, like the taps.
- **Coming in from the taps.** While the stage is still sliding up, before it pins, the playhead runs from `ARRIVE` (-1) to 0, one screen of scroll. The first row of `cardFrames` places the card higher in the stage and turned away. So the card rises more slowly than the page and turns to face you as the stage settles. The taps and the intro use the same paper colour, so there is no seam between them.
- **Leaving for the story.** The section has the same soft paper edge as the taps (a wide `box-shadow`). As it slides away, the landing page fades in under that edge, and the story starts from `.track`.
- **One playhead.** `js/intro/timeline.js` turns the scroll into one number, the playhead (`scrollTime`). Repeated values in `scrollFrames` hold the picture still for a stretch of scroll, so there is time to read. Everything else is a function of the playhead: the card's pose (`cardPose`), when each line fades in and out (`beats`), and when the X-ray shows.
- **Counting from the section.** The original was a page of its own. Here, `main.js` measures where the section starts (`startY`) and counts the scroll from there.
- **The card** (`card-scene.js`). It loads the team's `models/contactless-card.glb`. The X-ray fades the outer layers and turns the copper antenna brass.
- **The mouth bends like a sheet** (`bendSheet`). The two front layers stay glued along the right edge and lift as one sheet: a soft crease near the edge (`HINGE`, 0.17 radians) and a curl that grows toward the free edge (`CURL`, 0.40 more). The model's flat layers only have vertices round their outline, so `sliceAlongX` first cuts them into 72 strips across the card. A vertex shader then walks along the sheet from the glued edge, adding up its direction with Simpson's rule. So every point keeps its distance along the card: the sheet bends but never stretches. Each normal turns by the same angle, so the light slides along the curve. `sheetPoint` does the same sum in JavaScript, and `mouth()` uses it to find the middle of the gap.
- **The opening** (`timeline.js`, `mouthAt`, `curlAt`). One smooth open and one smooth close, made from smootherstep curves, which start and stop with no kick. The curl runs a moment behind the crease, the way a sheet bends before it lifts and straightens after it lands.
- **Smooth motion everywhere** (`easing.js`).
  - The card's pose, and the scroll-to-playhead table, go through a monotone cubic curve (`monotone`). The card glides through each keyframe instead of stopping on it, and never overshoots.
  - The playhead, the drag, the lift and the mouse tilt each follow their target through a critically damped spring (`spring`, `follow`). A scroll that starts or stops suddenly still starts and stops the card softly, because the speed carries over from frame to frame.
  - The arrival from the taps eases out exactly where the scroll curve eases in, so the two join with no bump.
- **The letters** (`main.js`, `paintLetters`). Four real HTML letters fly out of the gap in the card's mouth, then spell the full name in three lines: **R**adio-, **F**requency, **ID**entification. I and D share the last line (`STACK_ROW`), and D moves one I-width to the right. On phones, the line under the name sits right below those three lines (`meaningY` in `timeline.js`). Each flight (`settle`) leaves from rest, overshoots by about 4% and lands with no speed left. The rise is a sine squared, so it lifts off and touches down level.
- **The big type.** The letters R, F, I, D use the site's Inter Tight, a variable font: its weight can be any number, not just a few fixed steps. `index.html` loads the full range (100 to 900). Each letter leaves the card at the thinnest weight (100) and fills out to 800, like the taps' title (`THIN`, `FULL` and `weights` in `main.js`, `paintLetters`). The weight follows the distance the letter has travelled, not the clock. So it starts thickening the moment the letter leaves the mouth and is full as it arrives, all while it moves. It thins again if you scroll back. `measure` takes the letters' widths at full weight, so the layout is right even mid-flight. The "How It *Works*" title uses Instrument Serif from Google Fonts (`--display` in `styles.css`), which has a real italic for "Works".
- **The lines** (`signals.js`). One 2D canvas draws the spray from the mouth, the radio wave, the label lines and the reader's rings.
- **The reader.** With WebGL on, the reader is a 3D model (`reader-model.js`) standing where the picture `images/intro/reader.webp` was, at the same angle. You can drag the card onto it or press the card with the keyboard. A drop near the reader plays the close-up ([The close-up](#the-close-up-how-a-tap-works-jsintrocinemajs)).
- **Only when needed.** The 3D card loads when the section is about one and a half screens away. Frames are drawn only while the stage is on screen.

**Why it is built this way.** The pinned stage keeps one card on screen through the whole idea, so nobody loses track of it. Real HTML text stays sharp and screen readers can read it. Every CSS rule starts with `.intro`, and the two class names the page already used are renamed (`.intro-stage`, `.intro-callouts`), so this section cannot change the landing page or the story.

The first version eased each keyframe in and out separately (smoothstep), and followed the scroll with a one-step lag. So the card stopped for an instant at every keyframe, and its speed jumped whenever the scroll started. The opening was a stiff flap on a hinge, with a curl that had no vertices to bend. The changes above fix those three things. A scripted wheel scroll through the opening, measured at 60 frames a second, showed peak acceleration 3 times lower and peak jerk (the sudden kick) 4.3 times lower.

**What is simplified.** "Card detected" is a check that the card was dropped close to the reader, not a radio link.

**How to check it.** Serve the folder and scroll past the three taps. The card opens and the letters fly out. Keep scrolling to the X-ray, then drag the card onto the reader. Press Tab first on the section to find **Skip to the card and reader**.

**Likely questions.**
- Q: Why is the playhead not just the scroll position? A: Some parts need more scroll than others. The table in `scrollFrames` gives each beat its own length, and holds.
- Q: What if WebGL is off? A: Two pictures of the same card (`images/intro/credit-card-*.webp`) stand in for the 3D card.
- Q: Why does the card trail the scroll a little? A: That is the spring. It is what makes a sudden scroll look smooth. It catches up within about a third of a second.
- Q: Is the bend physically right? A: It is a sheet that bends without stretching, with the bend we chose. Real card layers are glued all over and don't open at all. The mouth is a picture, not a teardown.

---

### The close-up: how a tap works (`js/intro/cinema.js`, `effects.js`, `reader-model.js`)

Owner: Mina Vian · 2026-11-23

**What it does.** The moment the card is dropped on the reader, time slows right down and the camera dives in. In about 25 seconds it shows the whole tap, which really takes about 5 thousandths of a second:
1. The lights go down. The card keeps moving, slower and slower, and floats over the reader.
2. The card fades. The reader turns see-through: "This is a reader. It emits a signal." Its copper coil glows and gold rings rise from it.
3. The reader fades. The card turns see-through: "This is a passive tag. It receives the reader's signal. Electricity flows into its coil and powers the chip. No battery needed."
4. The exchange, one caption per step: the reader's coil sends out the signal; the card's coil catches it (light runs round the coil); sparks jump across to the chip; the chip blinks; the chip answers through its coil (blue rings and bits fall to the reader); the reader's coil and its own chip light up as it reads and checks; a green check mark appears.
5. The lights come back up, the card rests on the reader, and the explanation appears with **Watch again** and **Try again**.

**How it works.**
- **One clock** (`cinema.js`, `beats`). `main.js` runs the shot's clock `c` in seconds, on its own, not from the scroll. Every look on screen is a pure function of `c`: when the lights dim, when each part fades, when the rings, sparks, bits and check mark show. So **Skip** just moves the clock to 22.8 s, and **Watch again** sets it back to 0.
- **Slow motion.** The card's last bit of travel is an exponential ease-out (`dock`): it keeps the speed it was dropped with, then slows almost to a stop. A badge says "about 2,000× slower" and a clock counts the real time of the exchange, 0 to 5 ms, across the 11 seconds that show it.
- **The camera** (`camera`). A shot list gives, at set times, the zoom (up to 10.5× on the chip), the point looked at (the reader, the gap, the card's coil, the chip, the reader's chip) and the viewing angle. Every number glides between shots on the same monotone curves as the rest of the intro, so the camera never stops dead or swings past a mark. The zoom glides in log steps, so 1× to 10× feels even. The camera is the 3D scene's own camera (`card-scene.js`, `draw`), so zooming re-draws the 3D sharp, never blown up.
- **One table.** The reader stands in a group, `table`, at its place on the stage. The camera's angle turns that group. The card leaves its scroll pose and docks onto the table: `dockPose` places it flat over the reader, and the card's shown place blends from where it was dropped to there (`capture`, `blend`). If you scroll away mid-shot, `release` glides the card and the camera back in 0.9 s.
- **The reader** (`reader-model.js`). Rounded boxes for the body, a glossy top with the contactless mark and an amber light. Inside: a green circuit board, the reader's chip with a light on it, and a five-turn copper coil (a tube along a rounded-square spiral). `flowShader` makes pulses of light run along the coil, using how far along the wire each point is.
- **The card's current** (`currentShader` in `card-scene.js`). The card's own copper glows with pulses that run round the coil, using the angle round the card's centre. That way the glow follows the model's real traces. Warm gold is the reader's power coming in; blue is the answer going out.
- **The effects** (`effects.js`). Rings are thin rounded-square bands that rise from the reader's coil and spread (the signal), or leave in the card's shape and land in the reader's (the answer). The sparks are jagged lines from the big coil's coupling loop to the chip's little coil, redrawn 24 times a second from a seeded random source, so a frame always looks the same when replayed. The falling bits are the start of the card's real first answer to a reader, ATQA `0x0044`, in the order it is sent (lowest bit first).
- **The words** (`index.html` `.cine`, `paintFilm` in `main.js`). Notes, captions, the check mark and the explanation are HTML on top of the 3D, so they stay sharp and screen readers get them. The step captions are a polite live region. Each note's line runs from its edge to a point on the part it names, found by projecting that 3D point to the screen (`anchor`).
- **The dark** is an HTML layer (`.cine-backdrop`) between the 2D drawings and the 3D, so it dims everything behind the card and the reader. A cool light from behind (`rim`) keeps the dark reader's edges. The card's shell goes clearer in the dark, so the copper stands out.

**Why it is built this way.** The close-up re-uses the same 3D card and the same camera, so it is one continuous shot, not a cut to a video. A real video would be blurry when zoomed and couldn't follow the card from wherever it was dropped. Doing everything from one clock keeps Skip, Watch again and a mid-shot cancel simple and exact.

**What is simplified.**
- The waves, sparks and bits are pictures of what happens, not a field simulation. The real physics is in the story further down the page, from the same simulation as its numbers.
- The card doesn't really broadcast an answer. It answers by soaking up more or less of the reader's field, and the reader feels the change. The explanation says so.
- "About 5 ms" is a typical time for a reader to power a card and get its first answers. "About 2,000×" is 11 seconds of film for those 5 ms. Both are round numbers.

**How to check it.** Scroll to the end of the card intro and drag the card onto the reader (or Tab to it and press Enter). Press **Skip** to jump to the end, then **Watch again** and **Try again**. With reduced motion turned on, a drop goes straight to the last frame. With `?debug` in the address, run `__intro.shot(16.5)` in the console to freeze the shot at 16.5 s (the chip blinking), and `__intro.play()` to let it run. Drawing any frame of the shot took under 1.5 ms on our test machine.

**Likely questions.**
- Q: Why does the reader look like the picture? A: Its sizes, colours and resting angle (`REST` in `cinema.js`) were matched to `reader.webp` side by side.
- Q: Where is the chip's processing? A: Two places: the card's chip blinks while it works out its answer, and the reader's chip glows while it checks the answer.
- Q: Can I leave in the middle? A: Yes. Press Skip, or scroll up: the shot glides back and the instructions return.

---

### The story: a film played by scrolling (`js/story.js`, `js/landing.js`)
Owner: Mina Vian · 2026-11-21, updated 2026-11-21 · Issues #9, #19

**What it does.** After the first screen, scrolling plays the first two minutes of `SCRIPT.md`. One plain sentence is on screen at a time, always top left, and a part is labelled only while the sentence names it:
- **Inside:** "They all use RFID." Then the objects turn to glass: "Inside each one: a coil and a chip." Each object gets `Coil` and `Chip` labels.
- **No battery:**
  - "The key has a battery." and "Pull it out.": the visitor drags the battery (or scrolling pulls it).
  - "The buttons stop working." and "The coil and chip don't need it."
  - The card comes back: "Your bank card has no battery at all." and "So what powers its chip?"
- **Power, Reply, Break it:** the lab (`js/lab.js`) runs these, and supplies the sentences that depend on what the visitor does.

The chapter bar at the bottom reads Intro, Inside, No battery, Power, Reply and Break it. On phones it shows the current chapter's name and a dot for each of the others.

**How it works.**
- **Progress in screens.** `landing.js` turns the scroll position into `scrollNow`, in screens (1 = one window height), and eases it toward the real scroll position, so a mouse wheel's steps feel like smooth playback. The count starts at the top of the empty `.track`, which comes after the everyday taps section, so the film begins once that section has scrolled away. The chapter buttons add the same offset.
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
- **The reader pad is drawn at the true size of the reader in use** (`padScale`): a small start-button reader (a 1.6 cm coil) for the key, and a payment terminal (a 3.5 cm coil) for the card. Its copper ring always matches the coil the field lines come from. The camera zooms in close on the key (8000 design pixels per meter) and eases out for the card (5600), so the tag always fills the view.

**Why it is built this way.** The first hands-on part should teach by doing. Each sentence only appears when the thing it says is really happening in the simulation.

**How to check it.** Scroll to Power and drag the key. With `?debug`, `__lab.bits` shows the bits the reader decided, and `__lab.fastForward(70)` plays 70 bits at once.

**Likely questions.**
- Q: Is the ID really decoded? A: Yes. The display only shows what the reader read from the samples, and turns green only when the message passes its checks.
- Q: Why 2.5 cm when scrolling? A: Close enough to read, and close enough to the edge that metal or a turn breaks it, so every lesson is one click away.

---

### Take it apart: scenes 6 to 17 (`js/deep.js`)
Owner: Mina Vian · 2026-11-21 · Issue #19. Separated by Codex for the Issue #26 contributor · 2026-11-24. Part One and Part Two handoffs, full-screen story layout, and motion and controls for Scenes 6–14 by Codex for the project team · 2026-11-24 · Issue #26.

**What it does.** Twelve scenes after the film, each one layer deeper into the same idea, each with one thing to try:
- **6** Distance and coil size against field and volts.
- **7** A still magnet makes nothing.
- **8** The tuning capacitor.
- **9** A movable metal plate bends the reader’s field and detunes the card.
- **10** Riding through the pauses: the chip's stored volts.
- **11** Load modulation at true size and zoomed.
- **12** The subcarrier, in a spectrum.
- **13** Manchester coding against a drifting clock.
- **14** Check bits and CRC with a signal the visitor can disrupt.
- **15** The whole conversation as a river and a chat.
- **16** Two cards at once.
- **17** Why a phone can't read a car key.

**How it works.**
- Each heading, scene, and the ending use a minimum height of one viewport in `take-apart/style.css`. A scene grows if its text and controls need more room, and normal page scrolling connects the scenes.
- At the opener, `watchPartOne` catches a downward wheel, touch, or paging gesture before the browser moves the page. The opener stays in place for one second while `#deep-blink-word` inverts its ink and paper colors twice. The viewport darkens and reopens over 400 milliseconds. While the dark layer fills the screen, the page jumps to the centered Part One title, then holds it for one second after the layer clears. Part One has a clear top edge during the cut. Reversing the gesture releases the hold. Direct section links and reduced motion use ordinary scrolling. The inline `#part-one-power` span gives the next scene a starting position for its title transition.
- For Scene 6, `watchCloser` uses the same paging gestures as the opener. It measures the Part One words and the Scene 6 heading, then carries a fixed copy of “The power” to the new heading over about 800 milliseconds. The page aligns Scene 6 with the viewport while the title moves. The heading and nearby text flip in with short staggered delays, and the range tracks draw left to right. Scene 6 stays in place while the canvas builds its axes, grid, traces, and guides, then holds for one second. On shorter screens the chart waits until it scrolls into view. The canvas redraws the existing data at each reveal step and keeps the complete curves available to Scene 7. Paging up at the start of Scene 6 mirrors the title and text cues back into Part One. Paging down again replays the full reveal with the current distance and coil size. Escape or using either control releases the hold. Direct links and reduced motion show the scene settled.
- `plate(id, draw)` wires each scene: its canvas, inputs and readout. It redraws when an input changes, and only while it is on screen (an `IntersectionObserver`). Scenes 7 and 15 move, so they draw every frame while visible.
- Scene 6 reuses the reader and card images from the introduction. `setupCardDistance` measures the card’s travel and maps horizontal drag, tap placement, and keyboard input to the same 2–80 mm distance used by the simulation. The gap marker and caption show the current distance, and the card exposes it as an accessible slider. The coil size slider scales the copper outline. Both controls update the live readout and plots, and the simulated field controls the visibility of the dotted field lines.
- Scene 7 keeps its chart on the left at desktop widths and follows the reading order on mobile. While approaching from Scene 6, `watchFlipping` stages the target offscreen and captures the next paging gesture once the source chart can fill the viewport. It measures the source and target headings, then carries one copy of each word and the coil track through a curved path. The words change in flight and land in order. The outgoing black and copper traces keep their sampled positions. They converge into one horizontal copper line that moves directly to the chart along a straight path. At the destination, the black trace reappears and each line moves to its plot baseline. Only then does the animation bring up the height of the live waves. The chart draws its horizontal guides and divider last, followed by a one-second reading hold. Upward paging during the entrance returns to Scene 6. Direct links, reduced motion, and focus on the speed control show the settled scene. The `#s7-flipping` span and live waves remain the source for the next transition.
- `watchTuning` starts a timed sequence from a downward paging gesture. It tips “flipping” first, then folds the neighboring words in order as the Scene 8 heading comes into view. `#s7-chart.drawOutgoingHandoff` receives the live wave functions. The waves gather into a line. A small capacitor launches from below the viewport, overshoots, and falls onto the line. The line bends under it, springs back into the frequency sweep, and sends the capacitor down out of view. The page holds for one second after the roughly three-second transition. Short screens move far enough to show the whole chart before the pluck. Scrolling back returns to Scene 7, and direct links, reduced motion, and control input show the live chart immediately.
- The Scene 8 capacitor is the button that lifts the component out of its contacts or puts it back. Its action label changes between Remove and Reinsert. The two socket pads follow the illustration’s width as it grows across the selected tag’s capacitance range, and the pads are exposed when the component lifts away. The range keeps its setting so reinserting the capacitor restores it, and the readout reports capacitance in farads and the calculated range. The Card and Car key choices remain native radios. Switching tags or lifting or reseating the capacitor blends the displayed traces, scales, and marker over 360 ms. The simulation computes the new result once per change, and a quick reversal starts from the curve currently on screen. Reduced motion shows the new result immediately. For the next handoff, `#s8-chart.resonanceCurve` exposes the solid copper trace as frequency and voltage pairs with their chart box, canvas coordinate functions `X` and `Y`, and color. The chapter uses the same asset version on its stylesheet and both story scripts so the HTML loads the matching capacitor control, chart, and scroll lock after a refresh.
- `watchMetal` pins Scene 8 in its current frame while Scene 9 replaces it. The outgoing copper trace splits at its midpoint, curls into one small loop, then expands from the innermost live field lines outward. A narrow blur follows a shared wavy edge from left to right, revealing the new copy as the two halves curl. The result holds for one second. Short screens make room for the chart before the field lines open. Scrolling back during the entrance returns to the starting frame.
- In Scene 9, drag `#s9-metal` down to bring the plate closer to the card. Arrow keys adjust the gap by one millimeter and Home and End move it between the closest and parked positions. The button eases the plate between those positions over 600 ms, updating the field and readouts from its current gap. Reduced motion applies the new position instantly. The readout switches from No metal as soon as the plate leaves its parked position. The model keeps the physical gap fractional during movement and rounds only the accessible readout. The field trace ends at the exact plate boundary, and releasing the drag keeps the visual position. For the next handoff, `.s9-metal-surface` inside `#s9-metal` marks the visible plate at its current position.
- `watchPauses` places the chart on the left and the reading block on the right at desktop widths. It pins the outgoing frame, carries the metal plate from its current position into the storage capacitor track, and wipes the two blocks of copy with a brief blur. Over 2.8 seconds, `#s10-chart` draws the flat traces, pulls down the dips, then draws the dashed reset limit. The scene holds for one second. On shorter screens the chart moves fully into view before the dips draw. The native range has its own label and reports capacitance in a separate output. Using either scene’s controls or focusing the Part Two link settles the motion immediately.
- `watchPartTwo` locks the viewport when the visitor pages beyond Scene 10 or activates the “pauses” link. The word depresses and sets off a copper ripple. A radial mask reveals the Part Two slide underneath, replacing Scene 10’s text, chart, and the pressed word wherever the wave has passed. The fixed copy is inert and hidden from assistive technology. When the ripple fills the screen, the real heading replaces the copy at the same position and holds for one second. Link activation also sets the fragment and moves focus to the real heading. Scrolling back or pressing Escape releases the hold. Direct links and reduced motion show the settled heading. Codex updated this transition for the project team.
- `watchSoaking` locks the viewport, closes the Part Two heading to a thin copper line, and carries the line into the Scene 11 plot. The copy reveals in order. The axes draw first, then the trace draws from sample zero before a one-second reading hold. Using a control, paging back, or pressing Escape releases the hold. The chart uses a wider desktop column and the native vertical Zoom slider increases magnification when moved up. The simulator prepares nine seeded captures with matching switch-on and switch-off samples. They show the first 99 µs around the presence reply, the start of the card ID, six ID continuations, and the selection reply. Each four-second forward pass replaces samples just behind the cursor. A narrow blend softens the join between captures, and the white dot follows the interpolated line on the canvas. The cursor starts a new forward pass from the left edge when the reply is complete. Playback can be paused and stops offscreen or in a hidden tab. Reduced motion shows a static capture with a Next button. The native answer switch blends smoothly between its recordings and flips the readout. `#s11-chart.answerTrace` gives Scene 12 the displayed `[sample, current]` pairs, chart box, coordinate functions, and trace color. Codex updated this scene for the project team.
- `watchWhispering` locks the viewport (catching wheel, touch, keyboard, and momentum scroll crossings and pinning small compositor drift through the reveal and one-second hold) as individual letters follow a staggered spiral and turn into the Scene 12 heading. DOM ranges measure the letter positions after the browser wraps each heading. Each decorative letter starts at its original position, turns in depth with a brief copper tint, and lands in reading order before blending into the real heading. The live Scene 11 waveform freezes, bends toward the carrier with a faint delayed echo, and resolves into a decorative peak. The real spectrum opens outward with feathered edges. The copy resolves on the right on desktop and above the chart on narrow screens. The finished scene stays in place for one second. Using either scene’s controls, paging back, jumping to a scene, or reducing motion restores the live elements. The copies ignore pointer input and stay out of the accessibility tree. Scene 12’s fast flicker control uses a native `role="switch"` with an `847.5 kHz` / `Off` frequency indicator, flipping the readout and smoothly morphing between cached on/off FFT spectra. `#s12-chart.spectrumTrace` exposes the plotted `[frequency, decibels]` bins, the chart box, the `X` and `Y` coordinate functions, the trace color, the carrier bin, and the flicker state for the next handoff. Codex and Antigravity updated this transition and switch for the project team.
- `watchCounting` locks the viewport (`html.deep-counting-hold`) when the visitor scrolls or pages from Scene 12 into Scene 13, holding through the transition and a one-second reading pause. It carries a live copy of the current spectrum from `#s12-chart` into the Scene 13 timing band, then sweeps a copper counting hairline across the plot so each bit digit appears just ahead of its column of the real timing wave and reader tick, replacing the same fraction of the old spectrum. Using either scene’s controls, paging back, pressing Escape, jumping to a scene, or reducing motion restores the completed chart immediately. `#s13-chart.timingTrace` exposes the chart box, the `X` and `Y` coordinate functions, the sent bits, the waveform samples, the read bits and their sample positions, the number of samples per bit, and the trace color. Antigravity updated this transition for the project team.
- The Scene 13 coding switch uses a sliding segmented pill (`Dip for 1` / `Change in the middle`) that smoothly morphs the square waveform and reader sample ticks between encodings. Beside it, the timing drift fader (`#s13-drift-input`) sweeps continuously from −12% slow to +12% fast around a center 0% mark, with a dedicated `0%` reset button (`#s13-exact`) and double-click reset on the track. Crossing `0%` flips the drift direction word (`fast` / `exact` / `slow`) and pulses the center hairline mark. The slider starts at `+7% fast`, and the same decoder uses that drift value to decide where to count the selected letter’s bits. Antigravity updated these controls for the project team.
- `watchMistakes` locks the viewport (`html.deep-mistakes-hold`) when the visitor scrolls or pages from Scene 13 into Scene 14, holding through the transition and a one-second reading pause. It carries Scene 13’s timing waveform across into `#s14-chart` while fading out the counted bits, brings in the Scene 14 copy and signal strip labels, and cascades the `#s14-replies` rows from top to bottom with calibrated optical blur. Using either scene’s controls, interacting with the signal strip, paging back, pressing Escape, jumping to a scene, or reducing motion restores the completed scene immediately.
- Scene 14 plots the second byte and its odd-parity check bit (`chk`) from the simulated card’s first ID reply as nine interactive cells. Visitors can click to toggle any bit cell or drag horizontally to jam or clear multiple cells, or use arrow keys (`Shift`+Arrow to jam, `Home`/`End`, `Backspace`/`Delete`, or `Clear`). Jamming more cells raises both the localized burst in each selected cell and the global channel noise from `0.0%` to `2.0%`, while keeping a quiet fallback reference capture so the signal strip remains interactive even if heavy noise drowns REQA. On the left, a tactile card-and-reader `Tap again` pad brings the card closer on hover and taps it unhurriedly against the reader with a compact checkmark/cross badge (`✓` or `×`) and coupling pulse while keeping the current jammed bits and revealing the trace, replies, and readout from top to bottom with optical blur. Below the pad sits an aligned `Checks` switch (`role="switch"`, `On`/`Off`) for parity and CRC validation; toggling `Checks` or jamming/clearing signal cells smoothly animates only the changed reply rows, flipped bits, outcome badge, and readout instead of flashing. `#s14-chart.errorTrace` exposes the plotted points, coordinate functions, chart box, bits, and jammed cell indexes; `#s14-replies [data-exchange="ANTICOLLISION"] .s14-bit` marks misread digits with `data-wrong`. Antigravity updated this scene and transition for the project team.
- `watchConversation` locks the viewport (`html.deep-conversation-hold`) when the visitor scrolls or pages from Scene 14 into Scene 15, holding through the transition and a one-second reading pause. A full-viewport Bit River of copper streamlines and `0`/`1` bits sampled from Scene 14’s visible digits sweeps from left to right, washing Scene 14’s text and reply list away before funneling into `#s15-chart`’s live river channel while Scene 15’s controls slide in on the left. Using controls, paging back, pressing Escape, jumping directly, or enabling reduced motion settles Scene 15 immediately.
- Scene 15 opens ready for the visitor to tap the card on the reader via an interactive drag-or-click card-to-reader model (`#s15-tap`), paired with a `role="switch"` `New ID every tap` toggle and the preserved `#s15-chart` Bit River and expandable `.chat` message log. Clicking `Steal a packet` (`#s15-steal`) extends a small animated hand from the button along a curved arm to snatch the red `UID` packet mid-flight out of the river, then brings it back to the button whose articulated jaw swings open to swallow it with bit crumbs while the phone automatically retries and selects the card. Antigravity updated this scene and transition for the project team.
- Every number comes from `js/rfid`. Scene 6 sweeps `physics.solve` across distance. Scene 8 sweeps frequency (`physics.sweep`) and finds the range by bisection (`physics.range`). Scene 9 traces field lines with the metal's mirror coil. Scene 10 runs the REQA command's real pauses through the chip's storage capacitor (200 µA drawn, reset below 1.8 V). Scene 11 plots a real exchange's samples. Scene 12 takes a Fourier transform (`fft`, written here) of a card's answer with and without the flicker. Scene 13 decodes a letter with a reader whose clock runs fast or slow. Scenes 14 to 16 run `reader.activate` on simulated channels: with noise and the checks on or off; with a packet stolen on the air (its samples wiped, so the check fails and the phone asks again); with up to three cards. Scene 17 plots the tag's tuning curve against the reader's frequency.

**Why it is built this way.** The brief asks for one idea taken as far as possible. Each scene takes away or changes one part of the same mechanism, so the explanation comes from what the visitor sees break. That is what the organisers' example says a winning entry would do. Part One keeps both headings rendered throughout the motion, so native scroll, direct section links, and reduced motion all leave the page readable.

**How to check it.** Serve the repository with `python -m http.server` and open `/take-apart/`. Start scrolling to see the word “blink” flash twice, followed by a single viewport blink into Part One. Continue into “Closer is stronger” to see the title flip and the plots draw line by line. Drag the card toward and away from the reader, tap in the diagram to place it, and test the arrow keys when it has focus. Change the coil size and watch both plots and the readout. Scroll into “It has to keep flipping” to see the words and track flow into place. Watch the two traces travel as one straight line, split onto the two baselines, and bend into waves before the guides draw. Scroll back toward Scene 6 to replay. Try the speed slider from a still magnet to the real reader frequency. Keep scrolling into “The tuning trick” to see the heading fold and the plots join into the resonance curve. Try both tags and click the capacitor itself to lift it out and put it back. Continue into “Why metal fights back” to see the copper curve curl and spread. Drag the metal close and check that the field drops and the chip falls asleep. Move it away with End or the button to restore the original readings. Scroll toward “Getting through the pauses” to follow the plate into the slider and watch the traces dip. Use Home on the slider to remove the capacitor and End to restore it at its largest size. Open `/#s9` and `/#s10` directly, then repeat at a narrow width and with reduced motion.

From Scene 10, page down and watch “pauses” depress while the viewport stays in place. Watch the chart, the word, and the rest of Scene 10 disappear at the ripple’s edge, then check that Part Two stays in place briefly before you can keep paging. Return to Scene 10 and tap “pauses” or focus it and press Enter. Both activate the link and move focus to the Part Two heading. Open `/#part-two` directly, and try the link with reduced motion to see the settled heading.

Scroll from Part Two into “Soaking up more, then less” and watch the heading close into a line, the trace draw, and the scene hold. Let the scanner finish its first pass. The white dot should follow the plotted line, and the scanner should resume from the left edge. On the next pass the new waveform should appear behind the line while the old trace stays ahead. Use Pause and Play to check playback. Tab to the answer switch and press Space twice in quick succession. The plot should change direction smoothly and finish in the selected state. Tab to the vertical Zoom control. Use Up and Down to adjust it and Home and End to check true size and ×30. Open `/#s11` directly with reduced motion to try Next and see immediate switch feedback.

Page down from Scene 11 into “Whispering next to a shout.” Watch the letters spiral into the new heading and the waveform narrow into the center of the spectrum while the viewport stays locked against wheel and momentum scroll. Once the spectrum opens, check the one-second hold. Tab to the fast flicker switch (`847.5 kHz`) and press Space to watch the spectrum morph smoothly to `Off` and compare the side peaks with the answer buried near the carrier. Open `/#s12` directly to see the complete chart. On a narrow screen the words come before the chart, and the frequency labels use two rows where space is tight.

Scroll from Scene 12 into “Keeping count” to see the viewport lock as the spectrum glides into the timing band and a copper cursor replaces it with digits and waveforms one column at a time. Change the letter and switch between `Dip for 1` and `Change in the middle` to watch the pill glide and the waveform and reader ticks morph smoothly. Drag the reader’s clock fader across `0%` between `−12% slow` and `+12% fast` to see the direction word flip and center notch pulse, then click `0%` (or double-click the track) to snap back to `0% exact`. Open `/#s13` directly and with reduced motion to see the complete chart.

Scroll into “Catching mistakes” from Scene 13 to see the viewport lock as the timing wave morphs into the copper ID signal and the reply rows cascade in from top to bottom with optical blur. Click or drag across the nine cells of the card’s ID signal to jam more bits and watch channel noise rise from `0.0%` to `2.0%`, check bits catch errors and trigger retries, or toggle cells off and click `Clear` to recover. Flip the `Checks` switch off to see the phone accept a wrong ID that the card refuses to confirm. Click `Tap again` to tap a new card ID under the same noise and watch the trace, reply rows, and readout reveal top-to-bottom. On direct `#s14` loads or with reduced motion, the scene appears settled immediately.

Scroll from Scene 14 into “The whole conversation” to watch a sweeping Bit River wash Scene 14 away and funnel into Scene 15’s channel while the viewport holds for one second. Drag or click the card onto the reader in the model box to launch the six-message conversation across the Bit River and clickable chat log. Click `Steal a packet` to watch the little hand reach up from the button, snatch the red `UID` packet out of the river, and feed it into the button’s chomping mouth while the phone retries and still selects the card. With reduced motion or direct links, the settled conversation renders immediately.

**How to join the introduction.** The original scene markup and styles are in `take-apart/index.html` and `take-apart/style.css`. The page uses the original `js/deep.js` and shared simulation. The root page forwards to this chapter while the introduction is being built. When the introduction takes over the root, its ending can link to `./take-apart/#take-apart`. If `js/scan.js` reveals that handoff, give its link `id="take-apart"` on the introduction page.

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
