# Moonlight Summoning Audio Cue Sheet

Review date: 2026-07-13
Result: approved for runtime integration

| Cue | Duration | Loop | Trigger | Fade in / out | Measured MP3 | Intended feel |
| --- | ---: | --- | --- | --- | --- | --- |
| `ambient-moon-void` | 16.00 s | 0–16.00 s | experience entry; continue through reset | 500 / 800 ms | -16.9 LUFS; -8.74 dBFS; 250.9 KiB | quiet deep-violet lunar space, stable and unobtrusive |
| `charge-low` | 2.50 s | 0–2.50 s | `charging` from 0 ms | 120 / 180 ms | -18.4 LUFS; -9.29 dBFS; 50.2 KiB | soft low resonance that gives the hold gesture weight |
| `charge-crystals` | 2.50 s | 0–2.50 s | `charging` from about 800 ms | 150 / 180 ms | -20.4 LUFS; -7.36 dBFS; 50.2 KiB | small crystal and rotating-rune pulses |
| `charge-rise` | 2.50 s | 0–2.50 s | `charging` from about 1700 ms | 150 / 200 ms | -21.4 LUFS; -16.55 dBFS; 50.2 KiB | airy upper harmonics and rising stardust brightness |
| `charged-cue` | 0.90 s | no | first transition to `charged` only | 0 / 80 ms | -18.4 LUFS; -11.17 dBFS; 18.8 KiB | gentle two-note readiness confirmation without sharpness |
| `dissolve` | 1.00 s | no | `dissolving`, interruption, or focus loss during a hold | 0 / 120 ms | -20.4 LUFS; -13.24 dBFS; 20.7 KiB | soft downward energy release, never a failure impact |
| `release-chime` | 1.40 s | no | successful `summoning` entry | embedded 120 ms silence / 160 ms | -18.4 LUFS; -9.08 dBFS; 28.6 KiB | clear moonlight release with room for the visual flash |
| `cat-form` | 1.70 s | no | cat formation after the release flash | 25 / 380 ms | -19.4 LUFS; -10.91 dBFS; 34.3 KiB | soft shimmer plus a subtle purr-like resonance |

## Verification

- All source files are original 48 kHz stereo PCM16 WAV; all runtime files are 48 kHz stereo MP3.
- The four loop sources pass the waveform seam threshold.
- `release-chime` remains silent for the first 118 measured milliseconds, matching the 120-millisecond design gap within sample and encoding tolerance.
- Every decoded MP3 peak remains below -1 dBFS.
- Total runtime audio size is 0.49 MB, below the 3.5 MB target.
- The waveform sheet confirms smooth cue tails, a stable environment loop, distinct charge layers, and the reserved success gap.
- No voice, stock recording, film sample, game sample, or third-party melody is present.
