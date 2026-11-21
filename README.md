# emagic Unitor family control panel

This is a Web MIDI based interface to configure the old emagic MIDI interfaces (Unitor8, AMT8 and MT4). These are very capable MIDI interfaces still supported by Apple, but the software to configure them
has been unsupported for a long time (and it's very challenging to run on modern hardware). This is my attempt to provide the configuration functionality in a way that will hopefully keep working longer,
as it's based on the Web MIDI API standard. It allows you to configure the patches and their routing matrix, computer and patch mode filters, patch change configuration and global device settings. It has
been tested with AMT8 and MT4 interfaces, but should also work with Unitor8 interfaces. The only missing features are the Unitor8 specific configurations (synchronisation and click input settings). This
project was coded with Claude as a learning experiment.

You can use it directly at this link: [https://urtzurd.github.io/emagic-Unitor-Family-Control-Panel/](https://urtzurd.github.io/emagic-Unitor-Family-Control-Panel/)

## Thanks to

This project was much easier to implement thanks to the previous work by Kurt Arnlund and his documentation on the MIDI protocol for the [Unitor8 Preference Pane](https://www.potm.org/software/Unitor/).

## Requirements

The panel requires a Web MIDI API capable browser and has been developed and tested using Google Chrome. Other users have reported it working on Firefox and LibreWolf too.
Safari and iOS browsers are unsupported, as Apple decided not to implement the Web MIDI API.

## Changelog

- 08/Aug/2026: First version supporting routing matrix and global settings.
- 18/Oct/2026: Implemented message filters (supported only by Unitor8/AMT8) and patch change configuration (all models).
- 20/Nov/2026: Fixed Computer mode filters not taking effect. The panel now sends the "Set Computer Mode" command after sending the filters, so the interface applies them straight away.
- 21/Nov/2026: Added support to select the active patch and to switch between Computer and Patch mode. Small changes and bugs fixed:
  - The editing tabs are now disabled in Patch Mode, as the unit can't be edited in that mode.
  - Scanning now switches the unit to Computer Mode, so a unit left in Patch Mode is detected and the panel shows the right mode.
  - The LED brightness sliders now show the values stored in the unit, and are hidden on the MT4, which has no LED brightness setting.
  - Switching patches quickly could save a patch's routing to another patch.
  - The MIDI port dropdowns could show a different port from the one in use after connecting or disconnecting MIDI devices.
  - If reading the settings failed, sending could overwrite the unit's message filters or program change settings with defaults.
  - The Computer and Patch tabs are disabled on Unitor8 firmware older than 1.0.6, which can't edit those settings.
