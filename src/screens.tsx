import React, { useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AbsenceForm } from './AbsenceForm';
import { EmployeeForm } from './EmployeeForm';
import { Absence, ABSENCE_COLOR, ABSENCE_LABEL, Employee, formatTime, WEEKDAYS } from './domain';
import { currentSchedule, hoursForEmployee } from './planner';
import { usePlanner } from './store';
import { Avatar, Card, EmptyState, PageHeading, Pill, PrimaryButton, SectionTitle, palette, SecondaryButton } from './ui';

export function DashboardScreen({ onNavigate }: { onNavigate: (tab: 'week' | 'team' | 'absences') => void }) {
  const planner = usePlanner();
  const { data } = planner;
  const today = new Date();
  const todaySchedule = currentSchedule(data, today);
  const todayShifts = todaySchedule?.shifts.filter((shift) => sameDay(new Date(shift.startAt), today)) ?? [];
  const openShifts = todayShifts.filter((shift) => !shift.employeeId);
  const absencesToday = data.absences.filter((absence) => new Date(absence.startAt) <= endOfDay(today) && new Date(absence.endAt) > startOfDay(today));
  const totalMinutes = todaySchedule?.shifts.reduce((sum, shift) => sum + (shift.employeeId ? (new Date(shift.endAt).getTime() - new Date(shift.startAt).getTime()) / 60_000 : 0), 0) ?? 0;
  const hourAlerts = data.employees.filter((employee) => employee.active && employee.weeklyContractMinutes > 0 && todaySchedule && hoursForEmployee(todaySchedule, employee.id) > employee.weeklyContractMinutes / 60);

  return <ScrollView style={{ flex: 1, backgroundColor: palette.page }} contentContainerStyle={{ padding: 19, paddingBottom: 30 }}>
    <PageHeading eyebrow={greeting()} title="Jouw planning" subtitle={new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(today)} right={<Image source={require('../assets/icon.png')} accessibilityLabel="Een hond en een kat" resizeMode="contain" style={{ width: 58, height: 58 }} />} />

    {data.employees.length === 0 ? <>
      <View style={{ borderRadius: 23, padding: 21, backgroundColor: '#B76445', overflow: 'hidden' }}>
        <View style={{ position: 'absolute', right: -16, top: -35, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.10)' }} />
        <Text style={{ color: '#F5DCCF', fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>HONDEN & KATTEN · TEAMPLANNING</Text>
        <Text style={{ color: '#FFFEFA', fontSize: 23, fontWeight: '900', lineHeight: 29, marginTop: 9, maxWidth: 235 }}>Een fijn verblijf begint met een goed rooster.</Text>
        <Text style={{ color: '#F6E2D7', fontSize: 13, lineHeight: 20, marginTop: 8, maxWidth: 235 }}>Plan het team dat elke hond en kat een warm welkom geeft.</Text>
        <Image source={require('../assets/icon.png')} accessibilityLabel="Hond en kat" resizeMode="contain" style={{ position: 'absolute', width: 110, height: 110, right: -7, bottom: -5 }} />
      </View>
      <View style={{ gap: 10, marginTop: 15 }}>
        <PrimaryButton title="Voeg je eerste medewerker toe" icon="person-add" onPress={() => onNavigate('team')} />
        <SecondaryButton title="Eerst de voorbeeldplanning bekijken" icon="eye-outline" onPress={planner.loadDemo} />
      </View>
    </> : <>
      <View style={{ backgroundColor: '#B76445', borderRadius: 22, padding: 19, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', right: -23, top: -43, width: 160, height: 160, borderRadius: 80, borderWidth: 30, borderColor: 'rgba(255,255,255,0.09)' }} />
        <Text style={{ color: '#F5DCCF', fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>VANDAAG IN ÉÉN OOGOPSLAG</Text>
        <Text style={{ color: '#FFF', fontSize: 25, fontWeight: '900', marginTop: 8 }}>{todayShifts.filter((shift) => shift.employeeId).length} diensten gepland</Text>
        <Text style={{ color: '#F6E2D7', fontSize: 13, marginTop: 5 }}>{absencesToday.length} afwezig · {openShifts.length} open · {formatHours(totalMinutes)} uur</Text>
        <Pressable onPress={() => onNavigate('week')} style={{ marginTop: 15, alignSelf: 'flex-start', borderRadius: 12, backgroundColor: '#FFFEFA', paddingVertical: 9, paddingHorizontal: 12, flexDirection: 'row', gap: 7, alignItems: 'center' }}><Text style={{ color: palette.primaryDark, fontWeight: '800', fontSize: 12 }}>Bekijk rooster</Text><Ionicons name="arrow-forward" size={15} color={palette.primaryDark} /></Pressable>
        <Image source={require('../assets/icon.png')} accessibilityLabel="Hond en kat" resizeMode="contain" style={{ position: 'absolute', width: 96, height: 96, right: -10, bottom: -16 }} />
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 13 }}>
        <Metric title="Actief team" value={String(data.employees.filter((employee) => employee.active).length)} icon="people-outline" tint={palette.palePrimary} iconColor={palette.primary} />
        <Metric title="Afwezig vandaag" value={String(absencesToday.length)} icon="calendar-clear-outline" tint="#FFF2E7" iconColor="#C47E37" />
      </View>

      {openShifts.length > 0 ? <>
        <SectionTitle title="Aandacht nodig" trailing={<Pill text={`${openShifts.length} OPEN`} color="#A6631D" background="#FFF0D9" />} />
        <View style={{ gap: 9 }}>
          {openShifts.slice(0, 3).map((shift) => <Pressable key={shift.id} onPress={() => onNavigate('week')}><Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 }}><View style={{ width: 37, height: 37, backgroundColor: '#FFF0D9', borderRadius: 13, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="alert-circle" size={20} color="#B87932" /></View><View style={{ flex: 1 }}><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 13 }}>Open dienst vandaag</Text><Text style={{ color: palette.muted, fontSize: 12, marginTop: 4 }}>{formatTime(shift.startAt)} – {formatTime(shift.endAt)}</Text></View><Ionicons name="chevron-forward" size={18} color="#A6ADBA" /></Card></Pressable>)}
        </View>
      </> : null}

      {hourAlerts.length ? <>
        <SectionTitle title="Uren om op te letten" />
        <Card style={{ gap: 11 }}>{hourAlerts.map((employee) => <View key={employee.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Avatar employee={employee} size={30} /><Text style={{ flex: 1, color: palette.ink, fontSize: 12, fontWeight: '700' }}>{employee.displayName}</Text><Pill text={`${formatHours(hoursForEmployee(todaySchedule!, employee.id) * 60)} / ${formatHours(employee.weeklyContractMinutes)} u`} color="#A6631D" background="#FFF3E2" /></View>)}</Card>
      </> : null}

      <SectionTitle title="Snel naar" />
      <View style={{ flexDirection: 'row', gap: 9 }}>
        <QuickLink icon="person-add-outline" title="Medewerker" onPress={() => onNavigate('team')} />
        <QuickLink icon="calendar-outline" title="Afwezigheid" onPress={() => onNavigate('absences')} />
        <QuickLink icon="grid-outline" title="Weekrooster" onPress={() => onNavigate('week')} />
      </View>
    </>}
  </ScrollView>;
}

function Metric({ title, value, icon, tint, iconColor }: { title: string; value: string; icon: React.ComponentProps<typeof Ionicons>['name']; tint: string; iconColor: string }) {
  return <Card style={{ flex: 1, padding: 14 }}><View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={17} color={iconColor} /></View><Text style={{ color: palette.ink, fontWeight: '900', fontSize: 23, marginTop: 11 }}>{value}</Text><Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600', marginTop: 2 }}>{title}</Text></Card>;
}

function QuickLink({ icon, title, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, borderRadius: 17, backgroundColor: pressed ? '#F1D9CB' : '#FFF', borderWidth: 1, borderColor: '#E9E0D5', paddingVertical: 13, alignItems: 'center', gap: 8 })}><Ionicons name={icon} size={20} color={palette.primary} /><Text style={{ color: palette.ink, fontSize: 10, fontWeight: '700' }}>{title}</Text></Pressable>;
}

export function TeamScreen() {
  const { data, addEmployee } = usePlanner();
  const [formVisible, setFormVisible] = useState(false);
  const employees = data.employees.filter((employee) => employee.active);
  return <View style={{ flex: 1, backgroundColor: palette.page }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 19, paddingBottom: 28 }}>
      <PageHeading eyebrow="Jouw mensen" title="Medewerkers" subtitle={`${employees.length} actieve ${employees.length === 1 ? 'medewerker' : 'medewerkers'}`} right={<Pressable onPress={() => setFormVisible(true)} style={{ width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.primary }}><Ionicons name="add" size={24} color="#FFF" /></Pressable>} />
      {employees.length === 0 ? <EmptyState title="Nog geen teamleden" detail="Voeg je vaste team toe. De normale werkdagen en uren hoef je daarna niet steeds opnieuw in te voeren." icon="people-outline" action={<PrimaryButton title="Medewerker toevoegen" icon="person-add" onPress={() => setFormVisible(true)} />} /> : <View style={{ gap: 10 }}>
        {employees.map((employee) => <TeamMember key={employee.id} employee={employee} />)}
        <View style={{ marginTop: 7 }}><SecondaryButton title="Nog iemand toevoegen" icon="add" onPress={() => setFormVisible(true)} /></View>
      </View>}
    </ScrollView>
    <EmployeeForm visible={formVisible} onClose={() => setFormVisible(false)} onSave={addEmployee} employeeCount={data.employees.length} />
  </View>;
}

function TeamMember({ employee }: { employee: Employee }) {
  const weekDays = WEEKDAYS.filter(({ id }) => employee.availability[id]);
  return <Card style={{ padding: 14 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}><Avatar employee={employee} size={45} /><View style={{ flex: 1 }}><Text style={{ color: palette.ink, fontSize: 15, fontWeight: '800' }}>{employee.displayName}</Text><Text style={{ color: palette.muted, fontSize: 12, marginTop: 3 }}>{employee.role}</Text></View><Pill text={`${employee.weeklyContractMinutes / 60} U`} /></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 13 }}>{weekDays.map(({ id, short }) => { const window = employee.availability[id]!; return <View key={id} style={{ borderRadius: 10, backgroundColor: '#F4F5F8', paddingHorizontal: 8, paddingVertical: 6 }}><Text style={{ color: palette.ink, fontSize: 10, fontWeight: '800' }}>{short} {formatMinutes(window.startMinute)}–{formatMinutes(window.endMinute)}</Text></View>; })}</View>
  </Card>;
}

export function AbsencesScreen() {
  const planner = usePlanner();
  const [formVisible, setFormVisible] = useState(false);
  const sortedAbsences = useMemo(() => [...planner.data.absences].sort((a, b) => a.startAt.localeCompare(b.startAt)), [planner.data.absences]);
  return <View style={{ flex: 1, backgroundColor: palette.page }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 19, paddingBottom: 28 }}>
      <PageHeading eyebrow="Uitzonderingen" title="Afwezigheid" subtitle="Houd beschikbaarheid actueel." right={<Pressable disabled={!planner.data.employees.length} onPress={() => setFormVisible(true)} style={{ width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: planner.data.employees.length ? palette.primary : '#C9CDE1' }}><Ionicons name="add" size={24} color="#FFF" /></Pressable>} />
      {sortedAbsences.length === 0 ? <EmptyState title="Iedereen is beschikbaar" detail="Ziekte, vakantie of een vrije dag? Voeg het toe en open diensten verschijnen vanzelf." icon="sunny-outline" action={planner.data.employees.length ? <PrimaryButton title="Afwezigheid melden" icon="add" onPress={() => setFormVisible(true)} /> : undefined} /> : <View style={{ gap: 9 }}>{sortedAbsences.map((absence) => <AbsenceRow key={absence.id} absence={absence} employee={planner.data.employees.find((item) => item.id === absence.employeeId)} />)}</View>}
    </ScrollView>
    <AbsenceForm visible={formVisible} employees={planner.data.employees.filter((employee) => employee.active)} onClose={() => setFormVisible(false)} onSave={(absence) => planner.addAbsence(absence)} />
  </View>;
}

function AbsenceRow({ absence, employee }: { absence: Absence; employee?: Employee }) {
  const color = ABSENCE_COLOR[absence.type];
  const date = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(absence.startAt));
  const start = new Date(absence.startAt); const end = new Date(absence.endAt);
  const partial = start.getHours() !== 0 || start.getMinutes() !== 0 || end.getHours() !== 0 || end.getMinutes() !== 0;
  return <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
    <View style={{ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}18` }}><Ionicons name={absence.type === 'sick' ? 'medkit-outline' : absence.type === 'vacation' ? 'airplane-outline' : 'calendar-outline'} size={18} color={color} /></View>
    <View style={{ flex: 1 }}><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 13 }}>{employee?.displayName ?? 'Onbekende medewerker'} · {ABSENCE_LABEL[absence.type]}</Text><Text style={{ color: palette.muted, fontSize: 11, marginTop: 4 }}>{date}{partial ? ` · ${formatTime(absence.startAt)}–${formatTime(absence.endAt)}` : ' · Hele dag'}</Text>{absence.notes ? <Text style={{ color: palette.muted, fontSize: 11, marginTop: 3 }}>{absence.notes}</Text> : null}</View>
  </Card>;
}

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond';
}
function formatHours(minutes: number): string { const hours = minutes / 60; return Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace('.', ','); }
function formatMinutes(minutes: number): string { return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
function sameDay(a: Date, b: Date): boolean { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function startOfDay(date: Date): Date { const result = new Date(date); result.setHours(0, 0, 0, 0); return result; }
function endOfDay(date: Date): Date { const result = startOfDay(date); result.setDate(result.getDate() + 1); return result; }
