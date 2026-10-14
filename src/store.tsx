import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Absence, Employee, emptyPlannerData, makeId, PlannerData, Schedule, Shift, Weekday } from './domain';
import { applyAbsence, assignReplacement, currentSchedule, generateWeek, recommendations, suggestCoverage } from './planner';

const STORAGE_KEY = 'roosterplan.v1';
type PlannerContextValue = {
  data: PlannerData;
  weekStart: Date;
  schedule?: Schedule;
  ready: boolean;
  error: string | null;
  goToWeek: (date: Date) => void;
  addEmployee: (employee: Omit<Employee, 'id' | 'displayName' | 'active'>) => void;
  addAbsence: (absence: Omit<Absence, 'id'>) => void;
  generateCurrentWeek: () => void;
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

  const addAbsence = useCallback((input: Omit<Absence, 'id'>) => {
    const absence: Absence = { ...input, id: makeId() };
    setData((current) => ({
      ...current,
      absences: [...current.absences, absence],
      schedules: current.schedules.map((item) => applyAbsence(item, absence)),
    }));
  }, []);

  const generateCurrentWeek = useCallback(() => {
    const next = generateWeek(weekStart, data.employees, data.absences);
    setData((current) => ({ ...current, schedules: [...current.schedules.filter((item) => dateKey(new Date(item.weekStart)) !== dateKey(weekStart)), next] }));
  }, [data.absences, data.employees, weekStart]);

  const assign = useCallback((shiftId: string, employeeId: string) => {
    if (!schedule) return false;
    const target = schedule.shifts.find((item) => item.id === shiftId && item.employeeId === null);
    const employee = data.employees.find((item) => item.id === employeeId);
    if (!target || !employee) return false;
    const option = recommendations(target, schedule, data.employees, data.absences).find((item) => item.employee.id === employeeId);
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
    setData({ employees, absences: [absence], schedules: [demoSchedule] });
  }, [weekStart]);

  const value = useMemo<PlannerContextValue>(() => ({
    data, weekStart, schedule, ready, error,
    goToWeek: (date) => setWeekStart(mondayOf(date)),
    addEmployee, addAbsence, generateCurrentWeek, assign, useCoveragePlan, setScheduleStatus, loadDemo,
  }), [data, weekStart, schedule, ready, error, addEmployee, addAbsence, generateCurrentWeek, assign, useCoveragePlan, setScheduleStatus, loadDemo]);

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

function mondayOf(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
