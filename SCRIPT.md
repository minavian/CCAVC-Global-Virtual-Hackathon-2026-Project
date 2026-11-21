# The script: the reader is the battery

Owner: Mina Vian · 2026-11-21 · Issue #14

The visitors are ordinary people, not engineers. So the site says one plain sentence at a time, and shows the thing that sentence names.

## The one idea

Your bank card has no battery. The card reader powers it, through a magnetic field. The chip answers by taking more power, then less. The reader feels those changes and reads them as the card's ID.

**The two surprises the first two minutes must land:**
1. **The reader is the battery.**
2. **The chip replies without a radio.** It just takes more power, then less.

**What a visitor should be able to say after two minutes:**
> "A reader powers the chip with a magnetic field. The chip replies by taking more power, then less, and the reader reads that as an ID. That's why you tap close and flat."

## The rules for words

1. **One sentence on screen at a time.** Each new sentence replaces the last one. There's never a list to read.
2. **Eight words or fewer**, in plain words. Say *reader*, *chip*, *coil*, *magnetic field*, *electricity*, *power*.
3. **No jargon on the main path.** Never kHz, MHz, volts, bits, modulation, protocol or subcarrier. Numbers and real names go in small print, in Part 2 only.
4. **Same place every time.** On a computer, the sentence sits in the left column; on a phone, in a band at the top.
5. **Nothing covers a model.** Labels sit beside the objects, joined by a thin line. A label appears only while the sentence names its part. Meters and displays have their own places: the power bar left of the tag, the ID display and the "what the reader feels" trace under the reader.
6. **Show before you tell.** The picture changes first, and the sentence follows.
7. **Never say the same thing twice.**

## How the site works

The site has two parts, and one simulation runs both.

1. **The first two minutes** (scenes 1–6): the idea, shown on the objects and played with.
2. **Take it apart** (scenes 7–18): for anyone who keeps scrolling. One question per scene, one thing to try.

Our own code calculates every number, line and change that reacts to the visitor. A few things are drawn by hand, like the opening spin and the key coming apart; the reference section "Computed or drawn by hand" lists them.

**The three 3D models**, made by our teammate:
- **The car key** is the tag in the first two minutes.
- **The card** is the tag in "Take it apart".
- **The phone** is the reader in "Take it apart".

**Throughout the film:**
- **Scrolling plays it**, like scrubbing a video. Dragging lets you play with it. Scrolling back plays it backwards.
- **The chapter bar** at the bottom: `Intro · Inside · No battery · Power · Reply · Break it`. On phones it shows the current name and a dot for each of the others.
- **A visitor who doesn't scroll:** 5 seconds after the opening, the scroll cue pulses and says "Scroll".

---

## Part 1: The first two minutes

Each row is one moment. "On screen" is the only sentence showing at that moment.

### Scene 1 · Opening (0:00–0:08) · already built

| When | On screen | Picture |
|---|---|---|
| The page opens | Those are the things you use every day. | The words pop in. The key, phone and card spin in and settle. |
| The objects land | and almost nobody knows how it works… | The key's lock button presses and its light glows. |

### Scene 2 · Inside (0:08–0:16)

| When | On screen | Picture |
|---|---|---|
| The visitor scrolls | They all use RFID. | The three objects drop into a row. |
| Scrolling on | Inside each one: a coil and a chip. | Their shells turn to glass. Each coil and chip glows copper. Labels: `Coil`, `Chip`. |

### Scene 3 · No battery (0:16–0:34)

| When | On screen | Picture |
|---|---|---|
| The key comes forward and opens | The key has a battery. | The card and phone step aside. The key opens. Only the label `Battery` shows. A dashed ring around it invites a drag. |
| A moment later | Pull it out. | The ring pulses. |
| The battery is out (dragged, or pulled by scrolling) | The buttons stop working. | The battery slides away. The `Buttons` label appears and their soft glow goes out. |
| Next | The coil and chip don't need it. | `Coil` and `Chip` labels. They keep their copper glow. |
| Next | Your bank card has no battery at all. | The card glides back in, small, in glass, its coil and chip glowing. |
| Next | So what powers its chip? | Hold. |

### Scene 4 · Power (0:34–0:54)

| When | On screen | Picture |
|---|---|---|
| The visitor scrolls | This is a reader. | The card leaves. The key closes, still in glass, battery gone. A round reader pad rises beneath it. Label: `Reader`. |
| Next | Move the key to the reader. | A faint outline above the pad shows where to bring it. The key can be dragged; scrolling also lowers it. |
| The key comes within reach | The reader makes a magnetic field. | Field lines rise from the reader's coil and flow (slowed down). The lines through the key's coil turn copper. |
| Closer | The field makes electricity in the coil. | Copper sparks run round the key's coil, faster as it comes closer. The power bar beside the key fills. |
| The bar crosses its line (about 4 cm away) | Enough power wakes the chip. | The chip flashes white. |
| A beat later, large | The reader is the battery. | Hold. |

### Scene 5 · Reply (0:54–1:12)

| When | On screen | Picture |
|---|---|---|
| The visitor scrolls | Now the chip replies. | Time slows; a small badge reads `Slowed down`. The view eases closer to the key and the reader. |
| Next | It has no radio. | Hold on the chip. |
| Next | It takes more power, then less. | A tiny switch beside the chip blinks. With each blink, the key's coil glows brighter, then dimmer. |
| Next | The reader feels each change. | Under the pad, a line labelled `What the reader feels` dips with each blink. |
| Next | The changes spell the key's ID. | The dips fly up into the display under the reader, filling in `3F 9A 12 C7` piece by piece. |
| The ID is complete and checked | That's the "ID" in RFID. | The display turns green, with a tick. |

### Scene 6 · Break it (1:12–1:30)

These moments follow what the visitor does, not the scroll. Three buttons appear under the sentence: `Turn it`, `Add metal`, `Use a card`. Dragging the key still moves it.

| When | On screen | Picture |
|---|---|---|
| The scene starts | Now break it. | The buttons appear. |
| Next | Pull the key away. | The key can be dragged up. |
| The chip goes dark from distance | Too far. Not enough power. | The power bar falls below its line. The chip goes dark. The dips stop. |
| The visitor brings it back | Turn it sideways. | The `Turn it` button pulses. |
| The chip goes dark from turning | Turned. The field misses the coil. | The key turns side-on. The field lines slide past the coil. |
| Next | Put metal behind it. | The `Add metal` button pulses. |
| The chip goes dark from metal | Metal pushes the field away. | A metal plate slides in behind the key. The field lines bend away. |
| Just at the edge of reach | Almost too far. It flickers. | The chip flickers. |
| The visitor presses `Use a card` | A bank card works the same way. | The key glides out; the card glides in, in glass. |
| All three found, or 20 seconds | That's why you tap close and flat. | Hold. |
| Next | Scroll to take it apart. | The scroll cue returns. |

**The ghost hand:** if nobody touches anything for 4 seconds in this scene, a soft grey outline of a hand lifts the key and brings it back once. The chip goes dark and wakes again.

**Small print** under the stage, through scenes 4–6: `Simulation, computed live.`

---

## Part 2: Take it apart

Every scene shows the phone (the reader) on the left and the card (the tag) on the right, as clean line drawings traced from the 3D models, with their coils in copper.

Each scene has:
- **a question** as its title;
- **one thing to try**, as a short command on the button or slider;
- **one picture**, computed from the simulation;
- **one answer sentence**, which appears after the visitor tries;
- **a live readout** in plain words;
- **the real name and numbers** in small print.

**Opening:**
> That took a fraction of a second. Here it is, slowed down.

### The power

**7 · Why must it be close?**
- **Try:** Move the card away.
- **Picture:** a graph of power against distance, with the wake-up line.
- **Answer:** The field gets weak fast. A bigger coil catches more.
- **Readout:** "2 cm: awake." / "5 cm: asleep."
- **Small print:** inductive coupling. The card wakes up to 4.9 cm from a payment terminal, 2.4 cm from a phone.

**8 · Why does the field keep flipping?**
- **Try:** Slow the flipping down.
- **Picture:** the field as a wave, and the electricity it makes as a second wave.
- **Answer:** Only a changing field makes electricity. A still magnet makes none.
- **Readout:** "Fast: plenty of electricity." / "Still: none."
- **Small print:** Faraday's law of induction. The real field flips 13.56 million times a second.

**9 · What is the capacitor for?**
- **Try:** Take the capacitor out. Switch between the key and the card.
- **Picture:** the power the chip gets at each speed of flipping, with a peak where it is tuned.
- **Answer:** It tunes the coil to the reader, like pushing a swing in time.
- **Readout:** "Key: works up to 0.8 cm instead of 4 cm." / "Card: 3.9 cm instead of 4.9 cm."
- **Small print:** resonance, f = 1/(2π√LC). The key's chip needs far less power (about 75 µW against 5 mW in our model), so it depends on tuning more.

**10 · Why does metal stop it?**
- **Try:** Slide the metal closer.
- **Picture:** field lines bending away from the plate, with small loops of current swirling in it.
- **Answer:** Metal makes its own currents. They push the field away.
- **Readout:** "Metal 4 mm behind: works only under 2.5 cm."
- **Small print:** eddy currents and detuning.

**11 · How does the reader talk to the chip?**
- **Try:** Take out the chip's power store.
- **Picture:** the reader's field with its tiny gaps, and the chip's stored power dipping at each one.
- **Answer:** The reader talks in tiny gaps. The chip saves power to get through them.
- **Readout:** "The chip heard: Anyone there?" / "The chip lost power and forgot."
- **Small print:** 100% ASK pauses of about 2.4 µs, modified Miller coding.

### The reply

**12 · How does the chip reply?**
- **Try:** Switch the chip's reply off. Zoom in.
- **Picture:** what the reader feels while the card replies.
- **Answer:** The chip changes how much power it takes. The reader feels it.
- **Readout:** "Each change is 4% of the reader's power." / "Reply off: nothing to feel."
- **Small print:** load modulation.

**13 · How can the reader hear such a tiny reply?**
- **Try:** Turn off the flicker.
- **Picture:** the reader's signal sorted by pitch: one huge peak (the reader), two small ones (the card).
- **Answer:** The chip flickers its reply, so it stands apart from the reader's own field.
- **Readout:** "Flicker on: the reply stands apart." / "Flicker off: the reply is buried."
- **Small print:** the 847.5 kHz subcarrier (13.56 MHz ÷ 16).

**14 · How does the reader keep count?**
- **Try:** Type a letter. Switch the way it's written.
- **Picture:** the letter's 1s and 0s as a signal, with the reader's counting marks.
- **Answer:** Every 1 and 0 changes in the middle, so the reader never loses count.
- **Readout:** "Counted right." / "Lost count: 14 zeros instead of 13."
- **Small print:** Manchester coding.

**15 · What if a bit goes wrong?**
- **Try:** Add noise. Turn the checks off.
- **Picture:** the 1s and 0s the reader heard, with wrong ones in red.
- **Answer:** Check numbers catch mistakes. The reader just asks again.
- **Readout:** "Caught a mistake, asked again." / "Checks off: wrong ID accepted. The card refused it."
- **Small print:** odd parity bits and CRC_A. The card also checks its own ID when it is chosen.

**16 · What do they actually say?**
- **Gate line** (AkrisLuno's): "You're not supposed to see this… But just this once, we'll make an exception."
- **Try:** Tap the card. Tap a message to see its bytes. Steal a message.
- **Picture:** the messages flowing between the phone and the card. The phone's screen shows them as a chat:
  > Anyone there? / Here! / What's your ID? / My ID is … / OK, you. / Ready.
- **Answer:** Every tap starts with the same six messages.
- **Readout:** "Done in 2.3 thousandths of a second." / "A message was lost, so the phone asked again."
- **Small print:** ISO/IEC 14443-3: REQA, ATQA, anticollision, UID, SELECT, SAK.

**17 · What if two cards answer?**
- **Try:** Add a second card.
- **Picture:** both cards' IDs as 1s and 0s, with the first clash marked in red.
- **Answer:** The reader picks one. That's how a wallet tap can charge the wrong card.
- **Readout:** "Clash at the 17th bit. Card 2 won."
- **Small print:** bit-wise anticollision; Transport for London calls it "card clash".

**18 · Can a phone read a car key?**
- **Try:** Put the key on the phone. Then on the car's reader.
- **Picture:** the key's tuning peak, and where the reader flips.
- **Answer:** No. They are tuned to different speeds.
- **Readout:** "Phone: almost no power reaches the key's chip." / "Car's reader: awake."
- **Small print:** the key is tuned to 125 kHz; the phone flips at 13.56 MHz, about 100 times faster.

**The end:**
> Every tap does all of this, in about two thousandths of a second.

Under it: "See the checks run", the sources, and the team.

---

## What makes this more than a demo

The organisers' own example entry lists what a winning entry would do better. We build all of it:

1. **Real physics, in real units**, checked against the standard's limits (a field of 1.5 to 7.5 A/m).
2. **Take it apart.** Every part can be removed: the tuning capacitor, the power store, the reply switch, the flicker, the coding and the checks.
3. **The reader only hears the signal.** Tests prove it reads random IDs from the signal alone and fails cleanly in heavy noise.
4. **The real standard.** The card and the phone speak ISO/IEC 14443 Type A, bit for bit.

## What we left out, and why

To keep to one idea, we leave out:
- encryption;
- payments;
- long-range shop tags;
- tags with batteries;
- relay attacks.

Each is its own mechanism.

---

# Reference for the team

## Time budget

Reading speed: about 200 words a minute (3.3 words a second), plus a second or two to look at each new picture. Each sentence stays until the next moment arrives.

| Scene | Time | Words on the shortest path | Reading | Looking and doing |
|---|---|---|---|---|
| 1 Opening | 0:00–0:08 | 15 | 5 s | the opening plays itself |
| 2 Inside | 0:08–0:16 | 12 | 4 s | 4 s |
| 3 No battery | 0:16–0:34 | 32 | 10 s | 8 s, including the drag |
| 4 Power | 0:34–0:54 | 33 | 10 s | 10 s, including the drag |
| 5 Reply | 0:54–1:12 | 30 | 9 s | 9 s |
| 6 Break it | 1:12–1:30 | 42 (54 with "Almost too far" and the card) | 13 s | 5 s |

Every on-screen sentence in Part 1 has eight words or fewer (counted from the "On screen" column).

**Milestones:**
- **0:20** the first hands-on moment (the battery);
- **0:50** the first surprise ("The reader is the battery");
- **1:10** the second (the reply without a radio);
- **1:30** the payoff;
- **15 s spare** to 1:45, and 30 s to 2:00.

**Never cut:** "The reader is the battery", "It takes more power, then less", "The reader feels each change", "That's the 'ID' in RFID".

## Computed or drawn by hand

**Computed from the visitor's inputs:**
- every number;
- the field lines;
- the power bar and the wake-up;
- the reply's changes and the ID (decoded from the simulated signal);
- the reason a read fails;
- every graph, conversation and clash in Part 2.

**Drawn by hand (decoration and staging):**
- the opening (words popping, objects spinning in);
- the key coming apart (the model's own animation);
- the glass look and the copper glow;
- the ghost hand;
- the slow-down badge;
- the background flow in scene 16 (the messages on it are real).

## What we simplified

- **The coils** are treated as flat circles with the same area as the real ones.
- **The reader** holds its power steady.
- **The chip** is treated as a simple load that takes power, and stops taking more once it has enough.
- **Metal** is a perfect conductor.
- **Noise** is plain random noise.
- **The key's ID** uses the EM4100 format at 125 kHz. Real car keys differ by maker, and many add a secret handshake.
- **The card's conversation** stops at "Ready", where an app's own conversation would begin.
- **Time** is slowed down wherever the badge says so.

## When things fail

- **No 3D:** scenes 1–3 show still pictures of the three objects with the same labels. The lab uses flat drawings of the key and the reader. The page never shows an empty stage.
- **Reduced motion:** camera moves become crossfades, and field lines are drawn still. Every change of state still shows.
- **Slow phones:** the 3D lowers its resolution while frames run slow. Part 2 only draws the scene on screen.
- **No JavaScript:** every sentence is real text in the page.

## Accessibility

- **The battery** is a button: Enter or Space pulls it out.
- **The key** is a slider, "Distance from the reader". The arrow keys move it, and it announces, for example, "3 centimeters, chip awake".
- **`Turn it`, `Add metal` and `Use a card`** are real buttons.
- **A polite live region** reads each new sentence.
- **Every control** has a visible label and a focus ring.
- **Every canvas** has a text alternative, and a readout in words.

## Phone layouts

- **Every scene:** the one sentence sits in a band at the top. The objects sit in the middle and are never covered.
- **Scenes 4–6:** the power bar is left of the key. The ID display and the "what the reader feels" trace are under the reader. The buttons sit in a row at the bottom. Only the key captures touch, so a swipe anywhere else still scrolls.
- **Part 2:** one column: question, picture, try, answer.

## The hallway test

1. Find three people who haven't seen the site.
2. Open the live link on their own device. Say nothing.
3. Start a timer. At 2:00, ask: "What is this about, and how does it work?"
4. **Pass:** they say at least two of the three: that the reader powers the chip; that the chip replies by taking more and less power; and that it only works close and flat.
5. Note every sentence they skipped or misread. Cut it or make it plainer, and test with someone new.

## Interview crib: questions any of us can answer

- **What's the idea?** A card has no battery: the reader's field powers it, and the chip replies by taking more and less power from that field.
- **How does a field make electricity?** A changing magnetic field through a coil pushes current around it (Faraday). That's why the field keeps flipping.
- **Why the capacitor?** It tunes the coil to the reader's frequency (resonance). Low-power chips depend on it most.
- **How can a chip reply without a radio?** It switches a small load across its coil. It takes more of the reader's field, and the reader's own coil current dips (load modulation).
- **Why the 847.5 kHz flicker?** It moves the card's tiny reply away from the reader's huge field and its noise (the subcarrier).
- **Why does every bit change in its middle?** So the reader never loses count, even on long runs of the same bit (Manchester coding).
- **How does a reader handle two cards?** It hears where their IDs clash, picks one side, and asks again (anticollision).
- **How do you know the physics is right?** It's calibrated to the standard (1.5 A/m wakes the card, 7.5 A/m at the pad). The tests check the standard's own CRC examples, and Maxwell's formula against the small-loop formula.
- **Why is the reader code separate?** It only gets the signal, like a real receiver. A test checks it never touches the tag.
- **What did you not make?** Three.js draws the 3D; the fonts come from Google Fonts; our teammate made the three models.

## Owners

| Part | Owner |
|---|---|
| Scenes 1–3 | to be claimed |
| Scenes 4–6 | to be claimed |
| Scenes 7–12 | to be claimed |
| Scenes 13–18 | to be claimed |
| The simulation and its tests | to be claimed |
| Project page and demo video | to be claimed |

## The project page

1. **What you can do with it.**
2. **How it works**, with a table of the six messages.
3. **Computed or drawn by hand** (copy the section above).
4. **What we simplified** (copy the section above).
5. **Where this falls short:** what's still missing when we submit.
6. **Things we didn't make ourselves, and why:**
   - **Three.js:** draws 3D in any browser, with nothing to install.
   - **Google Fonts:** for the type.
   - **The 3D models:** our teammate made them; name them here.
7. **Sources**, **how to run it** (`python -m http.server`) and **the code map**.

## The demo video (about 60 seconds)

| Time | Picture | Voice |
|---|---|---|
| 0:00 | The opening | "Your key, your card, your phone. They all use RFID." |
| 0:07 | The battery pulled out | "The key's battery only runs its buttons. Your card has no battery at all." |
| 0:15 | The key brought to the reader | "The reader's magnetic field makes electricity in the coil. The reader is the battery." |
| 0:27 | The reply, and the ID | "The chip has no radio. It takes more power, then less. The reader reads that as an ID." |
| 0:40 | Breaking it | "Too far, turned, or near metal, and it stops." |
| 0:48 | Take it apart | "Then take it apart: every part, computed live." |
| 0:55 | The checks, all green | "And 24 checks that prove it." |

## Facts and sources

- **The card has no battery; the reader's field powers it; the chip replies by load modulation.** NIST SP 800-98; the NXP NTAG21x datasheet (RF interface); the NXP PN7462 datasheet (load modulation).
- **The card standard's numbers.** 13.56 MHz, the field from 1.5 to 7.5 A/m, the reader's gaps (modified Miller) and the 847.5 kHz subcarrier with Manchester coding: ISO/IEC 14443-2.
- **The six messages, parity, CRC_A (with its worked examples) and anticollision:** ISO/IEC 14443-3.
- **The key's ID:** 64 bits (a header of nine 1s, ten rows of four bits with row checks, column checks, a stop bit), at 125 kHz with 64 carrier cycles per bit. EM Microelectronic EM4100 datasheet.
- **Some car-key chips run at 134.2 kHz and reply in the reader's gaps.** TI TMS37145 datasheet. We use 125 kHz and the plainer way.
- **Many cars still start with a dead key battery.** Mazda owner's manual, "Engine Start Function When Key Battery is Dead". (Used in the project page; cut from the film to keep it short.)
- **Card clash.** Transport for London, "card clash".
- **The mutual inductance of two coaxial loops:** F. W. Grover, *Inductance Calculations* (1946).
- **Mirror images in a conducting plane:** J. D. Jackson, *Classical Electrodynamics*.
- **The chips' power (about 5 mW for the card, 75 µW for the key)** comes from our model's calibration, not a datasheet. Say so if asked.
- **Induction, resonance and eddy currents:** any physics textbook.
