# RFID, opened up

An interactive web page that shows how a contactless card or key fob with **no battery** talks to a reader. It covers one mechanism in depth: **inductive power transfer plus load modulation** in 13.56 MHz RFID / NFC.

Visitors move a real 3D card, fob or phone, and every number they see is calculated live in the browser from the physics. The page is self-guided. Three short steps lead to the main surprise in under two minutes, and four deep dives go further:

> The card never sends a signal. It talks by switching a small load on and off, which nudges the reader's **own** coil voltage by a fraction of a percent. The reader decodes those nudges.

## Run it

It is a static site: no build step, no accounts, no API keys.

```powershell
python -m http.server 8000
```

Then open <http://localhost:8000>. Any static host works for a public URL (GitHub Pages, Netlify, Cloudflare Pages and so on): upload the folder as it is.

Check the physics engine from the command line (Node.js):

```powershell
node tools/check-physics.js
```

## What is on the page

| Section | What you can change | What is calculated |
|---|---|---|
| **Lab** (top) | drag the card in 3D, distance, tilt, sideways shift, card or fob, shop reader or phone, hold the chip's switch | energy reaching the chip, chip awake or asleep, reader coil voltage and its change, live read attempts with decoded text |
| **The trick** | (follows the lab) | live numbers inside the three-step explanation |
| **Distance** | double or halve the distance, find a dead spot, tilt | energy vs distance for all four device pairs, energy vs sideways position, the energy cliff |
| **Tuning** | the card's resonant frequency, put the card right on top | chip voltage vs drive frequency (resonance, over-coupling split) |
| **The switch** | switch strength, hold the switch | live circuit values, reply size vs distance, where the chip starves |
| **Letters** | the message, random hiss, slow wobble, subcarrier on/off | bits with parity and check byte, sampled reader signal, decoder output, 500-read success rate |
| **Questions** | "spy" distance | power needed to wake a card from far away |
| **Under the hood** | | inductances and tuning capacitors per device, a live self-check against Maxwell's exact formula |

## Files

```
index.html          page structure and all text
css/style.css       layout and look (responsive down to phone width)
js/physics.js       the RFID engine (all mechanism code; runs in browser and Node)
js/charts.js        small canvas plotting helper (no library)
js/app.js           shared state, guided steps, read loop, charts and readouts
js/scene3d.js       3D view (three.js): models, glow, field lines, dragging
models/             card.glb, fob.glb, phone.glb
tools/check-physics.js   command-line checks of the engine
```

## How the engine works (`js/physics.js`)

1. **Geometry.** Each coil is a set of turns: rectangles for the card, fob and shop reader, and a 24-sided ring for the phone's NFC antenna. Sizes are measured from the antenna parts inside the 3D models.
2. **Coupling.** Mutual inductance M is the loop integral of the reader's vector potential around the tag's wire: M = ∮ A·dl. A straight segment has an exact vector potential, A = μ₀I/4π · ln((r₁+r₂+L)/(r₁+r₂−L)). The integral uses Gauss–Legendre quadrature. Self-inductance uses the same method, with the path pulled in by the wire radius. Checked against Maxwell's exact formula for coaxial circles (0.15 % difference).
3. **Circuits.** Complex phasors at 13.56 MHz. The reader is a series-resonant RLC driven by a source. The tag is its coil plus a tuning capacitor in parallel with the chip (modelled as a resistor). The reader current is I₁ = Vs / (Z₁ + (ωM)²/Z₂) and the chip voltage is |jωM I₁ Z_L / Z₂|. The chip's protection clamp is found by searching for the extra load that holds 4.5 V.
4. **Load modulation.** The circuit is solved with the chip's switch open and closed (an extra resistor across the chip). The change in the reader's coil voltage is the reply. If the average chip voltage while talking drops below 85 % of the wake-up voltage, the chip "browns out".
5. **Data.** Letters become bytes with odd parity plus an XOR check byte (ISO/IEC 14443-A style), coded as Manchester on an 847.5 kHz subcarrier at 106 kbit/s. The reader signal is sampled at 6.78 MHz with Gaussian hiss and a slow sinusoidal wobble. The decoder compares the subcarrier energy (I/Q correlation) of the two halves of each bit, or the average levels in plain mode, then runs the parity and check-byte tests.
6. **Field lines** in the 3D view are traced with RK4 through the Biot–Savart field of the reader coil and seeded at equal flux, so their density means something.

Calibrated values: shop reader 3 turns 66 × 66 mm, Q 10, 104 mA; phone ring Ø 60 mm, 2 turns, Q 8, 86 mA. Chip: 1 kΩ, wakes at 2.0 V, clamps at 4.5 V. The resulting ranges are 6.5 cm (card, shop reader), 3.7 cm (fob, shop reader), 4.0 cm (card, phone) and 2.2 cm (fob, phone).

## Simplifications

Open air only (no metal, ferrite or hands). The chip is a resistor. The reader has a fixed drive and detects amplitude only. Only one tag at a time. The reader-to-card command direction is not shown.

## Third-party components

- [three.js](https://threejs.org) r170 (MIT), loaded from jsDelivr. It renders the 3D view and loads the glTF models. It performs no RFID calculations.
- Inter and JetBrains Mono fonts (Google Fonts, SIL Open Font License).
- 3D models of a contactless card, a key fob and a smartphone (Oppo Find X9 Ultra), each with its antenna modelled inside.
