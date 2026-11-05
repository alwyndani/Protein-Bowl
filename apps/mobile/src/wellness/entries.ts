/**
 * Entries on the Wellness landing screen. The coordinator can add more (for example Workouts) at start-up with
 * registerWellnessEntry({ key, title, description, routeName }); the route must exist in the navigator that hosts WellnessHome
 * (WellnessNavigator accepts extra screens for that).
 */
export interface WellnessEntry {
  key: string;
  title: string;
  description: string;
  routeName: string;
}

const registered: WellnessEntry[] = [];

export const baseWellnessEntries: WellnessEntry[] = [
  { key: 'health', title: 'Health profile', description: 'Your body measurements, goals, allergies and conditions.', routeName: 'HealthProfile' },
  { key: 'diet', title: 'Diet plan', description: 'Request a plan from a nutritionist and review it.', routeName: 'DietPlans' }
];

export function registerWellnessEntry(entry: WellnessEntry): void {
  const i = registered.findIndex((e) => e.key === entry.key);
  if (i >= 0) registered[i] = entry;
  else registered.push(entry);
}

export function clearRegisteredWellnessEntries(): void {
  registered.length = 0;
}

export const getWellnessEntries = (): WellnessEntry[] => [...baseWellnessEntries, ...registered];
