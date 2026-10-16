import type { ExerciseDef } from '../engine/types';
import { chords } from './chords';
import { degrees } from './degrees';
import { dictation } from './dictation';
import { harmony } from './harmony';
import { intervals } from './intervals';
import { inversions } from './inversions';
import { progressions } from './progressions';
import { rhythm } from './rhythm';
import { rhythmDictation } from './rhythmDictation';
import { rhythmTap } from './rhythmTap';
import { scales } from './scales';
import { singing } from './singing';

export const EXERCISES: ExerciseDef[] = [degrees, intervals, chords, inversions, scales, progressions, harmony, dictation, rhythmDictation, rhythm, rhythmTap, singing];

export const exerciseById = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));
