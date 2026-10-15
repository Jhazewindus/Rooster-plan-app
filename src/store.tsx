import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Absence, dateKey, Employee, emptyPlannerData, makeId, mondayOf, PlannerData, PlannerSettings, Schedule, Shift, Weekday } from './domain';
import { assignReplacement, canWorkOnDate, currentSchedule, generateFutureScheduleRange, generateFutureWeek, generateWeek, hasRegularCoverage, rebuildAffectedSchedules, rebuildSchedule, recommendations, removeEmployeeFromData, suggestCoverage } from './planner';
import { parseLegacyData, parseStoredArchive, validateArchive } from './backup';
import { canUndo, HistoryEntry, PlannerArchive, recordChange, undoLast } from './history';
import { publicationIssues } from './publication';

const STORAGE_KEY = 'roosterplan.v2';
const LEGACY_STORAGE_KEY = 'roosterplan.v1';
type PlannerContextValue = {
  data: PlannerData;
  history: HistoryEntry[];
  canUndo: boolean;
  weekStart: Date;
  schedule?: Schedule;
  ready: boolean;
  storageBlocked: boolean;
  error: string | null;
  goToWeek: (date: Date) => void;
  addEmployee: (employee: Omit<Employee, 'id' | 'displayName' | 'active'>) => void;
  updateEmployee: (id: string, employee: Omit<Employee, 'id' | 'displayName' | 'active'>) => void;
  removeEmployee: (id: string) => void;
  addAbsence: (absence: Omit<Absence, 'id'>) => void;
  updateAbsence: (id: string, absence: Omit<Absence, 'id'>) => void;
  removeAbsence: (id: string) => void;
  generateCurrentWeek: () => void;
  generateMonths: (months: 1 | 6 | 12) => void;
  saveManualShift: (input: Omit<Shift, 'id' | 'source' | 'originalEmployeeId'>, existingId?: string) => string | null;
  removeManualShift: (id: string) => void;
  setSettings: (settings: PlannerSettings) => void;
  assign: (shiftId: string, employeeId: string) => boolean;
  useCoveragePlan: (shift: Shift) => boolean;
  setScheduleStatus: (status: Schedule['status']) => boolean;
  undoLastChange: () => void;
  restoreArchive: (archive: PlannerArchive) => void;
  loadDemo: () => void;
};

const PlannerContext = createContext<PlannerContextValue | null>(null);

export function PlannerProvider({ children }: React.PropsWithChildren) {
  const [archive, setArchive] = useState<PlannerArchive>(() => ({ data: emptyPlannerData(), history: [] }));
  const data = archive.data;
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [ready, setReady] = useState(false);
  const [writable, setWritable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const writeQueue = useRef(Promise.resolve());
  const schedule = currentSchedule(data, weekStart);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(async (stored) => {
        if (stored) setArchive(parseStoredArchive(stored));
        else {
          const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacy) setArchive(parseLegacyData(legacy));
        }
        setWritable(true);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Je gegevens konden niet worden geladen.'))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready || !writable) return;
    const serialized = JSON.stringify(archive);
    writeQueue.current = writeQueue.current.catch(() => undefined)
      .then(() => AsyncStorage.setItem(STORAGE_KEY, serialized))
      .catch(() => setError('Je wijzigingen konden niet worden opgeslagen.'));
  }, [archive, ready, writable]);

  const commit = useCallback((label: string, update: (current: PlannerData) => PlannerData) => {
    if (!writable) return;
    setArchive((current) => recordChange(current, update(current.data), label));
  }, [writable]);

  const undoLastChange = useCallback(() => setArchive((current) => undoLast(current)), []);
  const restoreArchive = useCallback((restored: PlannerArchive) => {
    setArchive(validateArchive(restored));
    setWritable(true);
    setError(null);
  }, []);

  const updateSchedule = useCallback((next: Schedule, label: string) => {
    commit(label, (current) => ({ ...current, schedules: [...current.schedules.filter((item) => item.id !== next.id), next] }));
  }, [commit]);

  const addEmployee = useCallback((input: Omit<Employee, 'id' | 'displayName' | 'active'>) => {
    const employee: Employee = {
      ...input,
      id: makeId(),
      displayName: [input.firstName.trim(), input.lastName.trim()].filter(Boolean).join(' '),
      active: true,
    };
    commit(`${employee.displayName} toegevoegd`, (current) => ({ ...current, employees: [...current.employees, employee] }));
  }, [commit]);

  const updateEmployee = useCallback((id: string, input: Omit<Employee, 'id' | 'displayName' | 'active'>) => {
    const name = [input.firstName.trim(), input.lastName.trim()].filter(Boolean).join(' ');
    commit(`${name} aangepast`, (current) => ({ ...current, employees: current.employees.map((item) => item.id === id
      ? { ...item, ...input, displayName: [input.firstName.trim(), input.lastName.trim()].filter(Boolean).join(' ') } : item) }));
  }, [commit]);

  const removeEmployee = useCallback((id: string) => {
    const name = data.employees.find((item) => item.id === id)?.displayName ?? 'Medewerker';
    commit(`${name} verwijderd`, (current) => removeEmployeeFromData(current, id));
  }, [data.employees, commit]);

  const addAbsence = useCallback((input: Omit<Absence, 'id'>) => {
    const absence: Absence = { ...input, id: makeId() };
    commit('Afwezigheid toegevoegd', (current) => ({
      ...current,
      absences: [...current.absences, absence],
      schedules: rebuildAffectedSchedules(current, [...current.absences, absence], [absence]),
    }));
  }, [commit]);

  const updateAbsence = useCallback((id: string, input: Omit<Absence, 'id'>) => {
    commit('Afwezigheid aangepast', (current) => {
      const previous = current.absences.find((item) => item.id === id);
      if (!previous) return current;
      const updated = { ...input, id };
      const absences = current.absences.map((item) => item.id === id ? updated : item);
      return { ...current, absences, schedules: rebuildAffectedSchedules(current, absences, [previous, updated]) };
    });
  }, [commit]);

  const removeAbsence = useCallback((id: string) => {
    commit('Afwezigheid verwijderd', (current) => {
      const previous = current.absences.find((item) => item.id === id);
      if (!previous) return current;
      const absences = current.absences.filter((item) => item.id !== id);
      return { ...current, absences, schedules: rebuildAffectedSchedules(current, absences, [previous]) };
    });
  }, [commit]);

  const generateCurrentWeek = useCallback(() => {
    commit('Weekrooster gegenereerd', (current) => ({ ...current, schedules: generateFutureWeek(weekStart, current.employees, current.absences, current.schedules) }));
  }, [weekStart, commit]);

  const generateMonths = useCallback((months: 1 | 6 | 12) => {
    commit(`${months} ${months === 1 ? 'maand' : 'maanden'} gegenereerd`, (current) => ({ ...current, schedules: generateFutureScheduleRange(weekStart, months, current.employees, current.absences, current.schedules) }));
  }, [weekStart, commit]);

  const saveManualShift = useCallback((input: Omit<Shift, 'id' | 'source' | 'originalEmployeeId'>, existingId?: string): string | null => {
    const start = new Date(input.startAt);
    const end = new Date(input.endAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || dateKey(start) !== dateKey(end)) return 'Kies een begin- en eindtijd op dezelfde dag.';
    const employee = data.employees.find((item) => item.id === input.employeeId);
    if (!employee || !canWorkOnDate(employee, start)) return 'Deze medewerker kan niet op die dag werken (controleer ook de werkperiode).';
    const existing = currentSchedule(data, start);
    const base = existing ?? generateWeek(start, data.employees, data.absences);
    const otherShifts = base.shifts.filter((shift) => shift.id !== existingId);
    if (otherShifts.some((shift) => shift.employeeId === employee.id && overlapsShift(shift, start, end) && !(employee.kind === 'intern' && input.paidInternShift && shift.source === 'default'))) return 'Deze medewerker heeft al een overlappende dienst.';
    if (data.absences.some((absence) => absence.employeeId === employee.id && new Date(absence.startAt) < end && new Date(absence.endAt) > start)) return 'Deze medewerker is dan afwezig.';
    if (employee.kind === 'intern' && !input.paidInternShift && !hasRegularCoverage(start, end, otherShifts, data.employees)) return 'Een stagiair heeft tijdens de hele dienst een gewone medewerker nodig.';
    const shift: Shift = { ...input, paidInternShift: employee.kind === 'intern' && input.paidInternShift ? true : undefined, id: existingId ?? makeId(), source: 'manual', originalEmployeeId: null };
    const manualShifts = [...(base.manualShifts ?? []).filter((item) => item.id !== existingId), shift];
    const next = rebuildSchedule({ ...base, manualShifts }, data.employees, data.absences);
    commit(existingId ? 'Handmatige dienst aangepast' : 'Handmatige dienst toegevoegd', (current) => ({ ...current, schedules: [...current.schedules.filter((item) => item.id !== base.id), next] }));
    return null;
  }, [data, commit]);

  const removeManualShift = useCallback((id: string) => {
    commit('Handmatige dienst verwijderd', (current) => ({ ...current, schedules: current.schedules.map((item) => item.manualShifts?.some((shift) => shift.id === id)
      ? rebuildSchedule({ ...item, manualShifts: item.manualShifts.filter((shift) => shift.id !== id) }, current.employees, current.absences) : item) }));
  }, [commit]);

  const setSettings = useCallback((settings: PlannerSettings) => commit('Pauzes aangepast', (current) => ({ ...current, settings })), [commit]);

  const assign = useCallback((shiftId: string, employeeId: string) => {
    if (!schedule) return false;
    const target = schedule.shifts.find((item) => item.id === shiftId && item.employeeId === null);
    const employee = data.employees.find((item) => item.id === employeeId);
    if (!target || !employee) return false;
    const option = recommendations(target, schedule, data.employees, data.absences, data.settings).find((item) => item.employee.id === employeeId);
    if (!option?.canCover) return false;
    updateSchedule({ ...assignReplacement(schedule, shiftId, employeeId), status: 'draft' }, 'Open dienst ingevuld');
    return true;
  }, [data.absences, data.employees, schedule, updateSchedule]);

  const useCoveragePlan = useCallback((target: Shift) => {
    if (!schedule || target.employeeId !== null) return false;
    const plan = suggestCoverage(target, schedule, data.employees, data.absences);
    if (!plan.isComplete) return false;
    const newShifts: Shift[] = plan.segments.map((segment) => ({
      id: makeId(), employeeId: segment.employeeId, originalEmployeeId: target.originalEmployeeId,
      startAt: segment.startAt, endAt: segment.endAt, source: 'replacement', notes: '',
    }));
    updateSchedule({
      ...schedule,
      status: 'draft',
      updatedAt: new Date().toISOString(),
      shifts: [...schedule.shifts.filter((item) => item.id !== target.id), ...newShifts],
    }, 'Open dienst verdeeld');
    return true;
  }, [data.absences, data.employees, schedule, updateSchedule]);

  const setScheduleStatus = useCallback((status: Schedule['status']) => {
    if (!schedule || status !== 'draft' && publicationIssues(schedule, data.employees).length > 0) return false;
    updateSchedule({ ...schedule, status, updatedAt: new Date().toISOString() }, status === 'draft' ? 'Rooster heropend' : status === 'final' ? 'Rooster definitief gemaakt' : 'Rooster gepubliceerd');
    return true;
  }, [schedule, data.employees, updateSchedule]);

  const loadDemo = useCallback(() => {
    const colors = ['#B76445', '#668B6B', '#D29C55', '#7B94A6'];
    const employees: Employee[] = [
      employee('Lisa', 'Jansen', 'Dierenverzorging', 32, [1, 2, 4, 5], 8, 16, colors[0]),
      employee('Mark', 'de Vries', 'Balie', 40, [1, 2, 3, 4, 5], 9, 17, colors[1]),
      employee('Sophie', 'Bakker', 'Hondenopvang', 32, [1, 3, 4, 5], 8, 16, colors[2]),
      employee('Peter', 'Smit', 'Dierenverzorging', 24, [2, 3, 4], 10, 18, colors[3]),
    ];
    const monday = new Date(weekStart);
    const start = new Date(monday); start.setHours(8, 0, 0, 0);
    const end = new Date(monday); end.setHours(12, 0, 0, 0);
    const absence: Absence = { id: makeId(), employeeId: employees[0].id, type: 'sick', startAt: start.toISOString(), endAt: end.toISOString(), notes: 'Voorbeeld' };
    const demoSchedule = generateWeek(weekStart, employees, [absence]);
    commit('Voorbeeldgegevens geladen', () => ({ employees, absences: [absence], schedules: [demoSchedule], settings: { breaks: [] } }));
  }, [weekStart, commit]);

  const value = useMemo<PlannerContextValue>(() => ({
    data, history: archive.history, canUndo: canUndo(archive), weekStart, schedule, ready, storageBlocked: !writable, error,
    goToWeek: (date) => setWeekStart(mondayOf(date)),
    addEmployee, updateEmployee, removeEmployee, addAbsence, updateAbsence, removeAbsence, generateCurrentWeek, generateMonths,
    saveManualShift, removeManualShift, setSettings, assign, useCoveragePlan, setScheduleStatus, undoLastChange, restoreArchive, loadDemo,
  }), [archive, data, weekStart, schedule, ready, writable, error, addEmployee, updateEmployee, removeEmployee, addAbsence, updateAbsence, removeAbsence, generateCurrentWeek, generateMonths, saveManualShift, removeManualShift, setSettings, assign, useCoveragePlan, setScheduleStatus, undoLastChange, restoreArchive, loadDemo]);

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

export function usePlanner(): PlannerContextValue {
  const value = useContext(PlannerContext);
  if (!value) throw new Error('usePlanner moet binnen PlannerProvider worden gebruikt.');
  return value;
}

function employee(firstName: string, lastName: string, role: string, hours: number, days: number[], startHour: number, endHour: number, color: string): Employee {
  const availability: Employee['availability'] = {};
  for (const day of days) availability[day as Weekday] = { startMinute: startHour * 60, endMinute: endHour * 60 };
  return { id: makeId(), firstName, lastName, displayName: `${firstName} ${lastName}`, role, color, weeklyContractMinutes: hours * 60, active: true, availability };
}

function overlapsShift(shift: Shift, start: Date, end: Date): boolean {
  return new Date(shift.startAt) < end && new Date(shift.endAt) > start;
}
