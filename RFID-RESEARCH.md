# RFID Field Lab

## What to understand first

1. **One field can carry power and data.** In passive high-frequency RFID, the powered reader sends an alternating magnetic field. A loop antenna in the card picks up energy from that field, and the chip uses that energy to reply. That is why a thin contactless card can work without a battery. [NXP tag datasheet](https://www.nxp.com/docs/en/data-sheet/NTAG213_215_216.pdf)
2. **The shape of the interaction is an engineering choice.** Short-range contactless cards and phones make the tap deliberate. Passive ultra-high-frequency RFID can inventory many items across a larger read zone. Reader, tag, antenna, frequency and protocol have to fit the job. [NFC Forum technology overview](https://nfc-forum.org/learn/NFC-technology/), [GS1 UHF Gen2 standard](https://ref.gs1.org/standards/gen2/)
3. **A read is the start of a decision.** A captured identifier can select an asset record. Authentication can provide evidence that a credential is genuine. An application or payment system decides what action to authorize. Keeping those steps distinct explains why a checkout tap, a door badge and an inventory read can feel similar while doing different jobs. [NIST RFID security guidance](https://csrc.nist.gov/pubs/sp/800/98/final), [EMVCo Contactless Chip](https://www.emvco.com/emv-technologies/emv-contactless-chip/)

## Two-minute demo script

**0:00–0:15 | Hold up a contactless card.**

> This card can answer a reader without a battery. Where does it get the power to answer? I’ll show you what happens inside the tap.

**0:15–0:50 | Select Credit card, turn on X-ray, and click Play Scan.**

> This is RFID Field Lab, a browser simulation. Here is the antenna loop around the card and the chip connected to it. In a real contactless card, the reader’s magnetic field induces a voltage in that loop. The chip turns that into power. Then it changes the electrical load on the loop in a pattern the reader can detect. One field carries the power and the reply.

**0:50–1:20 | Move the card away and select the phone.**

> The same gesture can do different jobs. A phone can act like a reader or emulate a contactless card, depending on what you’re doing. At checkout, the radio carries the exchange, and the payment protocol generates a one-time security code for the transaction. Reading something and deciding whether to trust it are two different steps.

**1:20–1:50 | Return to the card.**

> At checkout, you want a deliberate tap. At a warehouse doorway, you might want to see many tags as a shipment passes. Engineers choose different RFID systems for those jobs. Our lab makes the first design visible. Try the card yourself and see where the power comes from and how the reply gets back.

**Rehearsal cue.** Open the scene in advance and leave the card selected. Pause briefly on the exposed antenna and on the reader status. Keep the key fob available for questions about compatibility.

## Technical notes for judge questions

### What happens electrically during a tap?

In the passive 13.56 MHz example, the reader coil creates an alternating magnetic field. Magnetic flux through the tag loop induces an alternating voltage. The tag antenna and capacitance form a resonant circuit, and a rectifier inside the chip turns the received signal into DC for its electronics. During a reply, the chip switches its load. Through the coupling between the coils, the reader detects those small changes and decodes the response. The scene’s animated connection illustrates communication. A real magnetic field extends through space around the coil. [NXP tag datasheet, §8](https://www.nxp.com/docs/en/data-sheet/NTAG213_215_216.pdf), [NXP reader antenna design guide](https://community.nxp.com/pwmxy87654/attachments/pwmxy87654/nfc/3055/1/AN1445-2010%2520-%2520Antenna%2520design%2520guide%2520for%2520MFRC52x%2C%2520PN51x%2C%2520PN53x.pdf)

### Why can a tap fail?

Separation, tilt and sideways offset change how much magnetic flux links the coils. Nearby conductive metal can induce eddy currents that reduce the useful field and alter antenna tuning. A ferrite layer can help limit the influence of metal in designs built for it. Range belongs to the specific reader–tag combination and its surroundings. The NFC Forum gives a typical NFC range of up to 2 cm. NXP specifies up to 50 mm as a typical operating distance for the MFRC522 under antenna-dependent conditions. Neither figure comes from the Field Lab animation. [NFC Forum technology overview](https://nfc-forum.org/learn/NFC-technology/), [NXP MFRC522 datasheet, §3](https://www.nxp.com/docs/en/data-sheet/MFRC522.pdf), [NXP reader antenna design guide](https://community.nxp.com/pwmxy87654/attachments/pwmxy87654/nfc/3055/1/AN1445-2010%2520-%2520Antenna%2520design%2520guide%2520for%2520MFRC52x%2C%2520PN51x%2C%2520PN53x.pdf)

### Would a single reader work with the card, phone and key fob?

Only if it supports the frequency, radio protocol and application each interaction requires. A phone can read compatible NFC tags or emulate a contactless card. Apple Pay uses an NFC controller and Secure Element. Automotive fobs vary. One NXP component combines a 125 kHz wake-up receiver, a low-frequency security transponder and an ultra-high-frequency transmitter. Texas Instruments documents a 134.2 kHz immobilizer transponder. The three objects in the scene are illustrative models with a shared simulated reader. [NFC Forum technology overview](https://nfc-forum.org/learn/NFC-technology/), [Apple Pay component security](https://support.apple.com/en-gb/guide/security/sec2561eb018/web), [NXP keyless-entry chip](https://www.nxp.com/products/security-and-authentication/secure-car-access/passive-keyless-entry-chip%3ANCF29AG-H), [TI immobilizer transponder](https://www.ti.com/product/TMS37145)

### How does a warehouse reader hear many tags?

In passive UHF Gen2, the reader sends RF energy and the tags reply by varying how strongly their antennas reflect the signal, a technique called backscatter. To inventory a group, the reader starts an inventory round and sets a parameter called Q. Each participating tag picks a slot from a window of 2^Q slots. The reader progresses through slots, so tags get separate chances to reply. Slots can still be empty or have overlapping replies. More inventory opportunities help resolve collisions while consuming time. The standard covers 860–930 MHz. Actual deployments use locally permitted channels and settings. [GS1 UHF Gen2 standard, §6](https://ref.gs1.org/standards/gen2/), [GS1 system architecture](https://ref-pd.gs1.org/architecture/system-architecture/)

### What do UID, EPC and NDEF mean?

A UID is an identifier used by contactless chip protocols, and some chips support random IDs. An EPC can identify a tagged object, such as a serialized product, while UHF Gen2 TID memory describes the tag IC and can include a chip serial number. NDEF is an NFC data format for a payload such as a URL. Those terms describe different layers of a read. An identifier by itself provides no cryptographic proof of authenticity. As one hardware example, MIFARE DESFire EV3 supports AES-based security and mutual authentication. [NXP UID application note](https://www.nxp.com/docs/en/application-note/AN10927.pdf), [GS1 UHF Gen2 standard](https://ref.gs1.org/standards/gen2/), [NFC Forum technology overview](https://nfc-forum.org/learn/NFC-technology/), [NXP DESFire EV3](https://www.nxp.com/products/MF3DHx3)

### What can a real deployment infer from a read?

A reader observed a tag in its read zone at a particular time. The application can combine that observation with a workflow to infer an event such as receiving stock. One antenna may see tags across a doorway or miss a tag that actually passed. The practical distinction is between the reader’s location at the time of the observation and the location where the business expects the item to be afterward. GS1 EPCIS models these as a read point and a business location. In a retail field study, one experiment reported approximately 26% lower inventory record inaccuracy. A second experiment found that the effect varied by product category. This is published retail evidence for a specific workflow. [GS1 EPCIS implementation guideline, §4.6.3](https://ref.gs1.org/guidelines/epcis-cbv/2.0.0/), [Hardgrave et al., retail field experiments](https://doi.org/10.1111/poms.12010)

## What judges can verify

| Claim | Evidence they can inspect |
| --- | --- |
| The lab reveals the hidden parts of three familiar objects. | Open the scene, select a device and use With Content or X-ray. The checked-in device list and circuit construction are in the prototype source. |
| A simulated read depends on proximity. | Try moving the card toward the reader and away again. The source checks distance in scene coordinates and reports success after 0.60 seconds in range. That delay is an animation parameter. |
| The underlying mechanism is grounded in real hardware. | The NFC Forum describes the interaction. NXP’s NTAG21x datasheet §8 identifies the loop, rectifier and protocol interface in a real tag. The modeled card is a teaching illustration. |
| A real hardware test would quantify reliability. | Use a documented reader and matching demo tag. Record trial counts and successful reads at controlled distances, angles and mounting surfaces. |

[Prototype source pinned to the reviewed commit, with device and circuit definitions](https://github.com/minavian/CCAVC-Global-Virtual-Hackathon-2026-Project/blob/b82db9cf376dd664d35998dadc51c98208b8f5fd/index.html#L579-L612), [simulated read logic](https://github.com/minavian/CCAVC-Global-Virtual-Hackathon-2026-Project/blob/b82db9cf376dd664d35998dadc51c98208b8f5fd/index.html#L774-L789), [NXP tag datasheet](https://www.nxp.com/docs/en/data-sheet/NTAG213_215_216.pdf)

## A small follow-up experiment

For physical validation, use a known 13.56 MHz reader and a compatible test tag such as an NTAG213. Establish a baseline with the tag centered and parallel to the reader. Mark several gaps, then vary one factor at a time. Compare parallel and tilted positions, and a nonconductive mount with the same tag placed against metal. Use a simple jig or spacer to keep placement consistent. At each setting, reset the tag position between attempts, allow a fixed one-second read window and log successes over a fixed number of attempts, such as 20. Report the raw counts, hardware models and conditions. For an inventory use case, test a separate UHF setup and report the fraction of expected tags captured, unintended tags seen and time per pass. These are proposed tests. The checked-in prototype is a visual simulation, and this research includes no bench measurements. [NXP NTAG213 specifications](https://www.nxp.com/products/NTAG213_215_216), [Auburn RFID Lab benchmarking](https://rfid.auburn.edu/arc/about.php)

For educational validation, give viewers two questions before and after the demo. Ask where an unpowered card gets its energy and what a successful read establishes. Record the sample size and the number of correct answers for each question. That gives the team a way to measure what the lab teaches.
