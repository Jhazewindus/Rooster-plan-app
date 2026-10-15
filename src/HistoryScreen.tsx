import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dateKey, formatTime } from './domain';
import { historicalRosterDay, moveCalendarMonths } from './rosterHistory';
import { usePlanner } from './store';
import { Avatar, Card, PageHeading, palette, Pill } from './ui';

const WEEKDAYS = ['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO'];
const SHORT_MONTH = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' });
const FULL_DATE = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function HistoryScreen() {
  const { data } = usePlanner();
  const { width, height } = useWindowDimensions();
  const wide = width >= 850 && width > height;
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const today = startOfDay(new Date());
  const selected = historicalRosterDay(data, selectedDate);
  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const dayCount = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const leadingDays = (monthStart.getDay() + 6) % 7;
  const calendarDays = Array.from({ length: leadingDays + dayCount }, (_, index) => index < leadingDays ? null : index - leadingDays + 1);
  const datesWithShifts = useMemo(() => new Set(data.schedules.flatMap((schedule) => schedule.shifts.map((shift) => dateKey(new Date(shift.startAt))))), [data.schedules]);
  const nextMonthIsFuture = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1) > new Date(today.getFullYear(), today.getMonth(), 1);

  const jumpBack = (months: number) => setSelectedDate(moveCalendarMonths(today, -months));
  const moveMonth = (months: number) => {
    const next = moveCalendarMonths(selectedDate, months);
    setSelectedDate(next > today ? today : next);
  };

  return <ScrollView style={{ flex: 1, backgroundColor: palette.page }} contentContainerStyle={{ padding: 19, paddingBottom: 30 }}>
    <PageHeading eyebrow="Roosterhistorie" title="Terugkijken" subtitle="Kies een dag en bekijk wie op het bewaarde rooster stond." />
    <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'flex-start', gap: 15 }}>
      <Card style={{ width: wide ? 390 : '100%', padding: 16 }}>
        <Text style={{ color: palette.ink, fontSize: 15, fontWeight: '800' }}>Snel terug</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 }}>
          {([ [1, '1 maand'], [2, '2 maanden'], [12, '1 jaar'], [24, '2 jaar'], [36, '3 jaar'] ] as const).map(([months, label]) => (
            <Pressable key={months} accessibilityRole="button" accessibilityLabel={`${label} terug vanaf vandaag`} onPress={() => jumpBack(months)} style={{ borderRadius: 10, backgroundColor: palette.palePrimary, paddingHorizontal: 11, paddingVertical: 9 }}>
              <Text style={{ color: palette.primaryDark, fontSize: 12, fontWeight: '800' }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 13 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Vorige maand" onPress={() => moveMonth(-1)} style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: palette.palePrimary, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="chevron-back" size={18} color={palette.primary} /></Pressable>
          <Text style={{ color: palette.ink, fontSize: 17, fontWeight: '800', textTransform: 'capitalize' }}>{SHORT_MONTH.format(monthStart)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Volgende maand" disabled={nextMonthIsFuture} onPress={() => moveMonth(1)} style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: nextMonthIsFuture ? '#F1EEE9' : palette.palePrimary, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="chevron-forward" size={18} color={nextMonthIsFuture ? '#B8AEA5' : palette.primary} /></Pressable>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {WEEKDAYS.map((label) => <Text key={label} style={{ width: '14.28%', textAlign: 'center', color: palette.muted, fontSize: 10, fontWeight: '800', marginBottom: 7 }}>{label}</Text>)}
          {calendarDays.map((day, index) => {
            if (day === null) return <View key={`empty-${index}`} style={{ width: '14.28%', height: 43 }} />;
            const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
            const key = dateKey(date);
            const active = key === dateKey(selectedDate);
            const future = date > today;
            const marked = datesWithShifts.has(key);
            return <View key={key} style={{ width: '14.28%', height: 43, padding: 2 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${FULL_DATE.format(date)}${marked ? ', rooster bewaard' : ''}`} accessibilityState={{ selected: active, disabled: future }} disabled={future} onPress={() => setSelectedDate(date)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: active ? palette.primary : marked ? palette.palePrimary : 'transparent' }}>
                <Text style={{ color: active ? '#FFF' : future ? '#B8AEA5' : palette.ink, fontSize: 13, fontWeight: active || marked ? '800' : '600' }}>{day}</Text>
                {marked ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: active ? '#FFF' : palette.primary }} /> : null}
              </Pressable>
            </View>;
          })}
        </View>
        <Text style={{ color: palette.muted, fontSize: 11, marginTop: 13 }}>Een stip geeft aan dat er een dienst op die dag bewaard is.</Text>
      </Card>

      <Card style={{ width: wide ? undefined : '100%', flex: wide ? 1 : undefined, padding: 18 }}>
        <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '800' }}>OP HET ROOSTER</Text>
        <Text style={{ color: palette.ink, fontSize: 20, fontWeight: '800', textTransform: 'capitalize', marginTop: 4 }}>{FULL_DATE.format(selectedDate)}</Text>
        {!selected.schedule ? <View style={{ marginTop: 17, gap: 5 }}><Text style={{ color: palette.ink, fontSize: 14, fontWeight: '800' }}>Geen rooster bewaard</Text><Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}>Voor deze week is geen rooster opgeslagen op dit apparaat.</Text></View>
          : <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 13 }}>
              <Pill text={`${selected.employeeCount} ${selected.employeeCount === 1 ? 'medewerker' : 'medewerkers'}`} color={palette.green} background={palette.paleGreen} />
              {selected.openCount ? <Pill text={`${selected.openCount} open`} color={palette.amber} background={palette.paleAmber} /> : null}
              <Pill text={selected.schedule.status === 'published' ? 'Gepubliceerd' : selected.schedule.status === 'final' ? 'Definitief' : 'Concept'} />
            </View>
            {selected.entries.length ? <View style={{ gap: 9, marginTop: 17 }}>
              {selected.entries.map(({ shift, employee }) => <View key={shift.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, backgroundColor: '#F8F6F2', borderRadius: 12 }}>
                {employee ? <Avatar employee={employee} size={37} /> : <View style={{ width: 37, height: 37, borderRadius: 13, backgroundColor: palette.paleAmber, justifyContent: 'center', alignItems: 'center' }}><Ionicons name="person-outline" size={18} color={palette.amber} /></View>}
                <View style={{ flex: 1 }}><Text style={{ color: palette.ink, fontSize: 13, fontWeight: '800' }}>{employee?.displayName ?? (shift.employeeId ? 'Onbekende medewerker' : 'Open dienst')}</Text><Text style={{ color: palette.muted, fontSize: 11, marginTop: 3 }}>{shift.employeeId ? shift.paidInternShift ? 'Betaalde stagedienst' : employee?.kind === 'intern' ? 'Stagiair' : employee?.role ?? 'Dienst' : 'Nog niet ingevuld'}</Text></View>
                <Text style={{ color: palette.ink, fontSize: 12, fontWeight: '800' }}>{formatTime(shift.startAt)}–{formatTime(shift.endAt)}</Text>
              </View>)}
            </View> : <Text style={{ color: palette.muted, fontSize: 12, marginTop: 17 }}>Op deze dag staan geen diensten in het bewaarde rooster.</Text>}
          </>}
        <Text style={{ color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 19 }}>Dit overzicht toont geplande diensten uit het bewaarde rooster, geen aanwezigheidsregistratie.</Text>
      </Card>
    </View>
  </ScrollView>;
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}
