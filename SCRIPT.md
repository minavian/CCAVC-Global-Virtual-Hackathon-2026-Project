# The script: the reader is the battery

Owner: Mina Vian · 2026-11-21 · Issue #14

The main part (the idea, Part 1, Part 2) is what the visitor sees and reads. The reference sections after it are for the team: time budget, honesty notes, fallbacks, accessibility, phone layouts, tests, the interview crib, owners, the project page and the demo video, and sources.

## The one idea

Your bank card has no battery. The card reader powers it.

The reader's coil makes a magnetic field. That field pushes electricity around a coil inside the card. The electricity wakes a tiny chip. The chip answers by soaking up a little more of the field, then a little less. The reader feels its own field dip, and reads those dips as the card's ID.

That's RFID. Car keys, bank cards, phones and door badges all use it.

**The question nobody thinks to ask:** What powers my bank card?

**Two surprises the first two minutes must land:**
1. **Power comes through the air.** The reader is the battery.
2. **The chip answers without a radio.** It never transmits; it soaks up more of the reader's field, then less, and the reader feels it.

**What a judge should be able to say after two minutes:**
> "RFID is a reader and a tag. The tag has no battery: the reader's magnetic field pushes electricity around its coil and wakes the chip. The chip answers without a radio, by soaking up more or less of the field, and the reader reads those dips as an ID. I moved the key away, turned it and put metal behind it, and saw why you tap close and flat."

## How the site works

The site has two parts, and one simulation runs both.

1. **The first two minutes** (scenes 1–5): the idea, shown on the objects and played with.
2. **Take it apart** (scenes 6–17): for anyone who keeps scrolling. Each scene goes one layer deeper into the same idea. In each, you remove a part or change one thing, and watch what breaks.

Our own code calculates every number, line and dip that reacts to the visitor. A few things are drawn by hand, like the opening spin and the key coming apart; the reference section "Computed or drawn by hand" lists them all.

**The three 3D models**, made by our teammate, each have a job:
- **The car key** is the tag in the first two minutes. It has a battery, and its RFID part doesn't use it, which makes the point hit hard.
- **The card** is the tag in "Take it apart". Its rules are a public standard, so everything we show can be checked.
- **The phone** is the reader in "Take it apart". It's the reader most people carry.

**Throughout the film:**
- **Scrolling plays it**, like scrubbing a video; dragging lets you play with it. Scrolling back plays it backwards.
- **The chapter bar** at the bottom reads `Intro · Inside · No battery · Power · The answer · Break it`. Each name jumps to its scene. On phones it shows the current name and a dot for each of the others.
- **A visitor who doesn't scroll:** 5 seconds after the opening ends, the scroll cue pulses once and the words "Scroll to look inside" appear beside it.
- **Slowed-down time** always carries a badge saying by how much, for example `Shown about 170× slower`.

---

## Part 1: The first two minutes

The time budget for each scene is in the reference section "Time budget".

### Scene 1 · Opening (0:00–0:08) · already built

**You see:** The headline pops in, word by word. The key, the phone and the card spin in and settle, with the key in front. The key's lock button presses and its light glows.

**On screen:**
> Those are the things you use every day.
>
> and almost nobody knows how it works…

### Scene 2 · Look inside (0:08–0:18)

**You see:** The headline rises away. The three objects fall into a line with a small bounce. Their shells turn to glass, and inside each one a copper coil and a tiny chip glow, each with its label: `Coil` and `Chip`.

**On screen:**
> This is RFID: radio-frequency identification.
>
> Inside each one, the same two parts: a copper coil and a tiny chip.

### Scene 3 · No battery (0:18–0:38)

**You see:** The card and the phone step aside. The key comes forward, turns solid again and opens: its shells part, showing its buttons, a coin battery, the coil and the chip, each labelled. A dashed ring around the battery invites a drag. The buttons glow softly: they have power.

**You do:** Drag the battery out. Scrolling pulls it out too, for anyone who doesn't drag.

**What happens:** The battery slides away. The buttons' glow goes out. The coil and the chip keep their copper glow. Then the card glides back in, small and in glass, with its coil and chip glowing the same copper.

**On screen**, in three beats:
> Drag the battery out.

> The buttons die. The coil and the chip don't care: they never used the battery.
>
> In many cars, this key still starts the engine with a dead battery.

> Your bank card has no battery at all. So what powers its chip?

### Scene 4 · The reader, in two beats

#### 4a · Power through the air (0:38–1:00)

**You see:** The card leaves. The key closes, stays in glass (its battery still gone) and floats above the stage. A round reader pad rises beneath it, with a copper coil visible through its top. Two labels appear: `Reader` on the pad, `Tag` on the key.

**On screen first:**
> RFID has two halves: a reader, and a tag.
>
> Drag the key down to the reader.

**You do:** Drag the key toward the reader. Scrolling also lowers it, from 9 cm to 2.5 cm away.

**What happens, drawn on the objects, in order as the key comes closer:**
1. Field lines rise from the reader's coil and flow (slowed down). The ones passing through the key's coil turn copper, and more of them do as it comes closer.
2. Copper sparks run round the key's coil, faster the closer it gets: electricity.
3. A number on the chip counts the volts up, and a ring around the chip fills like a battery gauge.
4. At 3 volts, about 4 cm from the reader, the chip flashes awake.

**Each line appears at the moment its event happens:**
> The reader's coil makes a magnetic field that flips 125,000 times a second.
>
> Each flip pushes electricity around the key's coil.
>
> 3 volts: the chip wakes up.

**Then, large, the first surprise:**
> The reader is the battery.

#### 4b · The answer (1:00–1:18)

**You see:** Time slows down, and a badge says by how much. The view eases closer to the key and the reader. A tiny switch beside the chip starts to blink.

**What happens, drawn on the objects:**
1. Each time the chip closes its switch, the key's coil glows brighter and the field lines around it thicken: it is soaking up more of the field.
2. A ripple runs down the field lines to the reader's coil.
3. Under the pad, a trace of the reader's own current dips at each ripple. Above each bit's pair of halves, a `1` or a `0` appears.
4. The bits fly up into the reader's display and fill in the ID, digit by digit. When a whole message has arrived and its check bits pass, the display turns green: `3F 9A 12 C7 ✓`.

**You do:** Nothing is required. A visitor who pulls the key away mid-answer sees the dips stop.

**On screen:**
> Now it answers, without a radio.
>
> It soaks up more of the field, then less.
>
> The reader feels its own field dip. The dips are bits.

**Then:**
> ID read. That's the "identification" in RFID.
>
> Car start buttons, card terminals, office doors: all have readers like this.

**Small print:** `Simulation, shown about 170× slower. Computed live.`

### Scene 5 · Break it (1:18–1:37)

**You see:** Under the words, four controls appear: `Distance`, `Angle`, `Metal plate behind it`, and `Tag: Key · Card`. Beside them is a checklist: `Ways to break it: Too far · Turned · Metal`.

**You do:** Pull the key away, turn it sideways, or slide a metal plate behind it. You can swap in the card.

**Prompts**, the next one after each box is ticked:
> Now break it: pull the key away.
>
> Now turn it sideways.
>
> Now put metal behind it.

**Each result appears when it happens:**
> Too far: not enough field reaches the coil.
>
> Turned: the field slides past the coil instead of through it.
>
> Metal: it fights the field, so less of it reaches the coil.
>
> On the edge: some tries work, some don't.

The last one appears within about 15% of the wake-up voltage, where a real hand's millimetre of drift makes the chip flicker.

**The card swap:** the key glides out, and the card glides in, in glass. The reader's small print changes from `125 kHz` to `13.56 MHz`.
> A bank card works the same way, at 13.56 MHz: about 100 times faster.

**After all three boxes are ticked, or 20 seconds:**
> That's why you tap your card flat on the reader.
>
> Scroll on to take it apart.

**The ghost hand:** if nobody touches anything for 4 seconds in this scene, a soft grey outline of a hand appears on the key, lifts it 3 cm and brings it back once. The chip goes dark and wakes again. The hand fades, and the prompt returns.

---

## Part 2: Take it apart

**The cast on stage:** every scene shows the phone (the reader) on the left and the card (the tag) on the right, as clean line drawings traced from the 3D models, with their coils in copper. In scene 15, the conversation runs as a chat on the phone's screen.

**Each scene has:** a number and a question as its title, one or two lines of words, one thing to do, a picture computed from the simulation, a live readout, and the real name in small print.

**Opening line:**
> Everything you just saw happens faster than a blink. Here it is, slowed down and taken apart.

**Under it:**
> From here on, the card is the tag and the phone is the reader.

### The power: how a field makes electricity

**6 · Closer is stronger**
- **Do:** Drag the card away from the phone. Change the size of the card's coil.
- **See:** Two live graphs against distance: the field at the card (A/m), with the standard's 1.5 A/m minimum marked, and the volts its coil can give the chip, with the wake-up line. A dot marks where the card is.
- **On screen:** "The field fades very fast with distance. A bigger coil catches more of it, which is why the card's coil runs around its whole edge."
- **Numbers:** the card wakes up to 4.9 cm from a payment terminal and 2.4 cm from a phone.
- **Real name:** inductive coupling.

**7 · It has to keep flipping**
- **Do:** Slow the field's flipping down, all the way to a still magnet.
- **See:** The field through the coil as a wave and the voltage it makes as a second wave, both slowed. As the flipping slows, the voltage shrinks. A still magnet gives a flat field and 0 V.
- **On screen:** "Only a changing field makes electricity. The reader's field flips 13.56 million times a second."
- **Real name:** Faraday's law of induction.

**8 · The tuning trick**
- **Do:** Take out the tiny capacitor next to the coil. Put it back and turn the tuning dial. Switch between the card and the car key.
- **See:** The chip's volts across frequencies, peaking where the coil and capacitor are tuned, with the reader's frequency marked. The tuned curve stays as a faint dashed line.
- **On screen:** "The coil and the capacitor swing together, like a child on a swing pushed at just the right moment. A key's chip sips power and leans on that swing: without the capacitor it works only from 0.8 cm instead of 4 cm. A bank card's chip is hungrier, so tuning matters less: its range shrinks from 4.9 cm to 3.9 cm."
- **Numbers:** in our model, the key's chip draws about 75 µW and the card's about 5 mW.
- **Real name:** resonance, f = 1/(2π√LC).

**9 · Why metal fights back**
- **Do:** Slide a metal plate closer behind the card.
- **See:** Field lines in the plane through the reader's coil, bending away from the plate. Small copper loops swirl in the plate: the currents the field makes there. A small tuning curve beside it slides to the right as the plate comes closer.
- **On screen:** "Metal makes its own currents that push against the field, and it knocks the coil out of tune."
- **Numbers:** with the plate 4 mm behind, the card's range falls from 4.9 cm to 2.5 cm.
- **Real name:** eddy currents and detuning.

**10 · Getting through the pauses**
- **Do:** Watch the phone say "Anyone there?" to the card. Then take out the chip's storage capacitor.
- **See:** The phone's field with its pauses, and under it the chip's stored volts dipping at each pause. Without the capacitor, the volts fall through the reset line at the first pause.
- **On screen:** "The phone talks by switching its field off for an instant. A chip with no battery has to survive every pause, about 2.4 millionths of a second, on saved energy."
- **Real name:** 100% ASK pauses, modified Miller coding.

### The answer: how a chip with no radio talks back

**11 · Soaking up more, then less**
- **Do:** Switch the chip's answer switch off and on. Zoom into the reader's signal.
- **See:** The reader's coil current while the card says "Here!". At true size the dips are small; zoomed in, they are clear. With the switch off, the line is flat.
- **On screen:** "The chip never sends anything. It changes how much of the field it soaks up, and the reader feels the difference in its own coil."
- **Numbers:** at 4 cm, each dip is 4% of the reader's current.
- **Real name:** load modulation.

**12 · Whispering next to a shout**
- **Do:** Turn off the chip's fast flicker.
- **See:** The reader's signal sorted by pitch: one huge peak for the phone's own field, and two small peaks 847.5 kHz either side for the card. With the flicker off, the card's answer sits right beside the huge peak, inside its noise.
- **On screen:** "The card's answer is tiny next to the reader's own field. So the chip flickers its dips 847,500 times a second, which moves its answer to a pitch the reader can pick out."
- **Real name:** the subcarrier, 13.56 MHz ÷ 16.

**13 · Keeping count**
- **Do:** Type a letter. Switch between two ways of writing its bits. Make the reader's clock run a little fast or slow.
- **See:** The letter's 8 bits and then eight zeros, drawn as the signal, with tick marks where the reader counts and the bits it reads, green when right and red when wrong.
- **On screen:** "With 'dip for 1, quiet for 0', a long run of zeros is a flat line, and a reader whose clock runs fast loses count. With 'every bit changes in its middle', it never does."
- **Real name:** Manchester coding.

**14 · Catching mistakes**
- **Do:** Add noise, or pull the card away. Tap again. Turn the checks off.
- **See:** The bits the phone heard in each message, with wrongly heard bits in red, and the outcome.
- **On screen:** "A dip drowns and a 1 becomes a 0. A check bit on every byte and a check number on every message catch it, and the phone asks again. With the checks off, the phone accepts a wrong ID, and the card refuses to go on, because it knows its own ID."
- **Real name:** odd parity bits and CRC_A.

**15 · The whole conversation**
- **Gate line** (AkrisLuno's): "You're not supposed to see this… But just this once, we'll make an exception."
- **Do:** Tap the card on the phone. Tap any message to read its bytes. Steal a packet.
- **See:** The six opening messages flow between the phone and the card as capsules on a river of bits. The phone's screen shows them as a chat: "Anyone there?", "Here!", "Tell me your ID.", "My ID is …", "OK, I'll talk to you.", "Selected." A stolen packet turns red ("WARNING: Data packet missing!"), its check fails, and the phone asks again.
- **On screen:** "Every tap starts with the same six messages. The phone works out every bit from the dips alone. It never peeks at the card's memory."
- **Numbers:** the whole conversation takes about 2.3 ms; a blink takes at least 100 ms.
- **Real name:** ISO/IEC 14443-3: REQA, ATQA, anticollision, UID, SELECT, SAK.

**16 · Two cards in one field**
- **Do:** Drop a second card, or a third, onto the phone. Choose whether the phone picks 1s or 0s first.
- **See:** Each card's ID as bits. At the first bit where they differ, a red mark shows the clash. The phone asks only cards with its chosen bit there to go on, and the others fall silent. The winner is marked.
- **On screen:** "Both cards answer at once. Where their IDs differ, the reader hears a 1 and a 0 together: a clash. It picks one side, and the other card goes quiet. That's why tapping a whole wallet can charge the wrong card."
- **Real name:** bit-wise anticollision. Transport for London calls it "card clash".

**17 · Why your phone can't read your car key**
- **Do:** Put the car key on the phone, then on the car's reader. Swap in the card.
- **See:** The tag's tuning curve, from 30 kHz to 60 MHz, with the reader's frequency marked and the volts the chip gets there.
- **On screen:** "A reader and a tag have to be tuned to each other. The key is tuned to 125 kHz; the phone's field flips at 13.56 MHz, about 100 times faster."
- **Numbers:** the phone gives the key's chip about 8 mV; it needs 3 V.
- **Real name:** low frequency (LF) and high frequency (HF).

**The end:**
> Every tap does all of this, in less time than a blink.

Under it, a link to the checks page ("See the checks run"), the sources, and the team.

---

## What makes this more than a demo

The organisers' own example entry lists what a winning entry would do better. We build all of it:

1. **Real physics, in real units.** Volts, field strength and frequency are all calculated live and checked against the standard's limits (a field of 1.5 to 7.5 A/m).
2. **Take it apart.** Every part can be removed: the tuning capacitor, the storage capacitor, the answer switch, the flicker, the coding and the checks. The simulation shows what breaks.
3. **The reader only hears the signal.** The reader's code gets only the signal, never the card's data. Tests prove it decodes random IDs and fails cleanly in heavy noise.
4. **The real standard.** The card and the phone speak ISO/IEC 14443 Type A, bit for bit.

## What we left out, and why

To keep to one idea, we leave out:
- encryption;
- payments;
- long-range shop tags;
- tags with batteries;
- relay attacks.

Each of these is its own mechanism. A scene may mention one of them in a single line, never more.

---

# Reference for the team

## Time budget

Reading speed: about 200 words a minute (3.3 words a second), plus a second or two to look at each new picture. The counts are the on-screen words on the shortest path.

| Scene | Time | Words | Reading | Looking and doing |
|---|---|---|---|---|
| 1 Opening | 0:00–0:08 | 15 | 5 s | the opening plays itself |
| 2 Look inside | 0:08–0:18 | 19 | 6 s | 4 s |
| 3 No battery | 0:18–0:38 | 45 | 14 s | 6 s, including the drag |
| 4a Power | 0:38–1:00 | 48 | 15 s | 7 s, including the drag |
| 4b The answer | 1:00–1:18 | 45 | 14 s | 4 s |
| 5 Break it | 1:18–1:37 | 63 on the shortest path (85 with "On the edge" and the card) | 19 s | overlaps the reading |

The counts come from the lines marked `>` in Part 1.

**Milestones:**
- **0:20** the first hands-on moment (the battery);
- **1:00** the first surprise ("The reader is the battery");
- **1:15** the second (the answer without a radio);
- **1:37** the payoff;
- **8 s spare** to 1:45, and 23 s to 2:00.

**If the hallway test runs long, cut in this order:**
1. Scene 3's "In many cars, this key still starts the engine with a dead battery."
2. Scene 4b's "Car start buttons, card terminals, office doors: all have readers like this."
3. Scene 4a's "Drag the key down to the reader."; scrolling lowers it anyway.

**Never cut** the two halves line, "The reader is the battery", the three answer lines, or the "identification" line.

## Computed or drawn by hand

**Computed from the visitor's inputs:**
- every number;
- the field lines;
- the volts and the wake-up;
- the dips, the bits and the ID (decoded from the simulated signal);
- the reasons a read fails;
- every graph, conversation and clash in Part 2.

**Drawn by hand (decoration and staging):**
- the opening (the words popping, the objects spinning in);
- the key coming apart (the model's own Explode animation);
- the glass look;
- the copper glow;
- the ghost hand;
- the slow-down badge;
- the river's background digits in scene 15 (the capsules on it are the real messages).

## What we simplified

- **The coils** are treated as flat circles with the same area as the real ones.
- **The reader** holds its current steady, as regulated readers do.
- **The chip** is a resistor, with a limiter that soaks up extra power.
- **Metal** is a perfect conductor, handled with mirror images.
- **Noise** is plain random noise.
- **The key's message** uses the EM4100 format at 125 kHz. Real car keys differ by maker, and many add a secret handshake.
- **The card** has a 4-byte ID, and the conversation stops at SAK, where an app's own conversation would begin.
- **Time** is slowed down wherever a badge says so.

## When things fail

- **No 3D** (WebGL fails or the models don't load): scenes 1–3 show still pictures of the three objects with the same labels drawn on top. The lab runs on its 2D layer, with flat drawings of the key and the reader. The page never shows an empty stage.
- **Reduced motion:** camera moves become crossfades. Field lines are drawn still. The headline doesn't break apart; it fades. Every change of state (labels, volts, chip, dips, result) still shows.
- **Slow phones:** the 3D lowers its resolution while frames run slow and raises it again when they're fast. Part 2 only draws scenes on screen.
- **No JavaScript:** the words of every scene are real text in the page, so the page still reads as a short illustrated explanation.

## Accessibility

- **The battery** is a real button: Enter, Space or an arrow key pulls it out.
- **The key** is a slider ("Distance from the reader"). The arrow keys move it 2 mm, and Page Up and Page Down move it 1 cm. It announces, for example: "3.0 centimeters, chip awake".
- **A polite live region** reads each change: "Chip awake: 3.0 volts.", "ID read: 3F 9A 12 C7.", "Too far: not enough field reaches the coil."
- **Every control** has a visible label and a visible focus ring. The tag switch is a radio group with the legend "Tag".
- **Every canvas** has a text alternative and a live readout in words.
- **Labels on the 3D** are hidden from screen readers. One hidden sentence carries the same meaning, for example "Inside the key, the card and the phone: a copper coil and a chip."

## Phone layouts

- **Scenes 1–3:** words on top, objects below. Labels switch to the side with room.
- **Scenes 4–5:** words on top, showing only the current step's line. The reader and the tag are in the middle. The ID, the signal trace and the controls sit in a bottom panel. Dragging the key vertically changes the distance, and only the key captures the touch, so swiping anywhere else still scrolls.
- **Part 2:** one column: words, the picture, then the controls.

## The hallway test

1. Find three people who haven't seen the site.
2. Open the live link on their own device. Say nothing.
3. Start a timer. At 2:00, ask: "What is this about, and how does it work?"
4. **Pass:** they say at least two of the three: that the reader powers the tag; that the tag answers by soaking up the field; and that it only works close, facing the reader and away from metal.
5. Note where each one stalled or scrolled past. Fix the worst one, and test with someone new.

## Interview crib: questions any of us can answer

- **What's the idea?** A card has no battery; the reader's field powers it, and the chip answers by soaking up more or less of that field.
- **How does a field make electricity?** A changing magnetic field through a coil pushes current around it (Faraday). That's why the field has to keep flipping.
- **Why the capacitor?** It tunes the coil to the reader's frequency, so each flip pushes a little more (resonance). Frugal chips depend on it most.
- **How can a chip answer without a radio?** It switches a small load across its coil. That changes how much of the reader's field it soaks up, and the reader's own coil current dips.
- **Why the 847.5 kHz flicker?** It moves the card's tiny answer away from the reader's huge field and its noise, to a pitch the reader can filter for.
- **Why does every bit change in its middle?** So the reader never loses count, even on long runs of the same bit (Manchester coding).
- **How does a reader handle two cards?** They answer at once. Where their IDs differ, it hears a clash, picks one side, and asks again (anticollision).
- **What's computed, and what isn't?** See "Computed or drawn by hand".
- **How do you know the physics is right?** It's calibrated to the standard (1.5 A/m wakes the card, 7.5 A/m at the pad), and the tests check the standard's own CRC examples and Maxwell's formula against the small-loop formula.
- **Why is the reader code separate?** It only gets samples, like a real receiver. A test checks it never refers to the tag.
- **Why 125 kHz for the key?** It's a common car-key frequency, and the key's message uses the EM4100 format, which runs at 125 kHz.
- **What did you not make?** Three.js draws the 3D; the fonts are from Google Fonts; our teammate made the three models.

## Owners

| Part | Owner |
|---|---|
| Scenes 1–3 (film) | to be claimed |
| Scenes 4–5 (the lab) | to be claimed |
| Scenes 6–10 | to be claimed |
| Scenes 11–17 | to be claimed |
| The simulation and its tests | to be claimed |
| Project page and demo video | to be claimed |

## The project page

Its sections, in order, following the organisers' example:
1. **What you can do with it:** the first two minutes, then "Take it apart".
2. **How it works:** the coils, the chip, the answer, and the reader that only hears samples. Include a table of the six messages and their bits.
3. **Computed or drawn by hand** (copy the section above).
4. **What we simplified** (copy the section above).
5. **Where this falls short:** be honest about what's still missing when we submit.
6. **Things we didn't make ourselves, and why:**
   - **Three.js:** draws the 3D models in any browser, with nothing installed.
   - **Google Fonts:** consistent type.
   - **The 3D models:** made by our teammate, so name them here.
7. **Sources**, **how to run it** (`python -m http.server`), and **the code map**.

## The demo video (about 75 seconds)

| Time | Picture | Voice |
|---|---|---|
| 0:00 | The opening: the three objects | "Your car key, your bank card, your phone. They all use RFID." |
| 0:08 | Glass: coils and chips | "Inside each one, the same two parts: a coil and a chip." |
| 0:15 | Pulling the key's battery out | "The key's battery only runs its buttons. Your bank card has no battery at all." |
| 0:25 | The key dragged to the reader; the volts climb | "The reader's field pushes electricity around the coil. At 3 volts, the chip wakes. The reader is the battery." |
| 0:40 | The answer: the dips and the ID | "It answers without a radio: it soaks up more of the field, then less, and the reader reads the dips." |
| 0:52 | Breaking it: distance, angle, metal | "Too far, turned, or near metal, and it stops." |
| 1:00 | Take it apart: the spectrum, the chat, the clash | "Then take it apart: every part, computed live." |
| 1:10 | The checks page, all green | "A reader that decodes only the signal, and 24 checks that prove it." |

## Facts and sources

- **The card has no battery; the reader's field powers it; the chip answers by load modulation.** NIST SP 800-98, *Guidelines for Securing RFID Systems*; the NXP NTAG21x datasheet (RF interface); the NXP PN7462 datasheet (load modulation).
- **The card standard's numbers.** 13.56 MHz, the field from 1.5 to 7.5 A/m, the reader's pauses (modified Miller), and the card's 847.5 kHz subcarrier with Manchester coding: ISO/IEC 14443-2.
- **The card's conversation.** REQA, ATQA, anticollision, UID and BCC, SELECT, SAK, odd parity and CRC_A (with its worked examples): ISO/IEC 14443-3.
- **The key's message.** 64 bits: a header of nine 1s, ten rows of four bits with row checks, column checks, and a stop bit; at 125 kHz, 64 carrier cycles per bit. EM Microelectronic EM4100 datasheet.
- **Many cars still start when the key's battery is dead.** Mazda owner's manual, "Engine Start Function When Key Battery is Dead".
- **Some car-key chips are battery-free and run at 134.2 kHz,** answering in the reader's pauses. TI TMS37145 datasheet. We use 125 kHz and the plainer way.
- **Card clash.** Transport for London, "card clash".
- **Mutual inductance of two coaxial loops** (Maxwell's formula with elliptic integrals): F. W. Grover, *Inductance Calculations* (1946).
- **Mirror images in a conducting plane:** J. D. Jackson, *Classical Electrodynamics*.
- **A blink takes at least 100 ms.** To confirm before shipping: a published measurement, such as the Harvard BioNumbers database.
- **The chips' power (about 5 mW for the card, 75 µW for the key)** comes from our model's calibration, not a datasheet. Say so if asked.
- **Induction, resonance and eddy currents:** any physics textbook.
