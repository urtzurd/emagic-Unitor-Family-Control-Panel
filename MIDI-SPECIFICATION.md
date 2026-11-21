# emagic Unitor8 / AMT8 / MT4 SysEx specification

Unofficial. Consolidated from:

| Tag | Source                                                                                                    |
|---|-----------------------------------------------------------------------------------------------------------|
| **W** | Kurt Arnlund's notes: <https://www.potm.org/software/Unitor/mididata/> (one Unitor8 firmware only, no MT4) |
| **P** | Reverse engineering of Arnlund's `Unitor 8-64.prefPane` (Unitor8/AMT8 only)                               |
| **D** | Reverse engineering of Apple's `EmagicUSBMIDIDriver` (UnitorMIDIDriver.dmg)                               |
| **T** | Hardware tests: MT4 firmware 1.0.7, AMT8 firmware 2.0.2. The Unitor8 is untested.                         |
| **X** | Reverse engineering of emagic's Windows software: "Unitor8 Control.exe" (Jan 2002, unpacked from the `u8setup.exe` installer), the bundled "Unitor8 Update 1.3.1.mid", and the Windows drivers v2.27 |

All values are hex. `[x]` marks a variable byte.

---

## 1. Message format

```
F0 00 20 31 64 [cmd] 00 [box] [data...] F7
```

| Byte | Value | Meaning |
|---|---|---|
| 1–3 | `00 20 31` | emagic manufacturer ID |
| 4 | `64` | Unitor family ID |
| 5 | `[cmd]` | Command (table below) |
| 6 | `00` | Always `00`. The prefPane treats it as part of a two-byte header such as `10 00`. |
| 7 | `[box]` | Target unit (sent) or sending unit (received) |

No checksums are used (W).

### Box byte: `0rbbbggg`

| Bits | Meaning |
|---|---|
| `r` (bit 6) | `1` = ROM (boot) mode, `0` = EEPROM (normal) mode |
| `bbb` (bits 3–5) | Box number in a chain, 0–7 |
| `ggg` (bits 0–2) | Model: `000` Unitor8, `001` AMT8, `010` MT4 (in replies) |

- `00` targets the first unit. The panel sends `00` everywhere except the mode commands.
- `7F` targets all units.
- Chained units are addressed as `box << 3`: `08`, `10`, … `38` (W, P).
- Read the model with `box & 07`, because the other bits may be set (P).
- The prefPane retries the version request in ROM mode (`40 | box << 3`) when a unit doesn't answer (P).
- emagic's own software builds every header the same way: `7F` for all units, otherwise `box << 3` (X).

### Value encoding

Most values are 8-bit and split into two 4-bit halves, high half first:

```
0x24  ->  02 04
0xFE  ->  0F 0E
```

---

## 2. Commands

| Cmd | Direction | Name | Reply | Sources |
|---|---|---|---|---|
| `03` | → unit | Scan / box number request | `04` | W P T |
| `04` | ← unit | Scan reply | — | W P T |
| `05` | → unit | Box number change | ? | P (format not decoded) |
| `0B` | → unit | Version request | `7B` | W P D T X |
| `7B` | ← unit | Version reply | — | W P T X |
| `0C` | → unit | Begin EEPROM write (Unitor8 only) | echo | X |
| `0D` | → unit | Click input setup (Unitor8) | none | W P X |
| `0E` | → unit | Panic | none | P X |
| `0F` | → unit | Set Computer Mode | none | W D T X |
| `10` | → unit | Patch Select / Set Patch Mode | none | W P D T X |
| `11` | → unit | Write patch routing (IO map) | none | W P T X |
| `12` | → unit | Request patch routing | `7A` | W P T X |
| `7A` | ← unit | Patch routing reply | — | W P T |
| `13` | → unit | Store to constant area (write settings) | none | W P T X |
| `14` | → unit | Request constant area (read settings) | `79` | W P T X |
| `79` | ← unit | Constant area reply | — | W P T |
| `7D` | → unit | EEPROM data chunk (Unitor8 only) | echo | X |
| `7E` | ← unit | EEPROM write error | — | X |
| `7F` | → unit | End EEPROM write (Unitor8 only) | echo | X |

The Unitor8's SMPTE and sync settings are applied with a second header, `F0 00 00 33 02 0D [box << 3] … F7` (S&S Research ID, 22 bytes). See §5.

- On byte 8, W gives `27` = striping on and `25` = striping off.
- X builds this message from the computer block (§5) whenever a sync setting changes.
- The individual fields haven't been decoded.

---

## 3. Detection

### Scan (`03` → `04`)

```
→ F0 00 20 31 64 03 00 7F F7
← F0 00 20 31 64 04 00 40 F7        (Unitor8/AMT8)
```

### Version (`0B` → `7B`)

The firmware version comes back as ASCII digits, and the reply's box byte identifies the model.

```
→ F0 00 20 31 64 0B 00 00 F7
← F0 00 20 31 64 7B 00 01 32 30 32 F7    AMT8, "202" = 2.0.2
← F0 00 20 31 64 7B 00 02 31 30 37 F7    MT4,  "107" = 1.0.7
```

**MT4 (T):** send the scan and version request back to back with no delay, or the MT4 doesn't answer.

### How emagic's software scans (X)

1. It sends `03 00 7F` once.
2. For each box 0–7 it sends `0B 00 [box << 3]`.
3. If the box answers, the software sends `0B 00 [40 | box << 3]` to read the **boot ROM version** as well.
4. The model is read from the reply as `box byte & 07`, and the version from the three ASCII digits that follow.

**Version limits (X):**
- Unitor8 firmware 1.0.6 and older can't edit the Computer, Patch or Click setup.
- With 1.0.6 and older in a chain, the units must be switched on in order, from the computer to the end of the chain.
- If no unit answers, the user is asked to press "Panic/Patch" on the first unit and retry.

---

## 4. Patch routing (`11`, `12`, `7A`)

The units hold 32 patches, numbered `00`–`1F` (patch − 1).

```
Request: F0 00 20 31 64 12 00 00 [patch] F7
Reply:   F0 00 20 31 64 7A 00 00 [patch] 00 [routing...] F7
Write:   F0 00 20 31 64 11 00 00 [patch] 00 [routing...] F7
```

### Routing data

Each output takes two bytes, starting with Output 1. The two bytes are a bitmap of the inputs routed to that output: bit 0 = In 1 … bit 7 = In 8.

| Model | Inputs | Outputs | Routing bytes |
|---|---|---|---|
| Unitor8 / AMT8 | 8 | 8 | 16 |
| MT4 | 2 | 4 | 8 written; the panel reads the first 8 of the reply |

### Examples

Read patch 1:

```
→ F0 00 20 31 64 12 00 00 00 F7
```

Write patch 6 with In 1 → Out 1 and In 2 + In 8 → Out 2, nothing else:

```
F0 00 20 31 64 11 00 00 05 00  00 01  08 02  00 00 00 00 00 00 00 00 00 00 00 00  F7
```

The factory default routes every input to every output except its own number. Out 1 is `0F 0E`, Out 2 is `0F 0D`, and so on:

```
0F 0E 0F 0D 0F 0B 0F 07 0E 0F 0D 0F 0B 0F 07 0F
```

---

## 5. Settings: the constant area (`13`, `14`, `79`)

Settings are stored at two-byte addresses (`[hi] [lo]`) and survive a power cycle (T). A block is read and written from a start address, giving a count of locations minus one. Each location is one two-byte value.

```
Read:   F0 00 20 31 64 14 00 00 [addr-hi] [addr-lo] [count-1] F7
Reply:  F0 00 20 31 64 79 00 00 [addr-hi] [addr-lo] [count-1] [hi lo] × count F7
Write:  F0 00 20 31 64 13 00 00 [addr-hi] [addr-lo] [count-1] [hi lo] × count F7
```

- **Reply layout:** the header is 11 bytes, so the value at address `start + n` is at byte offset `11 + 2n`.
- **Reply lengths:** they match `12 + 2 × count`. W measured 140 bytes for a `3F` (64-location) read and 76 bytes for `1F`.
- **Single-value writes:** these use count `00`. The panel uses them for every setting (T), and so does emagic's Windows software (X).
- **Block writes (P):** the prefPane writes a whole block back in one message.
  - Computer block: `13 00 [box] 01 00 3D [62 values] F7`
  - Patch block: the same layout with start address `02 00`
  - A block write must also send back the values the editor doesn't change, such as the active patch.

### Blocks

The Windows software defines exactly five blocks (X):

| Name in emagic's software | Start | Locations | Read message |
|---|---|---|---|
| Global Setup | `00 00` | 32 | `14 00 00 00 00 1F` |
| Computer Mode Setup | `01 00` | 64 | `14 00 00 01 00 3F` |
| Patch Mode Setup | `02 00` | 64 | `14 00 00 02 00 3F` |
| Click Input Setup (Unitor8) | `03 00` | 65 | `14 00 00 03 00 40` |
| MT4 Global Setup | `04 40` | 64 | `14 00 00 04 40 3F` |

### Address map

| Block | Address | Setting | Models | Sources |
|---|---|---|---|---|
| `00 00` | `00 07` | I/O LED brightness | all | W P T X |
| | `00 08` | RS LED brightness | all | W P T X |
| | `00 02`, `00 04`, `00 06`, `00 0B`–`00 0E` | Written by the 1.3.1 update file before updating (values `51`, `47`, `48`, `45 46 41 42`); meaning unknown | Unitor8 | X |
| `01 00` | `01 00`–`01 07` | Computer mode filters, In 1–8 | Unitor8/AMT8 | W P T X |
| | `01 08`–`01 0F` | Computer mode filters, Out 1–8 | Unitor8/AMT8 | W P T X |
| | `01 12`–`01 19`, `01 40`–`01 48` | SMPTE / sync settings (fields not decoded); a change also sends the S&S message (§2) | Unitor8 | X |
| `02 00` | `02 00`–`02 07` | Patch mode filters, In 1–8 | Unitor8/AMT8 | W P T X |
| | `02 08`–`02 0F` | Patch mode filters, Out 1–8 | Unitor8/AMT8 | W P T X |
| | `02 10` | Active patch | Unitor8/AMT8 | P T X |
| | `02 11` | Program change setup | Unitor8/AMT8 | W P T X |
| `03 00` | `03 00` | Tip input configuration | Unitor8 | X |
| | `03 01`–`03 20` | Tip input: 4 × 8 bytes | Unitor8 | X |
| | `03 21`–`03 40` | Ring input: 4 × 8 bytes | Unitor8 | X |
| `04 40` | `04 40` | Active patch | MT4 | T X |
| | `04 41` | Program change setup | MT4 | T |

The MT4 has no message filters.

**Chained units:** emagic's software caches the patch block per unit with a stride of `0x50` (X). This suggests each chained unit has its own copy of the block, addressed through the box byte.

### Message filters

The value is a bitmap of the message types that are blocked. A set bit means the type is filtered.

| Bit | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| Type | MTC | SysEx | Active Sensing | Tune Request | Realtime | System Reset | Song Select |

The default is `0x24` (Active Sensing + System Reset), sent as `02 04`.

Filter SysEx and Active Sensing (`0x06`) on Out 3 in computer mode:

```
F0 00 20 31 64 13 00 00 01 0A 00 00 06 F7
```

**Computer mode filters only take effect after Set Computer Mode (`0F`) is sent (T).** Patch mode filters take effect the next time the unit enters patch mode.

emagic's software does the same (X). After any write to `xx 00`–`xx 11` (filters, active patch or program change), it re-sends the mode command:
- after a computer block write: `0F 00 7F`
- after a patch block write: `10 00 7F [active patch]`, which puts the unit into patch mode

### Active patch

The active patch is the patch the unit uses when it enters patch mode.

- **Value:** `(patch − 1) << 3`, i.e. the patch number is in bits 3–7.
- **Program change:** in patch mode, a program change on the configured input and channel changes this value. Program n selects patch n (T).

Set patch 5 as the active patch:

```
F0 00 20 31 64 13 00 00 02 10 00 02 00 F7      Unitor8/AMT8
F0 00 20 31 64 13 00 00 04 40 00 02 00 F7      MT4
```

Writing this value doesn't change the mode.

### Program change setup

The value is two bytes, `[flags] [channel − 1]`.

| Flags bits | Meaning |
|---|---|
| bit 3 (`08`) | Enabled |
| bits 0–2 | Input port − 1 (MT4: bit 0 only) |

Enable patch switching from program changes on In 4, channel 1:

```
F0 00 20 31 64 13 00 00 02 11 00 0B 00 F7
```

On the MT4, enable it on In 2, channel 16:

```
F0 00 20 31 64 13 00 00 04 41 00 09 0F F7
```

### LED brightness

The value has a single bit set for each level.

| Level | Off | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|---|
| Bytes | `00 00` | `00 01` | `00 02` | `00 04` | `00 08` | `01 00` | `02 00` | `04 00` | `08 00` |

The prefPane caps level 8 at `04 00`, so its levels 7 and 8 are the same. The panel sends `08 00` for level 8.

Set the RS LEDs to level 5:

```
F0 00 20 31 64 13 00 00 00 08 00 01 00 F7
```

### Reading a block

Read the patch mode block (Unitor8/AMT8):

```
→ F0 00 20 31 64 14 00 00 02 00 3F F7
← F0 00 20 31 64 79 00 00 02 00 3F  02 04 ×16  02 00  0B 00  … F7
                                    filters    02 10  02 11
                                               (patch 5) (enabled, In 4, ch 1)
```

On the MT4 the block starts with the active patch: `14 00 00 04 40 3F`.

### Click input setup (`0D`, Unitor8)

The click input settings are stored in block `03 00`, and the block can be read with `14`. emagic's software doesn't write them with `13`. It sends one `0D` message per input, 75 bytes long (X):

```
F0 00 20 31 64 0D 00 [box] [a] [b] [record × 4] F7
```

| Field | Tip input | Ring input |
|---|---|---|
| `a` | `40 \| (config & 1) << 5` | `00` |
| `b` | `config >> 1` | `00` |
| Records | from `03 01`–`03 20` | from `03 21`–`03 40` |

- `config` is the value at `03 00`.
- Each record is 16 bytes: `00`, the MIDI byte count (`& 7F`), then 7 MIDI bytes, each split into two 4-bit halves.
- In the source data, each record takes 8 locations: the count followed by the 7 MIDI bytes.
- The UI's settings are "Footswitch / Signal", "Analog Hold Off", "Phase", "Input Type", "# of MIDI Bytes" and "MIDI Bytes".
- The available functions are "MIDI", "Panic", "P Down" and "P Up". The UI notes that the functions work in patch mode only.
- W's example starts with `0D 00 00 40 1E`, a tip message.

---

## 6. Operating modes (`0F`, `10`)

| Mode | Behaviour (T) |
|---|---|
| **Computer** | The computer controls routing. Incoming MIDI, including program changes, is forwarded to the computer. The computer mode filters apply. |
| **Patch** | Standalone. Routing comes from the active patch, and program changes on the configured input and channel switch patches. The patch mode filters apply. MIDI from the computer isn't passed to the outputs. On entering patch mode the AMT8 sends all notes off, reset controllers and pitch bend centre on every channel. |

- **Reading the mode:** no message for this is known.
- **MT4:** its front panel can't enter patch mode, so SysEx is the only way.
- **Unitor8/AMT8:** the front panel can also switch modes.
- **Manual:** the AMT8/Unitor8 manual says the unit switches to computer mode when it receives channel messages from the computer. With the Mac driver connected, our AMT8 test in patch mode blocked the computer's notes instead, so this wasn't observed.

### Set Computer Mode

```
F0 00 20 31 64 0F 00 7F F7
```

### Patch Select / Set Patch Mode (`10`)

```
F0 00 20 31 64 10 00 [box] [patch byte] F7
```

| Patch byte bits | Meaning |
|---|---|
| 0–4 | Patch − 1 (`00`–`1F`) |
| 5 (`20`) | "High patch bit" (name from P; effect unknown) |
| 6 (`40`) | "EPROM bit" (name from P). With patch `0`, it means "use the stored active patch". |

Behaviour tested on the MT4 and AMT8:

| Message | Effect |
|---|---|
| `10 00 00 [patch]` | **Nothing**, while in computer mode. |
| `10 00 7F [patch]` | Enters patch mode **and** stores `[patch]` as the active patch. |
| `10 00 7F 40` | Enters patch mode with the stored active patch, which is left unchanged. |

Examples:

```
F0 00 20 31 64 10 00 7F 40 F7     Patch mode, keep the stored active patch (the driver's message, used by the panel)
F0 00 20 31 64 10 00 7F 04 F7     Patch mode with patch 5, also stored as the active patch
```

### When emagic's software switches modes (X)

| User action | Sends |
|---|---|
| Opens Computer Mode Setup | `0F 00 7F`, unless the app already set computer mode |
| Opens Patch Mode Setup | `10 00 7F [stored active patch]` (read from `02 10`, or `04 40` on the MT4, `>> 3`) |
| Selects a patch in the patch list | `10 00 7F [patch − 1]`. This auditions the patch in patch mode, and the app updates its cached active patch (`02 10` / `04 40`) to match. |
| Opens Click or Global Setup | nothing |

The app tracks the mode itself (0 = unknown, 1 = computer, 2 = patch) and never reads it from the unit, which confirms that there is no mode query. It resets the tracked mode to "unknown" after every patch routing write (`11`), so the next page change re-sends the mode command. It uses the `10 00 7F [patch]` form, not the driver's `10 00 7F 40`.

---

## 7. Panic and EEPROM maintenance (X)

### Panic

```
F0 00 20 31 64 0E 00 7F F7
```

### EEPROM reset (Unitor8)

This is a hidden function: modifier key + "Panic". It erases every setting in the first unit, which then has to be power-cycled.

```
F0 00 20 31 64 0C 00 [box] 31 F7
F0 00 20 31 64 7D 00 [box] 00 01 00 00 00 00 01 F7
```

The app sends three more bytes after the second message: `80 40 40`, a Note Off. It then waits 3 seconds and rescans.

### EEPROM firmware update (Unitor8 only)

Updates are distributed as Standard MIDI Files that contain the whole SysEx sequence, for example "Unitor8 Update 1.3.1.mid". Restrictions:

- The AMT8 has no EEPROM and can't be updated.
- The unit must already run version 1.2.0 or later. Older units need their EPROM replaced.
- An update file only suits its own hardware generation (Mk): the major version must match.

The 1.3.1 file sends, in order:

1. `0F 00 7F`, then `0B 00 00`
2. `F0 00 00 33 02 0D 00 00 … F7` (22 bytes, all zero)
3. `13` writes to `00 0B` (four values), `00 04`, `00 06` and `00 02`
4. `0C 00 00 31` to begin
5. 64 × `7D` data chunks
6. `7F 00 00` to end
7. `0B 00 00`

The `7D` chunk format:

```
F0 00 20 31 64 7D 00 [box] [a2] [a1] [a0] [count-1] [hi lo] × count [checksum] F7
```

- **Address:** `a2 a1 a0` are the three 4-bit digits of a 12-bit EEPROM address.
- **Data:** full chunks hold 120 bytes (`count−1` = `77`), and consecutive addresses step by `0x78`.
- **Checksum:** the sum of every byte from `a2` up to the last data byte, masked with `7F`.

The last two chunks write the version string and a check value:

```
F0 00 20 31 64 7D 00 00 00 00 08 02 03 01 03 03 03 01 18 F7    address 008: "131"
F0 00 20 31 64 7D 00 00 00 00 04 03 09 0D 00 0A 02 0D 08 05 43 F7
```

**Acknowledgements:**
- After `0C`, each `7D` and `7F`, the unit answers `F0 00 20 31 64 [same cmd] 00 [40 | box << 3] F7`. The ROM bit is set because the boot ROM handles the update.
- `7E` in the command position means an error.
- The software waits up to 3 seconds for each answer.
- If `0C` gets no answer on a 1.2.0 unit, the software falls back to a manual procedure with a special plug in the "Mac RS-422" jack, and sends `10 00 [box] 31`.

---

## 8. What the original software sends

### Apple driver (D)

The driver contains only three emagic messages.

| When | Sends |
|---|---|
| Device start | `0B 00 [box]` for each of up to 8 units, then `0F 00 7F` (computer mode), then `F5 01` |
| Device stop | `10 00 7F 40` (back to patch mode) |

- **Port selection:** in the MIDI stream, `F5 [port]` selects the port.
- **Filtering:** the driver doesn't filter MIDI. It drops only the undefined `F9` and `FD` bytes.

### Arnlund prefPane (P)

- It never sends `0F` and has no patch-mode command. It relies on the driver for the mode.
- Clicking a patch sends `10 00 [box] [patch]` followed by `12`. According to T, the `10` does nothing in computer mode.
- Every filter change writes the whole computer or patch block with one `13` message.
- It scans boxes 0–7 and retries each one in ROM mode.

### emagic Windows drivers v2.27 (X)

The Windows 98, 2000 and NT drivers contain only two emagic messages: the version request `0B 00 00` and the patch-mode message `10 00 7F 40`, the same one the Mac driver sends at stop. Unlike the Mac driver, they contain no `0F` (Set Computer Mode) message.

### emagic "Unitor8 Control" for Windows (X)

This is the original editor, written by Michael Haydn in 2002 and built on emagic's SoundDiver engine. It supports all three models and has these pages:
- Patches
- Computer Mode Setup
- Patch Mode Setup
- Click Input Setup
- Global Setup
- MT4 Global Setup

What it does:
- It writes each setting immediately with a single-value `13`.
- It re-sends the mode command after filter and patch-change writes (§5).
- It switches modes as you move between pages (§6).
- It sends click settings with `0D`, and SMPTE settings with the S&S message.
- It adds Panic, EEPROM reset and EEPROM update (§7).

The installer is a MindVision VISE archive. To extract its files:
- Use the file table that follows the `ESIV` marker. Offsets are relative to the marker at `0x11000`.
- Swap the bytes of each 16-bit word.
- Raw-inflate the result.

---
