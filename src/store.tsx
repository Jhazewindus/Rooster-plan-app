import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Absence, dateKey, Employee, emptyPlannerData, makeId, mondayOf, PlannerData, PlannerSettings, Schedule, Shift, Weekday } from './domain';
import { assignReplacement, canWorkOnDate, currentSchedule, generateScheduleRange, generateWeek, hasRegularCoverage, rebuildAffectedSchedules, rebuildSchedule, recommendations, suggestCoverage } from './planner';

const STORAGE_KEY = 'roosterplan.v1';
type PlannerContextValue = {
  data: PlannerData;
  weekStart: Date;
  schedule?: Schedule;
  ready: boolean;
  error: string | null;
  goToWeek: (date: Date) => void;
  addEmployee: (employee: Omit<Employee, 'id' | 'displayName' | 'active'>) => void;
  updateEmployee: (id: string, employee: Omit<Employee, 'id' | 'displayName' | 'active'>) => void;
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
  setScheduleStatus: (status: Schedule['status']) => void;
  loadDemo: () => void;
};

const PlannerContext = createContext<PlannerContextValue | null>(null);

export function PlannerProvider({ children }: React.PropsWithChildren) {
  const [data, setData] = useState<PlannerData>(emptyPlannerData);
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const schedule = currentSchedule(data, weekStart);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => { if (stored) setData(JSON.parse(stored) as PlannerData); })
      .catch(() => setError('Je gegevens konden niet worden geladen.'))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => setError('Je wijzigingen konden niet worden opgeslagen.'));
  }, [data, ready]);

  const updateSchedule = useCallback((next: Schedule) => {
    setData((current) => ({ ...current, schedules: [...current.schedules.filter((item) => item.id !== next.id), next] }));
  }, []);

  const addEmployee = useCallback((input: Omit<Employee, 'id' | 'displayName' | 'active'>) => {
    const employee: Employee = {
      ...input,
      id: makeId(),
      displayName: [input.firstName.trim(), input.lastName.trim()].filter(Boolean).join(' '),
      active: true,
    };
    setData((current) => ({ ...current, employees: [...current.employees, employee] }));
  }, []);

  const updateEmployee = useCallback((id: string, input: Omit<Employee, 'id' | 'displayName' | 'active'>) => {
    setData((current) => ({ ...current, employees: current.employees.map((item) => item.id === id
      ? { ...item, ...input, displayName: [input.firstName.trim(), input.lastName.trim()].filter(Boolean).join(' ') } : item) }));
  }, []);

  const addAbsence = useCallback((input: Omit<Absence, 'id'>) => {
    const absence: Absence = { ...input, id: makeId() };
    setData((current) => ({
      ...current,
      absences: [...current.absences, absence],
      schedules: rebuildAffectedSchedules(current, [...current.absences, absence], [absence]),
    }));
  }, []);

  const updateAbsence = useCallback((id: string, input: Omit<Absence, 'id'>) => {
    setData((current) => {
      const previous = current.absences.find((item) => item.id === id);
      if (!previous) return current;
      const updated = { ...input, id };
      const absences = current.absences.map((item) => item.id === id ? updated : item);
      return { ...current, absences, schedules: rebuildAffectedSchedules(current, absences, [previous, updated]) };
    });
  }, []);

  const removeAbsence = useCallback((id: string) => {
    setData((current) => {
      const previous = current.absences.find((item) => item.id === id);
      if (!previous) return current;
      const absences = current.absences.filter((item) => item.id !== id);
      return { ...current, absences, schedules: rebuildAffectedSchedules(current, absences, [previous]) };
    });
  }, []);

  const generateCurrentWeek = useCallback(() => {
    setData((current) => {
      const old = currentSchedule(current, weekStart);
      const next = old ? rebuildSchedule(old, current.employees, current.absences) : generateWeek(weekStart, current.employees, current.absences);
      return { ...current, schedules: [...current.schedules.filter((item) => item.id !== old?.id), next] };
    });
  }, [weekStart]);

  const generateMonths = useCallback((months: 1 | 6 | 12) => {
    setData((current) => ({ ...current, schedules: generateScheduleRange(weekStart, months, current.employees, current.absences, current.schedules) }));
  }, [weekStart]);

  const saveManualShift = useCallback((input: Omit<Shift, 'id' | 'source' | 'originalEmployeeId'>, existingId?: string): string | null => {
    const start = new Date(input.startAt);
    const end = new Date(input.endAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || dateKey(start) !== dateKey(end)) return 'Kies een begin- en eindtijd op dezelfde dag.';
    const employee = data.employees.find((item) => item.id === input.employeeId);
    if (!employee || !canWorkOnDate(employee, start)) return 'Deze medewerker kan niet op die dag werken (controleer ook de stageperiode).';
    const existing = currentSchedule(data, start);
    const base = existing ?? generateWeek(start, data.employees, data.absences);
    const otherShifts = base.shifts.filter((shift) => shift.id !== existingId);
    if (otherShifts.some((shift) => shift.employeeId === employee.id && overlapsShift(shift, start, end))) return 'Deze medewerker heeft al een overlappende dienst.';
    if (data.absences.some((absence) => absence.employeeId === employee.id && new Date(absence.startAt) < end && new Date(absence.endAt) > start)) return 'Deze medewerker is dan afwezig.';
    if (employee.kind === 'intern' && !hasRegularCoverage(start, end, otherShifts, data.employees)) return 'Een stagiair heeft tijdens de hele dienst een gewone medewerker nodig.';
    const shift: Shift = { ...input, id: existingId ?? makeId(), source: 'manual', originalEmployeeId: null };
    const manualShifts = [...(base.manualShifts ?? []).filter((item) => item.id !== existingId), shift];
    const next = rebuildSchedule({ ...base, manualShifts }, data.employees, data.absences);
    setData((current) => ({ ...current, schedules: [...current.schedules.filter((item) => item.id !== base.id), next] }));
    return null;
  }, [data]);

  const removeManualShift = useCallback((id: string) => {
    setData((current) => ({ ...current, schedules: current.schedules.map((item) => item.manualShifts?.some((shift) => shift.id === id)
      ? rebuildSchedule({ ...item, manualShifts: item.manualShifts.filter((shift) => shift.id !== id) }, current.employees, current.absences) : item) }));
  }, []);

  const setSettings = useCallback((settings: PlannerSettings) => setData((current) => ({ ...current, settings })), []);

  const assign = useCallback((shiftId: string, employeeId: string) => {
    if (!schedule) return false;
    const target = schedule.shifts.find((item) => item.id === shiftId && item.employeeId === null);
    const employee = data.employees.find((item) => item.id === employeeId);
    if (!target || !employee) return false;
    const option = recommendations(target, schedule, data.employees, data.absences, data.settings).find((item) => item.employee.id === employeeId);
    if (!option?.canCover) return false;
    updateSchedule(assignReplacement(schedule, shiftId, employeeId));
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
      updatedAt: new Date().toISOString(),
      shifts: [...schedule.shifts.filter((item) => item.id !== target.id), ...newShifts],
    });
    return true;
  }, [data.absences, data.employees, schedule, updateSchedule]);

  const setScheduleStatus = useCallback((status: Schedule['status']) => {
    if (schedule) updateSchedule({ ...schedule, status, updatedAt: new Date().toISOString() });
  }, [schedule, updateSchedule]);

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
    setData({ employees, absences: [absence], schedules: [demoSchedule], settings: { breaks: [] } });
  }, [weekStart]);

  const value = useMemo<PlannerContextValue>(() => ({
    data, weekStart, schedule, ready, error,
    goToWeek: (date) => setWeekStart(mondayOf(date)),
    addEmployee, updateEmployee, addAbsence, updateAbsence, removeAbsence, generateCurrentWeek, generateMonths,
    saveManualShift, removeManualShift, setSettings, assign, useCoveragePlan, setScheduleStatus, loadDemo,
  }), [data, weekStart, schedule, ready, error, addEmployee, updateEmployee, addAbsence, updateAbsence, removeAbsence, generateCurrentWeek, generateMonths, saveManualShift, removeManualShift, setSettings, assign, useCoveragePlan, setScheduleStatus, loadDemo]);

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
