import React, { useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import ViewShot, { ViewShotRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Avatar, Card, EmptyState, PageHeading, Pill, PrimaryButton, RoundIconButton, SectionTitle, palette, SecondaryButton } from './ui';
import { Employee, formatTime, Schedule, Shift, WEEKDAYS } from './domain';
import { usePlanner } from './store';
import { RecommendationsSheet } from './Recommendations';

export function WeekScreen() {
  const planner = usePlanner();
  const { data, schedule, weekStart } = planner;
  const [selectedShift, setSelectedShift] = useState<Shift | undefined>();
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const weekShot = useRef<ViewShotRef>(null);

  const stepWeek = (amount: number) => {
    const next = new Date(weekStart); next.setDate(next.getDate() + amount * 7); planner.goToWeek(next);
  };
  const goCurrent = () => planner.goToWeek(new Date());
  const openCount = schedule?.shifts.filter((shift) => shift.employeeId === null).length ?? 0;
  const exportPng = async () => {
    try {
      setExporting(true);
      const uri = await weekShot.current?.capture();
      if (!uri) throw new Error('PNG is niet gemaakt.');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Deel weekrooster', UTI: 'public.png' });
      } else {
        await Share.share({ url: uri, message: 'Weekrooster van RoosterPlan' });
      }
      setExportOpen(false);
    } catch (error) {
      Alert.alert('Exporteren mislukt', error instanceof Error ? error.message : 'Probeer het nog eens.');
    } finally { setExporting(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.page }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 19, paddingBottom: 28 }}>
        <PageHeading eyebrow="Planning" title="Weekrooster" subtitle="Jouw team, helder op een rij." right={schedule ? <RoundIconButton icon="share-outline" accessibilityLabel="Rooster exporteren" onPress={() => setExportOpen(true)} /> : undefined} />
        <Card style={{ paddingVertical: 13, paddingHorizontal: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <RoundIconButton icon="chevron-back" accessibilityLabel="Vorige week" onPress={() => stepWeek(-1)} />
            <Pressable onPress={goCurrent} style={{ alignItems: 'center', paddingHorizontal: 7 }}>
              <Text style={{ color: palette.ink, fontSize: 15, fontWeight: '800' }}>{weekNumber(weekStart)} · {weekRange(weekStart)}</Text>
              <Text style={{ color: palette.primary, fontSize: 11, fontWeight: '800', marginTop: 3 }}>GA NAAR DEZE WEEK</Text>
            </Pressable>
            <RoundIconButton icon="chevron-forward" accessibilityLabel="Volgende week" onPress={() => stepWeek(1)} />
          </View>
        </Card>

        {schedule ? <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 4 }}>
            <Pill text={schedule.status === 'draft' ? 'CONCEPT' : schedule.status === 'final' ? 'DEFINITIEF' : 'GEPUBLICEERD'} color={schedule.status === 'draft' ? palette.amber : palette.green} background={schedule.status === 'draft' ? palette.paleAmber : palette.paleGreen} />
            {schedule.status === 'draft' ? <Pressable onPress={() => confirmFinalize(schedule, openCount, planner.setScheduleStatus)}><Text style={{ color: palette.primary, fontSize: 13, fontWeight: '800' }}>Maak definitief</Text></Pressable> : <Text style={{ color: palette.green, fontSize: 12, fontWeight: '700' }}>Rooster is definitief</Text>}
          </View>
          <SectionTitle title="Deze week" trailing={<Text style={{ color: palette.muted, fontSize: 12 }}>{schedule.shifts.length - openCount} diensten · {openCount} open</Text>} />
          <View style={{ gap: 11 }}>
            {WEEKDAYS.map(({ id, long, short }) => {
              const day = new Date(weekStart); day.setDate(day.getDate() + id - 1);
              const dayShifts = schedule.shifts.filter((shift) => sameLocalDay(new Date(shift.startAt), day)).sort((a, b) => a.startAt.localeCompare(b.startAt));
              const dayAbsences = data.absences.filter((absence) => absence.startAt.slice(0, 10) === day.toISOString().slice(0, 10));
              return <Card key={id} style={{ padding: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: dayShifts.length ? 10 : 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 36, height: 36, borderRadius: 13, backgroundColor: isToday(day) ? palette.primary : '#EEF0F5', justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: isToday(day) ? '#FFF' : palette.muted, fontSize: 10, fontWeight: '800' }}>{short}</Text></View><View><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 14 }}>{long}</Text><Text style={{ color: palette.muted, fontSize: 11, marginTop: 2 }}>{new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long' }).format(day)}</Text></View></View>
                  <Text style={{ color: dayShifts.some((shift) => shift.employeeId === null) ? palette.amber : palette.muted, fontSize: 11, fontWeight: '700' }}>{dayShifts.length ? `${dayShifts.length} dienst${dayShifts.length === 1 ? '' : 'en'}` : 'Geen diensten'}</Text>
                </View>
                {dayShifts.map((shift) => <ShiftRow key={shift.id} shift={shift} employees={data.employees} onOpen={() => setSelectedShift(shift)} />)}
                {dayAbsences.length > 0 ? <View style={{ marginTop: 5, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{dayAbsences.map((absence) => { const employee = data.employees.find((person) => person.id === absence.employeeId); return <Pill key={absence.id} text={`${employee?.firstName ?? 'Team'} · afwezig`} color="#C05F59" background="#F8EAE7" />; })}</View> : null}
              </Card>;
            })}
          </View>
        </> : data.employees.length ? <View style={{ marginTop: 22 }}><EmptyState title="Nog geen rooster voor deze week" detail="Genereer een concept op basis van de vaste werkdagen van je team." icon="calendar-outline" action={<PrimaryButton title="Genereer standaardrooster" icon="sparkles" onPress={planner.generateCurrentWeek} />} /></View>
          : <View style={{ marginTop: 22 }}><EmptyState title="Je team komt hier samen" detail="Voeg eerst medewerkers en hun vaste werktijden toe. Daarna maken we met één tik een weekrooster." /></View>}
      </ScrollView>

      {schedule && <RecommendationsSheet visible={Boolean(selectedShift)} onClose={() => setSelectedShift(undefined)} shift={selectedShift} employees={data.employees} scheduleShifts={schedule.shifts} absences={data.absences} onAssign={(employeeId) => { if (planner.assign(selectedShift!.id, employeeId)) setSelectedShift(undefined); }} onUsePlan={() => { if (selectedShift && planner.useCoveragePlan(selectedShift)) setSelectedShift(undefined); }} />}
      {schedule ? <ExportSheet visible={exportOpen} onClose={() => setExportOpen(false)} schedule={schedule} employees={data.employees} weekStart={weekStart} shotRef={weekShot} exporting={exporting} onExport={exportPng} /> : null}
    </View>
  );
}

function ShiftRow({ shift, employees, onOpen }: { shift: Shift; employees: Employee[]; onOpen: () => void }) {
  const employee = employees.find((item) => item.id === shift.employeeId);
  const open = shift.employeeId === null;
  const content = <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: '#EEE6DC' }}>
    {employee ? <Avatar employee={employee} size={34} /> : <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: '#FFF1DF', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="person-add-outline" size={16} color="#AC6E2D" /></View>}
    <View style={{ flex: 1 }}><Text style={{ color: open ? '#A6631D' : palette.ink, fontWeight: '800', fontSize: 13 }}>{employee?.displayName ?? 'Open dienst'}</Text><Text style={{ color: palette.muted, fontSize: 11, marginTop: 3 }}>{open ? 'Kies een passende vervanger' : employee?.role}</Text></View>
    <View style={{ alignItems: 'flex-end', gap: 4 }}><Text style={{ color: palette.ink, fontSize: 12, fontWeight: '800' }}>{formatTime(shift.startAt)} – {formatTime(shift.endAt)}</Text>{open ? <Text style={{ color: '#A6631D', fontSize: 10, fontWeight: '800' }}>OPEN · BEKIJK</Text> : null}</View>
  </View>;
  return open ? <Pressable onPress={onOpen} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>{content}</Pressable> : content;
}

function ExportSheet({ visible, onClose, schedule, employees, weekStart, shotRef, exporting, onExport }: { visible: boolean; onClose: () => void; schedule: Schedule; employees: Employee[]; weekStart: Date; shotRef: React.RefObject<ViewShotRef | null>; exporting: boolean; onExport: () => void }) {
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: palette.page }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}><View><Text style={{ color: palette.muted, fontSize: 11, fontWeight: '800' }}>DELEN</Text><Text style={{ color: palette.ink, fontSize: 22, fontWeight: '800', marginTop: 3 }}>Rooster als afbeelding</Text></View><RoundIconButton icon="close" accessibilityLabel="Sluiten" onPress={onClose} /></View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center', padding: 17, paddingBottom: 30, gap: 15 }}>
        <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }} style={{ width: '100%', maxWidth: 420 }}>
          <RosterPoster schedule={schedule} employees={employees} weekStart={weekStart} />
        </ViewShot>
        <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 340 }}>Deze hoge-resolutie PNG is klaar om te delen of op te slaan.</Text>
        <View style={{ width: '100%', maxWidth: 420 }}><PrimaryButton title={exporting ? 'Afbeelding maken…' : 'Exporteer PNG'} icon="download-outline" disabled={exporting} onPress={onExport} /></View>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function RosterPoster({ schedule, employees, weekStart }: { schedule: Schedule; employees: Employee[]; weekStart: Date }) {
  return <View style={{ backgroundColor: '#F8F4EC', padding: 23, gap: 13 }}>
    <View style={{ backgroundColor: '#B76445', borderRadius: 20, padding: 20, overflow: 'hidden' }}>
      <Text style={{ color: '#F5DCCF', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 }}>ROOSTERPLAN · WEEK {weekNumber(weekStart)}</Text>
      <Text style={{ color: '#FFFEFA', fontWeight: '900', fontSize: 25, marginTop: 9 }}>Weekplanning</Text>
      <Text style={{ color: '#F6E2D7', fontSize: 13, marginTop: 4 }}>{weekRange(weekStart)}</Text>
      <Image source={require('../assets/icon.png')} accessibilityLabel="Hond en kat" resizeMode="contain" style={{ position: 'absolute', width: 92, height: 92, right: -7, bottom: -18 }} />
    </View>
    {WEEKDAYS.map(({ id, long }) => {
      const day = new Date(weekStart); day.setDate(day.getDate() + id - 1);
      const shifts = schedule.shifts.filter((shift) => sameLocalDay(new Date(shift.startAt), day));
      return <View key={id} style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 13, gap: 8 }}>
        <Text style={{ color: '#B76445', fontWeight: '900', fontSize: 11, letterSpacing: 0.6 }}>{long.toUpperCase()} · {new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(day).toUpperCase()}</Text>
        {shifts.length ? shifts.map((shift) => { const employee = employees.find((item) => item.id === shift.employeeId); return <View key={shift.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEE6DC', paddingTop: 7, gap: 12 }}><Text style={{ color: shift.employeeId ? '#283044' : '#A6631D', fontSize: 12, fontWeight: '700', flex: 1 }}>{employee?.displayName ?? 'Open dienst'}</Text><Text style={{ color: '#697286', fontSize: 11, fontWeight: '700' }}>{formatTime(shift.startAt)} – {formatTime(shift.endAt)}</Text></View>; }) : <Text style={{ color: '#98A0AF', fontSize: 11 }}>Geen diensten</Text>}
      </View>;
    })}
    <Text style={{ color: '#929AAA', fontSize: 10, textAlign: 'center', marginTop: 2 }}>Gegenereerd met RoosterPlan</Text>
  </View>;
}

function confirmFinalize(schedule: Schedule, openCount: number, setStatus: (status: Schedule['status']) => void) {
  if (openCount > 0) { Alert.alert('Open diensten', `Er staan nog ${openCount} open dienst${openCount === 1 ? '' : 'en'} in het rooster. Wijs eerst vervangers toe.`); return; }
  Alert.alert('Rooster definitief maken?', 'Je kunt dit rooster later weer als concept openen.', [{ text: 'Annuleren', style: 'cancel' }, { text: 'Definitief maken', onPress: () => setStatus('final') }]);
}

function sameLocalDay(first: Date, second: Date): boolean { return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate(); }
function isToday(date: Date): boolean { return sameLocalDay(date, new Date()); }
function weekNumber(date: Date): string {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7));
  const first = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return String(Math.ceil((((value.getTime() - first.getTime()) / 86400000) + 1) / 7)).padStart(2, '0');
}
function weekRange(date: Date): string {
  const end = new Date(date); end.setDate(end.getDate() + 6);
  const month = new Intl.DateTimeFormat('nl-NL', { month: 'long' });
  return `${date.getDate()} ${month.format(date)} – ${end.getDate()} ${month.format(end)} ${end.getFullYear()}`;
}
