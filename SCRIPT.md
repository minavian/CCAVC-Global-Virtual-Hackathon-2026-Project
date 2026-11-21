# The script: the reader is the battery

Owner: Mina Vian · 2026-11-21 · Issue #14

## The one idea

Your bank card has no battery. The card reader powers it.

The reader's coil makes a magnetic field. That field makes electricity in a coil inside the card. The electricity wakes a tiny chip. The chip answers by soaking up a little more of the field, then a little less. The reader feels those changes and reads them as the card's ID.

That's RFID. Car keys, bank cards, phones and door badges all use it.

**The question nobody thinks to ask:** What powers my bank card?

**The site's answer:** The reader does.

**What a judge should be able to say after two minutes:**
> "A card has no battery. The reader's magnetic field powers its chip through a coil, and the chip answers by soaking up more or less of that field. I moved the key away, turned it and put metal behind it, and saw why you have to tap close and flat."

## How the site works

The site has two parts, and one simulation runs both.

1. **The first two minutes** (scenes 1–5): the idea, shown and played with.
2. **Take it apart** (scenes 6–17): for anyone who keeps scrolling. Each scene goes one layer deeper into the same idea. In each one, you remove a part or change one thing, and watch what breaks.

Our own code calculates everything you see react, live, from what you do. Nothing is a recorded animation. Every scene runs on the same simulation, so the site never contradicts itself.

**The three 3D models**, made by our teammate, each have a job:
- **The car key** is the tag in the first two minutes. It has a battery, and its RFID part doesn't use it, which makes the point hit hard.
- **The card** is the tag in "Take it apart". Its rules are a public standard, so everything we show can be checked.
- **The phone** is the reader in "Take it apart". It's the reader most people carry.

---

## Part 1: The first two minutes

### Scene 1 · Opening (0:00–0:10) · already built

**You see:** The headline pops in, word by word. The key, the phone and the card spin in and settle, with the key in front.

**On screen:**
> Those are the things you use every day.
>
> and almost nobody knows how it works…

### Scene 2 · Look inside (0:10–0:20)

**You see:** The three objects line up, and their shells turn to glass. Inside each one, a copper coil and a tiny chip glow. Each object gets two labels: `Coil` and `Chip`.

**On screen:**
> This is RFID: radio-frequency identification.
>
> Inside each one, the same two parts: a copper coil and a tiny chip.

### Scene 3 · No battery (0:20–0:40)

**You see:** The card and the phone step aside. The key grows and opens. Inside are its buttons, a coin battery, the coil and the chip.

**You do:** Drag the battery out. Scrolling pulls it out too, for anyone who doesn't drag.

**What happens:** The battery slides out. The buttons go dark. The coil and the chip keep glowing.

**On screen:**
> Drag the battery out.
>
> The buttons die. The coil and the chip don't care: they never used the battery.
>
> Your bank card has no battery at all. So what powers its chip?

### Scene 4 · The reader (0:40–1:10)

**You see:** A round reader pad rises, with a copper ring inside it. Two labels appear: `Reader` and `Tag`.

**You do:** Drag the key toward the reader.

**What happens:** As the key gets closer, each line lights up at the moment it really happens in the simulation:
> 1 · The reader's coil makes a magnetic field that keeps flipping.
>
> 2 · The field makes electricity in the key's coil.
>
> 3 · Enough electricity, and the chip wakes up.
>
> 4 · The chip answers by soaking up more of the field, then less.
>
> 5 · The reader feels those dips. They spell the key's ID.

**On the stage:**
- field lines pass through the key's coil;
- a meter shows the volts at the chip, with a `Wake-up` mark;
- the chip lights up when the volts cross the mark;
- a strip along the bottom shows the reader's signal, with small dips in it;
- the ID appears digit by digit, read from those dips.

Small print: `Simulation, slowed down.`

### Scene 5 · Break it (1:10–1:30)

**You do:** Pull the key away, turn it sideways, or slide a metal plate behind it. You can also swap in the card.

**What happens:** The chip goes dark, and one line says why:
> Too far: not enough field reaches the coil.
>
> Turned: the field slides past the coil instead of through it.
>
> Metal: it fights the field, so less of it reaches the coil.

**After all three, or after 20 seconds:**
> That's why you tap your card flat on the reader. The reader is the battery.
>
> Scroll on to take it apart.

If nobody touches anything for 4 seconds, a ghost hand pulls the key away and back once.

---

## Part 2: Take it apart

Each scene below has one thing to do, the point it makes, and its real name. The real names are for us, for the interviews. On screen they only appear in small print.

**Opening line:**
> Everything you just saw happens faster than a blink. Here it is, slowed down and taken apart.

From here on, the card is the tag and the phone is the reader.

### The power: how a field makes electricity

**6 · Closer is stronger**
- **Do:** Drag the card away from the phone. Change the size of the card's coil.
- **See:** A live graph shows the field strength and the volts at the chip, in real units, against distance, with the line where the chip wakes up.
- **The point:** The field fades very fast with distance. A bigger coil catches more of it, which is why the card's coil runs around its whole edge.
- **Real name:** inductive coupling.

**7 · It has to keep flipping**
- **Do:** Slow the field's flipping down, all the way to a still magnet.
- **See:** The volts drop with it. A still magnet makes no electricity at all.
- **The point:** Only a changing field makes electricity. The reader's field flips 13.56 million times a second.
- **Real name:** Faraday's law of induction; 13.56 MHz.

**8 · The tuning trick**
- **Do:** Take out the tiny capacitor next to the coil. Then put it back and turn the tuning dial.
- **See:** Without it, the volts collapse. With it, a curve peaks sharply at the reader's frequency.
- **The point:** The coil and the capacitor swing together, like a child on a swing pushed at just the right moment. Tuned right, a weak field is enough.
- **Real name:** resonance.

**9 · Why metal fights back**
- **Do:** Slide a metal plate closer to the card.
- **See:** Currents swirl in the metal. The field bends away, and the tuning curve slides off the reader's frequency.
- **The point:** Metal makes its own currents that push against the field, and it knocks the coil out of tune.
- **Real name:** eddy currents; detuning.

**10 · Getting through the pauses**
- **Do:** Watch the phone talk to the card. Then take out the chip's tiny storage capacitor.
- **See:** The phone talks by switching its field off for an instant. Each time, the chip coasts on saved energy. Without the capacitor, the chip blacks out and forgets everything.
- **The point:** A chip with no battery has to survive every pause, each a few millionths of a second long, on saved energy.
- **Real name:** 100% ASK pauses, modified Miller coding.

### The answer: how a chip with no radio talks back

**11 · Soaking up more, then less**
- **Do:** Switch the chip's answer on and off. Zoom into the reader's signal.
- **See:** Each time the chip switches on a tiny load, the reader's signal dips. Zoomed out, the dips are almost invisible.
- **The point:** The chip never sends anything. It changes how much of the field it soaks up, and the reader feels the difference in its own coil. Take the switch away and the reader hears nothing.
- **Real name:** load modulation.

**12 · Whispering next to a shout**
- **Do:** Turn off the chip's fast flicker.
- **See:** The reader's signal, sorted by pitch: one huge peak for the reader's own field, and two tiny peaks beside it for the card. With the flicker off, the card's answer sinks under the reader's peak.
- **The point:** The card's answer is tiny next to the reader's own field. So the chip flickers its dips 847,500 times a second. That moves its answer to a pitch the reader can pick out.
- **Real name:** the 847.5 kHz subcarrier.

**13 · Keeping count**
- **Do:** Type a letter, and switch between two ways of writing its bits.
- **See:** With "dip for 1, quiet for 0", a run of zeros is a flat line and the reader loses count. With "every bit changes in its middle", the count never slips.
- **Real name:** Manchester coding.

**14 · Catching mistakes**
- **Do:** Add noise, or pull the card away. Then turn the checks off.
- **See:** A dip drowns and a 1 becomes a 0. A check bit on every byte and a check number on every message catch the mistake, and the phone asks again. With the checks off, a wrong ID gets through, shown in red.
- **Real name:** parity bits; CRC.

**15 · The whole conversation**
- **Do:** Tap the card on the phone. Tap any message to read it.
- **See:** The six opening messages flow between the phone and the card as a river of bits: "Anyone there?", "Here!", "Tell me your ID.", the ID, "OK, I'll talk to you.", "Selected." The phone's screen shows them as a chat.
- **The point:** The phone works out every bit from the dips alone. It never peeks at the card's memory.
- **Gate line** (AkrisLuno's): "You're not supposed to see this… But just this once, we'll make an exception."
- **Real name:** ISO/IEC 14443-3: REQA, ATQA, anticollision, UID, SELECT, SAK.

**16 · Two cards in one field**
- **Do:** Drop a second card onto the phone.
- **See:** Both cards answer at once. Where their IDs differ, the reader hears a 1 and a 0 together: a clash. It picks one side, and the other card goes quiet.
- **The point:** That's why tapping a whole wallet can charge the wrong card.
- **Real name:** anticollision; "card clash".

**17 · Why your phone can't read your car key**
- **Do:** Put the car key on the phone.
- **See:** Nothing happens. Turn the tuning dial from scene 8 and you see why: the key is tuned to 134.2 kHz, and the phone's field flips at 13.56 MHz, about 100 times faster.
- **The point:** A reader and a tag have to be tuned to each other.
- **Real name:** low frequency (LF) and high frequency (HF).

**Last line:**
> Every tap does all of this, in less time than a blink.

---

## What makes this more than a demo

The organisers' own example entry lists what a winning entry would do better. We build all of it:

1. **Real physics, in real units.** Volts, field strength and frequency are all calculated live. We check the results against the standard's limits (a field of 1.5 to 7.5 A/m).
2. **Take it apart.** Every part can be removed: the tuning capacitor, the storage capacitor, the load switch, the flicker, the coding and the checks. The simulation shows what breaks.
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

## Build order

1. **The simulation engine:** the physics, the chip, the reader and the tests. Everything depends on it.
2. **Scenes 2–5.** Scene 1 already exists. Then give the site to someone who hasn't seen it, say nothing, and time them.
3. **Scenes 6–17**, in order.
4. **Extras, if there's time:** reading a real NFC tag with an Android phone, and an optional narrated mode.

## Facts and sources

- The card has no battery, and the reader's field powers it; the chip answers by load modulation. Sources: NIST SP 800-98; NXP NTAG21x datasheet, §8; NXP PN7462 datasheet, §8.10.4.
- Many cars still start when the key's battery is dead. Source: Mazda owner's manual, "Engine Start Function When Key Battery is Dead".
- Car-key chips are battery-free and run at 134.2 kHz. Source: the TI TMS37145 datasheet. Note: some key chips, this one included, answer in the reader's pauses instead of by soaking up the field. Our key shows the common way.
- 13.56 MHz, the 847.5 kHz subcarrier, Manchester coding, the reader's pauses, and the field limits of 1.5 to 7.5 A/m. Source: ISO/IEC 14443-2.
- The six opening messages, the parity bits, the CRC and anticollision. Source: ISO/IEC 14443-3.
- Card clash. Source: TfL's "card clash" page.
- Induction, resonance and eddy currents: any physics textbook.
