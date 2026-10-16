# EarForge

English | [中文](README.md)

A free, open-source ear-training web app that works offline. The interface is available in English and Chinese: switch in Settings, and new users get the language of their browser.

## Features

- **Hearing in a key first**: every question starts with a cadence that sets the key, so you learn to hear notes *in music*, not just isolated intervals.
- **Resolve to do**: after each answer the note resolves step by step to the tonic (e.g. fa → mi → re → do), which builds a feel for each scale degree's function.
- **Today's Training**: one tap starts a mixed set. Spaced repetition picks the items you most need across exercises, and you get a summary at the end.
- **Adaptive practice**: mastery is tracked per item. Weak items come up more often, older ones come back for review, and the next level unlocks automatically. The Stats page has one-click drills for weak spots.
- **Modes**: major, natural minor, harmonic minor, Dorian and Mixolydian, each with its own progress.
- **Sing it**: built-in YIN pitch detection for sight-singing and echo singing with a live tuner. Octaves are ignored, so it works for any voice.
- **Note names your way**: movable do (do re mi), scale degrees (1 2 3, as in numbered notation / jianpu), fixed do, or letter names (C D E). Optional staff notation.
- **Sight-singing library**: 48 graded pieces (original drills plus public-domain folk and classical melodies) on a real staff with rhythm, transposed to your range. Sing along with a metronome and get note-by-note pitch scoring.
- **Trends**: accuracy over time, daily volume, a practice calendar and per-exercise sparklines.
- **Guided start**: a short first-run setup picks starting levels from your background, and each exercise shows a quick how-to the first time.
- **Compare when wrong**: a wrong answer plays what you chose. After answering, every option can be auditioned, and you can switch between "your answer" and "correct answer" with one click.
- **MIDI keyboard input**: play your answers on a MIDI keyboard (scale degrees, melodic dictation, intervals).
- **No sign-up**: data stays in your browser and can be exported or imported. Installable as a PWA.
- **Sounds**: real-time Web Audio synthesis (no download), or an optional sampled piano (~1.4 MB, cached for offline use).

## Exercises

| Exercise | What you practice |
|---|---|
| Scale Degrees | Cadence + one note: name it as do re mi… (including chromatic notes), in 5 modes |
| Chords in a Key | I IV V vi… / i iv V ♭VI…, as single chords or four-chord progressions |
| Melodic Dictation | Short melodies of 3–8 notes; enter the notes in order |
| Intervals | Ascending, descending or harmonic, with reference songs, 6 levels |
| Chord Quality | Triads, suspended and 7th chords, with optional inversions and arpeggios |
| Rhythmic Dictation | Count-in + a rhythm; pick it out from similar rhythms, from quarter notes up to syncopation and triplets |
| Rhythm Tapping | Read & tap or listen & tap with Space, touch or clapping; a timeline shows each early, late or missed tap |
| Sight-singing / Echo | Sing from note names or after listening, judged live through the microphone |

Exercise levels start gently and can be skipped ahead in the welcome tour. It offers presets for complete beginners, instrumentalists, and students preparing for graded exams (ABRSM / Trinity) or music school entrance exams.

## Development

```bash
npm install
npm run dev      # dev server
npm test         # unit tests
npm run build    # production build (outputs dist/, deployable to any static host)
```

Stack: Vite + React + TypeScript, with no runtime dependencies besides React. UI strings live in `src/i18n/` (`zh.ts` is the source of truth; `en.ts` must have the same keys, enforced by TypeScript and a unit test).

## License

Code is released under the MIT license.

The sampled piano uses [Salamander Grand Piano](https://archive.org/details/SalamanderGrandPianoV3) by Alexander Holm, licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), hosted by [Tone.js](https://github.com/Tonejs/Tone.js). It is downloaded on demand at runtime and is not distributed with this repository.
