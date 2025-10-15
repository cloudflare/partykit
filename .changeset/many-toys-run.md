---
"partytracks": patch
---

Fix Safari compatibility by adding setSinkId feature detection to createAudioSink

The createAudioSink utility now gracefully handles browsers that don't support the setSinkId API (primarily Safari on mobile and desktop).

- Added checkSinkIdSupport helper to detect setSinkId availability
- Added isSinkIdSupported property to SinkApi interface
- Wrapped setSinkId calls with feature detection to prevent crashes
- Audio now plays through default output on unsupported browsers with a helpful console warning
- Applications can check audioSink.isSinkIdSupported to conditionally render device selection UI

This is a backward-compatible change that fixes crashes reported in #276.
