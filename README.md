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
