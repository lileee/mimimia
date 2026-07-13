# Moonlight Summoning Audio Direction

All eight cues are original project-authored procedural synthesis. They contain no voice, stock recording, film sample, game sample, trademark melody, or third-party audio.

## Timeline

- `0.0–0.8 s`: a low, soft lunar resonance establishes weight without a harsh attack.
- `0.8–1.7 s`: crystal pulses and rotating rune-like overtones become audible.
- `1.7–2.5 s`: high stardust harmonics rise in brightness while the lower layers remain stable.
- `charged`: a clear but gentle two-note confirmation marks readiness; holding longer must not repeat it.
- `early release / interruption`: a soft downward dissolve removes energy without an impact sound.
- `successful release`: preserve `120 ms` of silence, then play a moonlight chime followed by the cat-forming cue.

## Files and mix intent

- `ambient-moon-void`: seamless 16-second stereo environment loop at about -16 LUFS.
- `charge-low`: seamless low-frequency charge foundation; faded in from the start of charging.
- `charge-crystals`: seamless crystal and rune pulse layer; introduced around 0.8 seconds.
- `charge-rise`: seamless bright stardust layer; introduced around 1.7 seconds.
- `charged-cue`: one-shot readiness confirmation, clear but not sharp.
- `dissolve`: one-shot descending energy release for failure and safe cancellation.
- `release-chime`: one-shot success chime with an exact 120-millisecond silent lead-in.
- `cat-form`: one-shot soft shimmer and purr-like resonance for the moon cat taking form.

Runtime sources are 48 kHz stereo MP3. The environment loop uses 128 kbps; short cues use 160 kbps. Source WAV files are 48 kHz stereo PCM. Short-cue decoded peaks must not exceed -1 dBFS, and the complete compressed set must remain below 3.5 MB.
