import { ClientWorkoutPlan, ProgressPhoto, OneOnOneVideoSession, WorkoutDaySchedule } from '../types';

export const INITIAL_PROGRESS_PHOTOS: ProgressPhoto[] = [
  {
    id: 'ph-01',
    date: '2026-07-15',
    type: 'Front Progress',
    imageUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop&q=80',
    isFaceMasked: true,
    notes: 'Initial baseline photo - Day 1. AI Privacy Shield face-masked automatically.'
  },
  {
    id: 'ph-02',
    date: '2026-07-28',
    type: 'Side Progress',
    imageUrl: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&auto=format&fit=crop&q=80',
    isFaceMasked: true,
    notes: 'Week 2 check-in. Noticeable waist circumference reduction.'
  }
];

export const MOCK_5_DAY_SCHEDULE: WorkoutDaySchedule[] = [
  {
    dayNumber: 1,
    dayName: 'Day 1: Chest & Triceps Hypertrophy (Push)',
    isRestDay: false,
    exercises: [
      {
        id: 'ex-101',
        name: 'Incline Dumbbell Press',
        targetMuscle: 'Upper Chest & Front Delts',
        weightKg: '12 - 16 kg',
        sets: 4,
        reps: '10 - 12 reps',
        restSeconds: 60,
        description: 'Set incline bench to 30 degrees. Retract shoulder blades, press dumbbells upward focusing on upper chest contraction without locking elbows at the top.',
        tips: 'Keep lower back neutral with feet planted flat on the ground.',
        videoUrl: 'https://www.youtube.com/embed/0G2_XV7slIg'
      },
      {
        id: 'ex-102',
        name: 'Standing Cable Chest Flyes',
        targetMuscle: 'Inner & Lower Chest',
        weightKg: '10 kg/side',
        sets: 3,
        reps: '12 - 15 reps',
        restSeconds: 45,
        description: 'Set pulleys at shoulder height. Step forward with one foot, pull handles together in an arc motion, squeezing chest at peak contraction for 1 second.',
        tips: 'Maintain slight elbow bend throughout the entire arc range.',
        videoUrl: 'https://www.youtube.com/embed/eozdVDA78K0'
      },
      {
        id: 'ex-103',
        name: 'Tricep Rope Pushdowns',
        targetMuscle: 'Triceps Lateral & Long Head',
        weightKg: '15 kg',
        sets: 4,
        reps: '12 reps',
        restSeconds: 45,
        description: 'Keep upper arms pinned to ribs. Push rope attachment downward toward thighs, flaring rope ends apart at the bottom for full tricep contraction.',
        tips: 'Do not swing shoulders or lean over the rope.',
        videoUrl: 'https://www.youtube.com/embed/vB5OHsJ3EME'
      }
    ]
  },
  {
    dayNumber: 2,
    dayName: 'Day 2: Back & Biceps Width & Thickness (Pull)',
    isRestDay: false,
    exercises: [
      {
        id: 'ex-201',
        name: 'Lat Pulldowns (Wide Grip)',
        targetMuscle: 'Latissimus Dorsi (Upper Back Width)',
        weightKg: '30 - 35 kg',
        sets: 4,
        reps: '10 - 12 reps',
        restSeconds: 60,
        description: 'Grasp bar slightly wider than shoulder width. Lean back 10-15 degrees and pull bar down to upper chest, driving elbows down and back.',
        tips: 'Avoid jerking your torso backwards to lift heavy weight.',
        videoUrl: 'https://www.youtube.com/embed/CAwf7n6Luuc'
      },
      {
        id: 'ex-202',
        name: 'Seated Cable Rows (Neutral Grip)',
        targetMuscle: 'Rhomboids & Mid-Traps',
        weightKg: '28 kg',
        sets: 4,
        reps: '12 reps',
        restSeconds: 60,
        description: 'Sit upright with chest out. Pull double-D handle toward belly button while pulling shoulder blades tightly together.',
        tips: 'Squeeze back muscles for a full second at peak contraction.',
        videoUrl: 'https://www.youtube.com/embed/GZbfZ033f74'
      },
      {
        id: 'ex-203',
        name: 'Incline Dumbbell Bicep Curls',
        targetMuscle: 'Biceps Long Head (Peak)',
        weightKg: '7.5 kg',
        sets: 3,
        reps: '12 reps',
        restSeconds: 45,
        description: 'Lie back on 45-degree incline bench with arms hanging fully extended. Curl dumbbells up without moving upper arms forward.',
        tips: 'Provides deep stretch at the bottom for maximum muscle fiber activation.',
        videoUrl: 'https://www.youtube.com/embed/soxrZlIl35U'
      }
    ]
  },
  {
    dayNumber: 3,
    dayName: 'Day 3: Active Rest & Core Mobility',
    isRestDay: true,
    exercises: [
      {
        id: 'ex-301',
        name: 'Plank Hold & Cat-Cow Stretch',
        targetMuscle: 'Core Stability & Spinal Mobility',
        weightKg: 'Bodyweight',
        sets: 3,
        reps: '60 seconds hold',
        restSeconds: 30,
        description: 'Engage core glutes and abs in elbow plank. Follow with 10 slow Cat-Cow spinal rotations to release lower back compression.',
        tips: 'Breathe deeply through nose and keep core pulled toward spine.',
        videoUrl: 'https://www.youtube.com/embed/pSHjTRCQxIw'
      }
    ]
  },
  {
    dayNumber: 4,
    dayName: 'Day 4: Legs & Glutes Sculpter',
    isRestDay: false,
    exercises: [
      {
        id: 'ex-401',
        name: 'Goblet Squats (Dumbbell/Kettlebell)',
        targetMuscle: 'Quads & Glutes',
        weightKg: '14 - 18 kg',
        sets: 4,
        reps: '12 reps',
        restSeconds: 75,
        description: 'Hold dumbbell vertically against chest. Stand feet shoulder-width, squat down until thighs are parallel to ground, driving up through heels.',
        tips: 'Keep knees tracking in line with second toes.',
        videoUrl: 'https://www.youtube.com/embed/MeIiIdhvKL4'
      },
      {
        id: 'ex-402',
        name: 'Romanian Deadlifts (RDL)',
        targetMuscle: 'Hamstrings & Posterior Chain',
        weightKg: '20 kg Barbell',
        sets: 4,
        reps: '10 - 12 reps',
        restSeconds: 60,
        description: 'Soft knee bend. Hinge at hips pushing buttocks backwards while sliding weight down thighs until hamstrings feel deep stretch.',
        tips: 'Keep spine flat as a tabletop throughout lower range.',
        videoUrl: 'https://www.youtube.com/embed/JCXUYuzwNrM'
      },
      {
        id: 'ex-403',
        name: 'Standing Calf Raises',
        targetMuscle: 'Gastrocnemius (Calves)',
        weightKg: '15 kg',
        sets: 3,
        reps: '15 - 20 reps',
        restSeconds: 45,
        description: 'Stand on edge of step. Press up onto toes as high as possible, pause for 1 second, then lower down below step level for stretch.',
        tips: 'Avoid bouncing at the bottom.',
        videoUrl: 'https://www.youtube.com/embed/-M4-G8p8fmc'
      }
    ]
  },
  {
    dayNumber: 5,
    dayName: 'Day 5: Shoulder & Deltoid Sculpting',
    isRestDay: false,
    exercises: [
      {
        id: 'ex-501',
        name: 'Seated Dumbbell Overhead Shoulder Press',
        targetMuscle: 'Anterior & Lateral Delts',
        weightKg: '10 kg/side',
        sets: 4,
        reps: '10 - 12 reps',
        restSeconds: 60,
        description: 'Sit back against upright bench. Press dumbbells vertically overhead until arms extend fully overhead, lowering softly to ear height.',
        tips: 'Core braced tight to support lower back.',
        videoUrl: 'https://www.youtube.com/embed/qEwKCR5JCog'
      },
      {
        id: 'ex-502',
        name: 'Dumbbell Lateral Raises',
        targetMuscle: 'Side Deltoid (Shoulder Width)',
        weightKg: '5 - 6 kg',
        sets: 4,
        reps: '15 reps',
        restSeconds: 45,
        description: 'Slight bend in elbows. Raise dumbbells out to sides until hands reach shoulder height with pinkies slightly tilted up like pouring water.',
        tips: 'Control lowering phase (eccentric) for 2 seconds.',
        videoUrl: 'https://www.youtube.com/embed/3VcKaXpzqRo'
      },
      {
        id: 'ex-503',
        name: 'Face Pulls with Cable Rope',
        targetMuscle: 'Rear Delts & Rotator Cuff',
        weightKg: '12 kg',
        sets: 3,
        reps: '15 reps',
        restSeconds: 45,
        description: 'Pull cable rope attachment directly towards nose height, flaring hands back next to ears while squeezing rear deltoids and upper back.',
        tips: 'Essential for posture correction and shoulder joint health.',
        videoUrl: 'https://www.youtube.com/embed/rep-qVOkqgk'
      }
    ]
  },
  {
    dayNumber: 6,
    dayName: 'Day 6: Full Body Conditioning & HIIT Burn',
    isRestDay: false,
    exercises: [
      {
        id: 'ex-601',
        name: 'Kettlebell Swings',
        targetMuscle: 'Glutes, Core & Cardiovascular',
        weightKg: '12 kg',
        sets: 4,
        reps: '20 reps',
        restSeconds: 45,
        description: 'Hinge at hips, swing kettlebell between legs, then snap hips forward forcefully to propel kettlebell to chest height using hip drive.',
        tips: 'Power comes from hips and glutes, not arms or shoulders.',
        videoUrl: 'https://www.youtube.com/embed/YSxHifyI6s8'
      },
      {
        id: 'ex-602',
        name: 'Mountain Climbers & Dumbbell Thrusters',
        targetMuscle: 'Full Body Agility',
        weightKg: '5 kg/side',
        sets: 3,
        reps: '12 reps / 30s climbers',
        restSeconds: 60,
        description: 'Squat down holding dumbbells at shoulders, drive up explosively into an overhead press. Follow immediately with fast mountain climbers.',
        tips: 'Pace yourself for high caloric output.',
        videoUrl: 'https://www.youtube.com/embed/cnyTQDSE884'
      }
    ]
  },
  {
    dayNumber: 7,
    dayName: 'Day 7: Complete Rest & Muscle Recovery',
    isRestDay: true,
    exercises: [
      {
        id: 'ex-701',
        name: 'Rest Day Foam Rolling & Deep Hydration',
        targetMuscle: 'Systemic Recovery',
        weightKg: 'None',
        sets: 1,
        reps: '20 mins',
        restSeconds: 0,
        description: 'Take complete physical rest. Foam roll quads, lats and calves for 15 minutes. Ensure high protein intake and 3.5L hydration.',
        tips: 'Prioritize 8 hours of quality sleep.',
        videoUrl: 'https://www.youtube.com/embed/4X_q4G_Wnso'
      }
    ]
  }
];

export const INITIAL_WORKOUT_PLAN: ClientWorkoutPlan = {
  id: 'wp-101',
  customerId: 'cust-101',
  splitType: '5_day',
  fitnessLevel: 'Intermediate',
  specificRequirements: 'Slight stiffness in left knee on heavy squats. Prefers dumbbell & cable variations with emphasis on waist tightening and upper body sculpting.',
  assignedTrainerName: 'Coach Vikram Verma (CSCS Certified Master Trainer)',
  updatedAt: '2026-08-01',
  schedule: MOCK_5_DAY_SCHEDULE
};

export const INITIAL_VIDEO_SESSIONS: OneOnOneVideoSession[] = [
  {
    id: 'vs-901',
    customerId: 'cust-101',
    customerName: 'Anjali Ramesh',
    date: '2026-08-06',
    timeSlot: '06:00 AM - 07:00 AM',
    period: 'Morning (5 AM - 9 AM)',
    trainerName: 'Coach Vikram Verma',
    isFreeSession: true,
    priceAmount: 0,
    status: 'Booked',
    meetLink: 'https://meet.google.com/pbw-fit-live'
  }
];
