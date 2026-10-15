import type { ExerciseDef } from '../engine/types';
import { chords } from './chords';
import { degrees } from './degrees';
import { dictation } from './dictation';
import { intervals } from './intervals';
import { progressions } from './progressions';
import { singing } from './singing';

export const EXERCISES: ExerciseDef[] = [degrees, intervals, chords, progressions, dictation, singing];

export const exerciseById = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));
