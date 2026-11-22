# RFID reference

Source notes from the original project research.

- **The card has no battery; the reader's field powers it; the chip replies by load modulation.** NIST SP 800-98; the NXP NTAG21x datasheet (RF interface); the NXP PN7462 datasheet (load modulation).
- **The card standard's numbers.** 13.56 MHz, the field from 1.5 to 7.5 A/m, the reader's gaps (modified Miller) and the 847.5 kHz subcarrier with Manchester coding: ISO/IEC 14443-2.
- **The six messages, parity, CRC_A (with its worked examples) and anticollision:** ISO/IEC 14443-3.
- **The key's ID:** 64 bits (a header of nine 1s, ten rows of four bits with row checks, column checks, a stop bit), at 125 kHz with 64 carrier cycles per bit. EM Microelectronic EM4100 datasheet.
- **Some car-key chips run at 134.2 kHz and reply in the reader's gaps.** TI TMS37145 datasheet. We use 125 kHz and the plainer way.
- **Many cars still start with a dead key battery.** Mazda owner's manual, "Engine Start Function When Key Battery is Dead".
- **Card clash.** Transport for London, "card clash".
- **The mutual inductance of two coaxial loops:** F. W. Grover, *Inductance Calculations* (1946).
- **Mirror images in a conducting plane:** J. D. Jackson, *Classical Electrodynamics*.
- **The chips' power (about 5 mW for the card, 75 µW for the key)** comes from our model's calibration, not a datasheet. Say so if asked.
- **Induction, resonance and eddy currents:** any physics textbook.
