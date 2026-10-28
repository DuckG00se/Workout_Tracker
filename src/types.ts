export type ExType = 'wr' | 'bw' | 'time' | 'timedist';

export interface Exercise {
  id: string;
  name: string;
  muscles: string[];
  equipment: string;
  type: ExType;
  notes: string;
  archived: boolean;
  restSec: number;
  updatedAt?: number; // stamped automatically by db hooks; used for sync
}

export interface RoutineItem {
  exerciseId: string;
  sets: number;
  reps: number;
  restSec: number;
}

export interface Routine {
  id: string;
  name: string;
  items: RoutineItem[];
  updatedAt?: number;
}

export interface Session {
  id: string;
  date: string; // YYYY-MM-DD (local)
  startedAt: number;
  endedAt: number | null;
  routineId: string | null;
  routineName: string;
  notes: string;
  effort: number | null;
  status: 'active' | 'done';
  exerciseIds: string[]; // ordered
  /** Present on runs: one timed set of `ex-run` holds duration, distance and effort. */
  run?: { type: 'quality' | 'easy' | 'long'; week: number };
  updatedAt?: number;
}

export interface SetRow {
  id: string;
  sessionId: string;
  exerciseId: string;
  exerciseName: string;
  setNo: number;
  ts: number; // session start, for ordering across sessions
  weight: number;
  reps: number;
  duration: number; // seconds
  distance: number; // km
  rpe: number | null;
  warmup: boolean;
  done: boolean;
  updatedAt?: number;
}

export const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Forearms', 'Cardio'];
export const EQUIPMENT = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Kettlebell', 'Other'];
export const TYPE_LABEL: Record<ExType, string> = {
  wr: 'Weight + reps',
  bw: 'Bodyweight + reps',
  time: 'Time',
  timedist: 'Time + distance',
};
