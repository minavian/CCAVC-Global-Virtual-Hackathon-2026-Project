# RFID Technology

> Explain how RFID technology works, visualize the mechanism of RFID that is also interactable with accurate simulation, and deep dive.

**Live site:** https://hackathon.minavian.com/ccavc/RFIDtechnology/
**Checks, running in your browser:** https://hackathon.minavian.com/ccavc/RFIDtechnology/tests/

An interactive website about one everyday mechanism: how a contactless bank card, a transit card or a key fob, with **no battery**, talks to a reader. The visitor drags a card onto a reader, follows one tap step by step, then changes the distance, the angle, metal, the reader's power and the card's tuning, and sees what happens. Every number, curve and signal is worked out live in the browser by the project's own simulation. Made by team CCAVC for the Global Virtual Hackathon 2026.

## Contents

- [The idea](#the-idea)
- [A walk through the site](#a-walk-through-the-site)
  - [1. The landing page](#1-the-landing-page)
  - [2. Every day: three taps](#2-every-day-three-taps)
  - [3. What RFID is](#3-what-rfid-is)
  - [4. Here is how it works: one tap, step by step](#4-here-is-how-it-works-one-tap-step-by-step)
  - [5. Try it yourself: the lab](#5-try-it-yourself-the-lab)
  - [6. Take it apart: the deep dive](#6-take-it-apart-the-deep-dive)
  - [7. The section index](#7-the-section-index)
  - [Other pages](#other-pages)
- [What is computed, and how](#what-is-computed-and-how)
  - [The simulation (`js/rfid/`)](#the-simulation-jsrfid)
  - [The close-up and the lab (`js/intro/`)](#the-close-up-and-the-lab-jsintro)
  - [Real physics: the coil's real field lines](#real-physics-the-coils-real-field-lines)
  - [The rest of the page (`js/`)](#the-rest-of-the-page-js)
- [Key numbers](#key-numbers)
- [Project structure](#project-structure)
- [Run it locally](#run-it-locally)
- [The checks](#the-checks)
- [Publishing](#publishing)
- [Design decisions](#design-decisions)
- [Components we did not write](#components-we-did-not-write)
- [Documentation](#documentation)

## The idea

The site is built around one idea: **the reader is the battery.**

1. A contactless card has a coil of copper wire and a chip, and no battery.
2. The reader's coil carries an alternating current at 13.56 MHz. It makes a magnetic field that reaches the card.
3. That changing field makes electricity in the card's coil (Faraday's law). The card's coil and a small capacitor are tuned to 13.56 MHz, so even a weak field is enough. The chip wakes up.
4. The reader talks by switching its field off for a few millionths of a second at a time.
5. The card has no radio. It answers by **soaking up a little more, then a little less, of the reader's own field** (load modulation). The reader feels those changes in its own coil and reads them as the card's ID.

That's why you tap close and flat, why a card behind metal fails, and why two cards in one wallet can clash at a ticket gate. A first-time visitor should get the main idea within two minutes. Anyone who wants more can go as deep as the real standard (ISO/IEC 14443).

## A walk through the site

The main page (`index.html`) is one long page, read by scrolling, in this order.

### 1. The landing page

- **A top bar:** the site's mark and name on the left, and **Jump straight to the mechanism** on the right. The jump link is there from the first frame and goes straight to the tap, "Here is how it works".
- **Three everyday RFID objects** turn in 3D around the words, over a field of rings with a copper wave: a key fob, a phone and a contactless card. Drag sideways or use the arrow keys to turn them.
- **The headline:** "Those are the things you use every day, and almost nobody knows how it works…"
- **A bottom row:** a scroll cue, and the three objects' names (Key fob, Phone, Card). Press one to turn it to the front.

### 2. Every day: three taps

Three short 3D scenes, played one after another:
- a metro ticket taps a gate's reader, and the gate opens;
- a bank card taps a payment terminal, and the payment goes through;
- a car key's button is pressed, and the car opens.

### 3. What RFID is

A card intro played by scrolling:
- the card opens and lets out the letters R, F, I, D (Radio-Frequency Identification);
- a one-line definition;
- an X-ray of the card that shows its antenna and its chip;
- the question: "The card has no battery. So how does it talk?";
- then **"Here is how it works: Drag the card to the reader"**.

The page holds still here until the visitor reaches the tap's last step, so the mechanism is never skipped by accident. The section index can still jump past it.

### 4. Here is how it works: one tap, step by step

Drop the card on the reader (or let it play by itself). A 3D close-up of the card and the reader then plays the tap in nine steps, one plain sentence at a time:

| Step | On screen | What you see |
|---|---|---|
| 1 | Electricity runs round the reader's coil. | Light running round the reader's copper coil |
| 2 | That makes a magnetic field. | The field rising from the reader to the card |
| 3 | The field makes electricity in the card's coil. | Current in the card's coil, with nothing touching |
| 4 | That electricity powers the chip. | The chip lights up: "No battery. The reader is the battery." |
| 5 | Your turn. Ask the card who it is. | You press Ask; the reader switches its field off in tiny pauses |
| 6 | The card answers with its ID. | The answer flowing back as changes in the field |
| 7 | The reader checks the ID. | The check byte compared with the four ID bytes |
| 8 | Verified. Card detected. | The whole tap took about 5 milliseconds |
| 9 | Now you try. Change anything. | The lab opens (below) |

The two messages are real ISO/IEC 14443-3 frames, drawn bit by bit as the receiver sees them. While a message is on the air, its label shows what it says, its bits and how long it really takes.

**Controls in the close-up:**
- **Back / Next** step through the tap; the arrow keys do too.
- **Play / Pause** lets it play by itself.
- **X-ray** (on at first) shows the coils and the chip through the card and the reader.
- **Real physics** (off at first) replaces the simple field rings with the coil's real magnetic field lines (see [Real physics](#real-physics-the-coils-real-field-lines)). It turns on by itself when the play reaches its end.
- **Drag** to turn the view.

### 5. Try it yourself: the lab

When the tap reaches its last step, "That's how it works." shows for a moment and the **Try it yourself** panel opens. Everything in it comes from the simulation.

- **Readings:** the field at the card (A/m), the voltage at the chip, how far the card still works ("Works up to"), and how strong its answer is.
- **Charts** (drag on them to move the card):
  - **Distance:** voltage at the chip against distance, with where it must reach;
  - **Tuning:** voltage against frequency;
  - **Answer:** answer strength against distance;
  - **Map:** where around the reader the chip wakes.
- **Reader:** a card reader (payment pad) or a phone.
- **Sliders:** distance (0.5 to 10 cm), the card's angle (0 to 90°), metal behind the card, the reader's power (0 to 150%) and the card's tuning. The black stretch on each slider shows where the chip wakes.
- **Card's ID:** type any four bytes; the check byte updates.
- **Situations to try:** Normal tap, Too far, Side-on, On metal, Weak reader, Badly tuned, A copy.
- **Read ID** asks for the card's ID. It ends with the ID by the reader's chip, "Check byte OK · not a proof", because a copied card gives the same ID.
- **Check it's real** sends a random challenge. The card answers with a code made from its secret key. A genuine card gets the green check; "A copy" (same ID, no key) gets a red cross.
- **Reset**, and **The numbers behind it**: the coupling, the mutual inductance, the voltage induced in the card's coil, the card's resonant frequency, the reader's coil current and how much the answer changes it.

### 6. Take it apart: the deep dive

For anyone who keeps scrolling: 13 scenes, each one question with one thing to try, all computed from the same simulation. Each scene ends with the real name of what it shows.

**Part one, the power: how a field makes electricity**

| # | Scene | What you try | Real name |
|---|---|---|---|
| 1 | Closer is stronger | Drag the card closer or further, change the coil's size | Inductive coupling; a card must work from 1.5 to 7.5 A/m |
| 2 | It has to keep flipping | Change how fast the field flips, from still to 13.56 MHz | Faraday's law, V = ω · M · I |
| 3 | The tuning trick | Change the capacitor, compare a card and a key | Resonance, f = 1 / (2π√LC) |
| 4 | Why metal fights back | Bring metal closer behind the card | Eddy currents and detuning |
| 5 | Getting through the pauses | Change the chip's storage capacitor | 100% ASK pauses, modified Miller coding |

**Part two, the answer: how a chip with no radio talks back**

| # | Scene | What you try | Real name |
|---|---|---|---|
| 6 | Soaking up more, then less | Pause and zoom into the reader's coil current | Load modulation |
| 7 | Whispering next to a shout | Turn the chip's fast flicker on and off, and see the reader's signal sorted by pitch | The subcarrier, 13.56 MHz ÷ 16 = 847.5 kHz |
| 8 | Keeping count | Make the reader's clock run fast or slow | Manchester coding |
| 9 | Catching mistakes | Read the card with the error checks on or off | Odd parity bits and CRC_A |
| 10 | The whole conversation | Play a whole tap, message by message | REQA, ATQA, anticollision, UID, SELECT, SAK |
| 11 | Two cards in one field | Add cards and watch the reader pick one | Bit-wise anticollision ("card clash") |
| 12 | Why your phone can't read your car key | Pick the reader (a phone or the car's reader) and the tag (a car key or a card) | LF (125 kHz) and HF (13.56 MHz) |
| 13 | Passive vs. active: what a battery changes | Distance from 1 cm to 100 m, the reader's field and the tag's battery on or off | Near-field coupling (1/d³) vs. a battery radio (1/d²) |

### 7. The section index

A thin rail on the left edge, there once the landing's opening ends. It opens on hover (or a tap) into the page's sections: Start, One tap, and it just works, What RFID is, Try the card, Take it apart, and the 13 scenes. Picking one glides there.

### Other pages

| Address | What it is |
|---|---|
| `/tests/` | The simulation's and the lab's checks, running in the browser |
| `/take-apart/` | Forwards to the deep dive on the main page (`/#take-apart`) |
| `/bit-river/` | "Bit River": a standalone scene of a tap's bits flowing between card and reader |
| `/rfid/` | "RFID, opened up": a standalone explainer with its own physics engine, charts and 3D view (see [`rfid/README.md`](rfid/README.md)) |

**Address options:** add `?play` to the address (or press **P**) for presenter mode, where the page plays itself for a live demo. `?story` brings back an older key-fob story that is off by default.

## What is computed, and how

No result is prepared in advance or recorded. The page computes it from the visitor's inputs, with the project's own code. The only third-party code is the 3D library, which only draws (see [Components we did not write](#components-we-did-not-write)).

### The simulation (`js/rfid/`)

One simulation runs the close-up, the lab, the deep dive and the checks. It works in real units (metres, amperes, volts, henries, farads, hertz).

| File | What it does |
|---|---|
| `physics.js` | The reader's coil field, the mutual inductance between the coils (Maxwell's formula, with elliptic integrals), the voltage the card's tuned circuit gets (Faraday's law and LC resonance), whether the chip wakes, the effect of metal (modelled as a mirror image of the reader's coil with the current reversed), and how far each tag still works. It also has a 125 kHz car key, and a battery-powered active tag's radio link (the Friis equation). |
| `iso14443a.js` | ISO/IEC 14443 Type A at 106 kbit/s: frames, odd parity bits, the check byte (BCC), CRC_A, modified Miller coding of the reader's pauses, and Manchester coding on the 847.5 kHz subcarrier for the card's answer. |
| `tag.js` | The card's chip, following the standard's states (IDLE, READY, ACTIVE…). It only hears the bits it decodes from pauses in the field, and only answers by switching its load. |
| `reader.js` | The reader's receiver. It gets nothing but samples of the current in its own coil and works out from them what the card said; it never sees the card's memory. |
| `air.js` | Turns who did what, and when, into the samples the reader measures in its coil: the field dying away and coming back in each pause, the card's load changes, and noise. |
| `channel.js` | Joins a reader to the cards in its field, sends bits both ways, and records everything for drawing. A card whose stored energy runs out during a pause resets. |
| `lf.js` | The car key's 125 kHz answer, in the format of the EM4100 chip: a header, a 40-bit ID in rows with parity bits, repeated while it is powered. |

### The close-up and the lab (`js/intro/`)

| File | What it does |
|---|---|
| `main.js` | Runs the card intro and the close-up: the scroll, the drag and drop, the steps, the conversation, the lab panel, the charts and every number on them. |
| `timeline.js` | The intro's scroll timeline: which animation plays at which scroll position. |
| `hold.js` | Holds the page at "Here is how it works" until the tap's last step. |
| `cinema.js` | The tap's nine steps, their levels (what shows how strongly), their camera shots, and the two messages, built as real frames. |
| `card-scene.js` | The 3D close-up: the card, the reader and the phone, the camera, the X-ray. |
| `reader-model.js`, `reader-size.js` | The card reader in 3D, with its five-turn coil, and its sizes. |
| `phone-reader.js` | The phone as the lab's second reader, with its round NFC coil. |
| `effects.js` | What moves between the coils: the field rings, the current running round each coil, the chip's glow, the reach outline, and the real field lines. |
| `lab-model.js` | Turns the lab's controls into the simulation's inputs and its results into what the lab draws and says: the readings, the four charts, the situations, the proof's code. |
| `signals.js` | Draws each message's signal as the receiver feels it. |
| `coil-field.js` | The real field: Biot–Savart, field-line tracing and the metal plate's eddy currents (below). |
| `field-worker.js` | Traces the field lines in the background, so the page never stops while it works. |
| `easing.js` | The springs and easings every motion uses, so nothing jumps. |

### Real physics: the coil's real field lines

With **Real physics** on, the field is drawn as it really is, worked out from the coil's windings:

- **The field.** Each coil (the reader's five turns, the phone's four, the card's four) is cut into short straight pieces of wire. The Biot–Savart law gives each piece's field, and the field at a point is the sum of them all.
- **The lines.** They start at equal shares of the coil's magnetic flux, so they crowd where the field is strong. Each is traced by stepping along the field (fourth-order Runge–Kutta) until it comes back round through the coil. Their brightness follows the field's strength, which falls about as the cube of the distance.
- **The timing.** The field is not sent across: it is there everywhere at once and turns round 13.56 million times a second. On screen it turns round once every two seconds (27 million times slower), and the lines swing back and forth with it.
- **The card's power.** The lines that pass through the card's coil are drawn thicker and counted, for example "8 of 48 go through the card". Move the card away or turn it, and fewer go through.
- **Metal.** With the lab's metal plate behind the card, the plate acts as a perfect conductor (at 13.56 MHz the current in metal stays in a skin about 20 µm deep). Its eddy currents are solved on a grid of small squares so that no field passes through it. The lines then bend round the plate, and fewer reach the card.

### The rest of the page (`js/`)

| File | What it does |
|---|---|
| `landing.js` | The landing's opening animation, the three-object carousel and its 3D rendering. |
| `models.js` | Loads the team's 3D models (`models/*.glb`) and prepares them: the key fob, the phone and the card. |
| `lockscreen.js` | The phone's screen: an always-on clock that wakes into a lock screen. |
| `taps.js` | The three everyday taps (metro gate, payment terminal, car key). |
| `deep.js` | The deep dive's 13 scenes: each one's controls, chart and readout, computed from the simulation. |
| `deep-motion.js` | The deep dive's motion: moving from scene to scene, the scenes' transitions, and the section index. |
| `present.js` | Presenter mode (`?play` or **P**). |
| `full-motion.js` | Plays every animation whatever the visitor's "reduce motion" setting (the team's choice). |
| `story.js`, `lab.js` | The older key-fob story and its lab, off unless the address has `?story`. |
| `scan.js`, `scan-scene.js`, `scan-hand.js`, `scan-timing.js` | A hand-scan scene that no page loads at the moment. |

## Key numbers

All of these come out of the simulation, and the checks hold them in place.

| | |
|---|---|
| Reader frequency | 13.56 MHz |
| Field a card must work in (ISO/IEC 14443-2) | 1.5 to 7.5 A/m |
| Card reader's field at its centre | 7.5 A/m |
| A card works up to | 4.85 cm over the card reader, 2.38 cm over a phone |
| Power at a normal tap / to wake the chip | 13.9 mW / 5.1 mW |
| Chip's wake-up voltage | about 2 V (its limiter holds 3.3 V) |
| Reader's pauses | about 2.4 µs each, 100% ASK, modified Miller coding |
| Card's subcarrier | 13.56 MHz ÷ 16 = 847.5 kHz |
| Bit rate | 106 kbit/s |
| A whole tap | about 5 ms |
| Car key | 125 kHz (low frequency) |

## Project structure

```
index.html            the main page: every section above, in order
styles.css            the main page's styles (landing, taps, card intro, close-up, lab)
js/                   the main page's scripts (see the tables above)
  rfid/               the simulation: physics, protocol, card, reader, air, channel, car key
  intro/              the card intro, the close-up, the lab and the real field lines
take-apart/           the deep dive's styles (style.css), and a page forwarding to it
models/               the team's 3D models (.glb): card, key fob, phone, metro ticket, hand
images/intro/         the card and reader pictures of the card intro
tests/                the checks, for Node and for the browser
bit-river/            the standalone Bit River scene, with its own check
rfid/                 the standalone "RFID, opened up" page (own README)
vendor/               local copies of Three.js files and fonts, used by the Bit River page
hosting/              the domain's own root page and "not found" page
.github/workflows/    publishing to GitHub Pages
EXPLAINED.md          every part of the code, explained
SCRIPT.md             the site's script: the one idea, and the rules for its words
AGENTS.md             the team's working rules
```

## Run it locally

It is a static site: no build step, no install, no accounts and no API keys. The 3D models don't load from `file://`, so serve the folder with any static server, for example:

```
python -m http.server 8000
```

Then open http://localhost:8000/. Three.js is loaded from jsDelivr, so the first load needs an internet connection.

## The checks

```
node --test
```

This runs all 51 checks in Node (version 22.12 or newer), from the project's folder:
- **The simulation** (`tests/cases.js` through `tests/rfid.test.js`, 27):
  - the standard's own examples (CRC_A of known frames);
  - the coding surviving the pauses;
  - the reader decoding 100 random IDs from samples alone;
  - the reader never trusting a wrong ID in heavy noise;
  - two cards, the storage capacitor, the car key;
  - Faraday's law, the tuning peak, metal, the angle;
  - Maxwell's formula against the small-loop formula;
  - the active tag's inverse-square loss.
- **The lab** (`tests/lab-cases.mjs` through `tests/lab.test.mjs`, 11). It sweeps 7,776 settings to check that the lab never draws what isn't happening, and that the numbers it states are the physics' own.
- **The real field lines** (`tests/coil-field.test.mjs`, 10):
  - the field on a coil's axis and near a long wire, against the textbook formulas;
  - lines that close and follow the field;
  - a metal plate that lets almost no field through, and that no line crosses.
- **The Bit River** (`bit-river/river.test.mjs`, 3).

The simulation's and the lab's checks also run in the browser: open `/tests/`.

## Publishing

Every change merged into `main` goes live by itself. The GitHub Actions workflow (`.github/workflows/pages.yml`) copies the site into `ccavc/RFIDtechnology/`, adds the domain's root and "not found" pages from `hosting/`, and publishes it with GitHub Pages. If GitHub is slow to hand the files over, the deploy step retries up to three times. The site is served at **https://hackathon.minavian.com/ccavc/RFIDtechnology/**, through Cloudflare, with caching turned off so a change shows on the next page load. Notes (`.md` files) are not published.

## Design decisions

- **One idea, taken far.** Everything serves "the reader is the battery". The deep dive goes as far as the standard, one question per scene.
- **Plain words first.** One short sentence on screen at a time, in everyday words. Real names and numbers come in small print and in the deep dive (see `SCRIPT.md`).
- **Computed, not drawn.** Every number, curve and signal that reacts to the visitor comes from the simulation, and the reader decodes only the signal it receives.
- **Show before you tell.** The picture changes first, then the sentence names it.
- **No build step.** Plain HTML, CSS and JavaScript modules, so anyone can open the folder and read the code as it runs.
- **Full motion.** The site plays every animation whatever the visitor's "reduce motion" setting (`js/full-motion.js`; see `AGENTS.md`).

## Components we did not write

| Component | What it is used for | Why |
|---|---|---|
| [Three.js](https://threejs.org/) 0.170 | Drawing the 3D scenes (WebGL), loading the `.glb` models | Drawing 3D in WebGL by hand would be a large project of its own; Three.js only draws, and every value it shows comes from our code |
| Google Fonts (Inter Tight, Antonio, Instrument Serif, JetBrains Mono) | The site's type | Free, well-made fonts, served fast |
| GitHub Pages, Cloudflare | Hosting the site at a public address | Free, reliable static hosting, published straight from the repository |

The physics, the protocol, the card, the reader, the field solver, the charts and the animations are the project's own code. The 3D models were made by the team.

## Documentation

- [`EXPLAINED.md`](EXPLAINED.md): every part of the project, explained for a teammate who hasn't seen the code: what it does, how it works, why it is built that way, how to check it, and who wrote it.
- [`SCRIPT.md`](SCRIPT.md): the site's script, the one idea and the rules for its words.
- [`AGENTS.md`](AGENTS.md): the team's working rules (English only, branches, explaining every change, full motion).
- [`rfid/README.md`](rfid/README.md): the standalone "RFID, opened up" page.
