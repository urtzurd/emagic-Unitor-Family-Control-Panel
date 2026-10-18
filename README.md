# emagic Unitor family control panel

This is a web MIDI based interface to configure the old emagic MIDI interfaces (Unitor8, AMT8 and MT4). These are very capable MIDI interfaces yet supported by Apple, but the software to configure them has been
unsupported for a long time (and it's almost impossible to run in modern hardware). This is my attempt to provide the configuration functionality in a hopefully longer working way, as it's based on the web MIDI
API standard. It allows to configure the patches and global settings for now (computer and patch mode filters might come later on if I have the time). It has been tested with AMT8 and MT4 interfaces, but should
also work with Unitor8 interfaces. This project was vibe coded with Claude as a learning experiment.

You can use directly on this link: [https://urtzurd.github.io/emagic-Unitor-Family-Control-Panel/](https://urtzurd.github.io/emagic-Unitor-Family-Control-Panel/)

## Thanks to

This project was much easier to implement thanks to the previous effort done by Kurt Arnlund and his documentation on the MIDI protocol for the [Unitor8 Preference Pane](https://www.potm.org/software/Unitor/).

## Requirements

The panel requires a web MIDI API capable browser and has been developed and tested using Google Chrome. Other users have repored it working on FireFox and LibreWolf too.
Safari and iOS browsers are unsupported, as Apple decided not to implement the web MIDI protocol.

## Changelog

- 08/Aug/2026: First version supporting routing matrix and global settings.
- 18/Oct/2026: Implemented message filters (supported only by Unitor8/AMT8) and patch change configuration (all models).
