export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO weekday: Monday = 1
export type AbsenceType = 'sick' | 'vacation' | 'dayOff' | 'specialLeave' | 'unavailable' | 'other';
export type ScheduleStatus = 'draft' | 'final' | 'published';

export type TimeWindow = { startMinute: number; endMinute: number };

export type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  role: string;
  color: string;
  weeklyContractMinutes: number;
  active: boolean;
  availability: Partial<Record<Weekday, TimeWindow>>;
};

export type Absence = {
  id: string;
  employeeId: string;
  type: AbsenceType;
  startAt: string;
  endAt: string;
  notes: string;
};

export type Shift = {
  id: string;
  employeeId: string | null;
  originalEmployeeId: string | null;
  startAt: string;
  endAt: string;
  source: 'default' | 'replacement' | 'manual';
  notes: string;
};

export type Schedule = {
  id: string;
  weekStart: string;
  status: ScheduleStatus;
  createdAt: string;
  updatedAt: string;
  shifts: Shift[];
};

export type PlannerData = {
  employees: Employee[];
  absences: Absence[];
  schedules: Schedule[];
};

export type Recommendation = {
  employee: Employee;
  score: number;
  canCover: boolean;
  projectedWeeklyMinutes: number;
  exceedsContract: boolean;
  reasons: string[];
};

export type CoverageSegment = { employeeId: string; startAt: string; endAt: string };
export type CoveragePlan = { segments: CoverageSegment[]; isComplete: boolean };

export const WEEKDAYS: { id: Weekday; short: string; long: string }[] = [
  { id: 1, short: 'MA', long: 'Maandag' },
  { id: 2, short: 'DI', long: 'Dinsdag' },
  { id: 3, short: 'WO', long: 'Woensdag' },
  { id: 4, short: 'DO', long: 'Donderdag' },
  { id: 5, short: 'VR', long: 'Vrijdag' },
  { id: 6, short: 'ZA', long: 'Zaterdag' },
  { id: 7, short: 'ZO', long: 'Zondag' },
];

export const ABSENCE_LABEL: Record<AbsenceType, string> = {
  sick: 'Ziek',
  vacation: 'Vakantie',
  dayOff: 'Vrije dag',
  specialLeave: 'Bijzonder verlof',
  unavailable: 'Niet beschikbaar',
  other: 'Anders',
};

export const ABSENCE_COLOR: Record<AbsenceType, string> = {
  sick: '#CF675D',
  vacation: '#7F9FB4',
  dayOff: '#A8896C',
  specialLeave: '#D08A42',
  unavailable: '#7D756D',
  other: '#5E8267',
};

export const EMPLOYEE_COLORS = ['#B76445', '#668B6B', '#D29C55', '#7B94A6', '#C77A61', '#8D8560'];

export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyPlannerData(): PlannerData {
  return { employees: [], absences: [], schedules: [] };
}

export function toIsoWeekday(date: Date): Weekday {
  return (((date.getDay() + 6) % 7) + 1) as Weekday;
}

export function mondayOf(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - (toIsoWeekday(result) - 1));
  return result;
}

export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateOnWeekday(weekStart: Date, weekday: Weekday): Date {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + weekday - 1);
  return date;
}

export function atMinute(day: Date, minute: number): Date {
  const date = new Date(day);
  date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return date;
}

export function formatTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export function durationMinutes(shift: Pick<Shift, 'startAt' | 'endAt'>): number {
  return Math.max(0, Math.round((new Date(shift.endAt).getTime() - new Date(shift.startAt).getTime()) / 60_000));
}
