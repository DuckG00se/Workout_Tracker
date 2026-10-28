import type { Exercise, ExType, Routine, RoutineItem } from './types';

const e = (id: string, name: string, muscles: string[], equipment: string, type: ExType, restSec: number): Exercise =>
  ({ id: 'ex-' + id, name, muscles, equipment, type, notes: '', archived: false, restSec, updatedAt: 0 });

export const SEED: Exercise[] = [
  e('squat', 'Back Squat', ['Quads', 'Glutes'], 'Barbell', 'wr', 150),
  e('front-squat', 'Front Squat', ['Quads', 'Core'], 'Barbell', 'wr', 150),
  e('leg-press', 'Leg Press', ['Quads', 'Glutes'], 'Machine', 'wr', 120),
  e('lunge', 'Walking Lunge', ['Quads', 'Glutes'], 'Dumbbell', 'wr', 90),
  e('bulgarian', 'Bulgarian Split Squat', ['Quads', 'Glutes'], 'Dumbbell', 'wr', 90),
  e('leg-ext', 'Leg Extension', ['Quads'], 'Machine', 'wr', 75),
  e('rdl', 'Romanian Deadlift', ['Hamstrings', 'Glutes'], 'Barbell', 'wr', 150),
  e('deadlift', 'Deadlift', ['Back', 'Hamstrings', 'Glutes'], 'Barbell', 'wr', 180),
  e('leg-curl', 'Leg Curl', ['Hamstrings'], 'Machine', 'wr', 75),
  e('hip-thrust', 'Hip Thrust', ['Glutes'], 'Barbell', 'wr', 120),
  e('calf-raise', 'Standing Calf Raise', ['Calves'], 'Machine', 'wr', 60),
  e('bench', 'Bench Press', ['Chest', 'Triceps', 'Shoulders'], 'Barbell', 'wr', 150),
  e('inc-db-press', 'Incline Dumbbell Press', ['Chest', 'Shoulders'], 'Dumbbell', 'wr', 120),
  e('db-press', 'Dumbbell Bench Press', ['Chest', 'Triceps'], 'Dumbbell', 'wr', 120),
  e('chest-press', 'Machine Chest Press', ['Chest', 'Triceps'], 'Machine', 'wr', 90),
  e('cable-fly', 'Cable Fly', ['Chest'], 'Cable', 'wr', 75),
  e('pec-deck', 'Pec Deck', ['Chest'], 'Machine', 'wr', 75),
  e('pushup', 'Push-up', ['Chest', 'Triceps'], 'Bodyweight', 'bw', 60),
  e('dip', 'Dip', ['Chest', 'Triceps'], 'Bodyweight', 'bw', 90),
  e('ohp', 'Overhead Press', ['Shoulders', 'Triceps'], 'Barbell', 'wr', 150),
  e('db-shoulder', 'Dumbbell Shoulder Press', ['Shoulders', 'Triceps'], 'Dumbbell', 'wr', 120),
  e('lat-raise', 'Lateral Raise', ['Shoulders'], 'Dumbbell', 'wr', 60),
  e('face-pull', 'Face Pull', ['Shoulders', 'Back'], 'Cable', 'wr', 60),
  e('rear-delt', 'Reverse Pec Deck', ['Shoulders'], 'Machine', 'wr', 60),
  e('pullup', 'Pull-up', ['Back', 'Biceps'], 'Bodyweight', 'bw', 120),
  e('chinup', 'Chin-up', ['Back', 'Biceps'], 'Bodyweight', 'bw', 120),
  e('lat-pulldown', 'Lat Pulldown', ['Back', 'Biceps'], 'Cable', 'wr', 90),
  e('bb-row', 'Barbell Row', ['Back', 'Biceps'], 'Barbell', 'wr', 120),
  e('db-row', 'One-arm Dumbbell Row', ['Back', 'Biceps'], 'Dumbbell', 'wr', 90),
  e('seated-row', 'Seated Cable Row', ['Back', 'Biceps'], 'Cable', 'wr', 90),
  e('tbar-row', 'Chest-supported Row', ['Back'], 'Machine', 'wr', 90),
  e('bb-curl', 'Barbell Curl', ['Biceps'], 'Barbell', 'wr', 60),
  e('db-curl', 'Dumbbell Curl', ['Biceps'], 'Dumbbell', 'wr', 60),
  e('hammer', 'Hammer Curl', ['Biceps', 'Forearms'], 'Dumbbell', 'wr', 60),
  e('pushdown', 'Triceps Pushdown', ['Triceps'], 'Cable', 'wr', 60),
  e('skull', 'Skull Crusher', ['Triceps'], 'Barbell', 'wr', 75),
  e('oh-tri', 'Overhead Triceps Extension', ['Triceps'], 'Cable', 'wr', 60),
  e('plank', 'Plank', ['Core'], 'Bodyweight', 'time', 45),
  e('hang-leg', 'Hanging Leg Raise', ['Core'], 'Bodyweight', 'bw', 60),
  e('cable-crunch', 'Cable Crunch', ['Core'], 'Cable', 'wr', 60),
  e('bike', 'Stationary Bike', ['Cardio'], 'Machine', 'timedist', 60),
  e('rower', 'Rowing Machine', ['Cardio'], 'Machine', 'timedist', 60),
  e('stairs', 'Stair Climber', ['Cardio'], 'Machine', 'time', 60),
  // added with the 5-day hybrid plan
  e('run', 'Run', ['Cardio'], 'Other', 'timedist', 0),
  e('dead-bug', 'Dead Bug', ['Core'], 'Bodyweight', 'bw', 45),
  e('pallof', 'Pallof Press', ['Core'], 'Cable', 'wr', 45),
  e('back-ext', 'Back Extension', ['Back', 'Glutes'], 'Machine', 'bw', 60),
  e('cable-lat-raise', 'Cable Lateral Raise', ['Shoulders'], 'Cable', 'wr', 60),
  e('side-plank', 'Side Plank', ['Core'], 'Bodyweight', 'time', 45),
  e('bird-dog', 'Bird Dog', ['Core'], 'Bodyweight', 'bw', 45),
  e('air-bike', 'Air Bike', ['Cardio'], 'Machine', 'timedist', 60),
];

const item = (id: string, sets: number, reps: number, restSec: number): RoutineItem => ({ exerciseId: 'ex-' + id, sets, reps, restSec });

/** Days 1, 3 and 4 of the plan (reps are the middle of each range). */
export const PLAN_ROUTINES: Routine[] = [
  { id: 'rt-plan-d1', name: 'Day 1 · Lower strength', updatedAt: 0, items: [
    item('squat', 4, 5, 150), item('rdl', 3, 7, 120), item('bulgarian', 3, 9, 90), item('leg-curl', 3, 11, 75),
    item('calf-raise', 3, 13, 60), item('dead-bug', 3, 8, 45),
  ] },
  { id: 'rt-plan-d3', name: 'Day 3 · Upper strength', updatedAt: 0, items: [
    item('bench', 4, 5, 150), item('lat-pulldown', 4, 7, 120), item('db-shoulder', 3, 9, 90), item('tbar-row', 3, 11, 90),
    item('cable-lat-raise', 3, 13, 60), item('face-pull', 3, 13, 60), item('db-curl', 2, 11, 60), item('pushdown', 2, 11, 60),
  ] },
  { id: 'rt-plan-d4', name: 'Day 4 · Full-body hypertrophy', updatedAt: 0, items: [
    item('leg-press', 3, 11, 90), item('inc-db-press', 3, 10, 90), item('db-row', 3, 11, 75), item('back-ext', 3, 12, 60),
    item('pushup', 2, 13, 60), item('pallof', 3, 10, 45),
  ] },
];
