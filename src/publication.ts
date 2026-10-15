import { dateKey, Employee, formatTime, Schedule } from './domain';
import { dailyCoverageGaps, hasRegularCoverage } from './planner';

export type PublicationIssue = { day: string; kind: 'open' | 'coverage' | 'intern'; message: string };

/** A week is ready only when every day has five people from 07:00 to 19:30. */
export function publicationIssues(schedule: Schedule, employees: Employee[]): PublicationIssue[] {
  const issues: PublicationIssue[] = [];
  const monday = new Date(schedule.weekStart);
  for (let offset = 0; offset < 7; offset++) {
    const day = new Date(monday);
    day.setDate(day.getDate() + offset);
    const key = dateKey(day);
    const label = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' }).format(day);
    const shifts = schedule.shifts.filter((shift) => dateKey(new Date(shift.startAt)) === key);
    const open = shifts.filter((shift) => shift.employeeId === null).length;
    if (open) issues.push({ day: key, kind: 'open', message: `${label}: ${open} open dienst${open === 1 ? '' : 'en'}` });
    const gaps = dailyCoverageGaps(day, shifts, employees);
    if (gaps.length) {
      const first = gaps[0];
      issues.push({ day: key, kind: 'coverage', message: `${label}: minder dan 5 medewerkers van ${formatTime(first.startAt)} tot ${formatTime(first.endAt)}${gaps.length > 1 ? ` (en ${gaps.length - 1} ander${gaps.length === 2 ? '' : 'e'} tijdvak${gaps.length === 2 ? '' : 'ken'})` : ''}` });
    }
    const interns = shifts.filter((shift) => !shift.paidInternShift && employees.some((employee) => employee.id === shift.employeeId && employee.kind === 'intern')
      && !hasRegularCoverage(new Date(shift.startAt), new Date(shift.endAt), shifts, employees));
    if (interns.length) issues.push({ day: key, kind: 'intern', message: `${label}: ${interns.length} stagiair${interns.length === 1 ? '' : 's'} zonder medewerker` });
  }
  return issues;
}
