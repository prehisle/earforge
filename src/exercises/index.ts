import type { ExerciseDef } from '../engine/types';
import { chords } from './chords';
import { degrees } from './degrees';
import { dictation } from './dictation';
import { intervals } from './intervals';
import { progressions } from './progressions';
import { rhythm } from './rhythm';
import { rhythmTap } from './rhythmTap';
import { singing } from './singing';

export const EXERCISES: ExerciseDef[] = [degrees, intervals, chords, progressions, dictation, rhythm, rhythmTap, singing];

export const exerciseById = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));
