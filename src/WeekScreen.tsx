import React, { useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, Share, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import ViewShot, { ViewShotRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Avatar, Card, EmptyState, PageHeading, Pill, PrimaryButton, RoundIconButton, SectionTitle, palette, SecondaryButton } from './ui';
import { Absence, dateKey, durationMinutes, Employee, formatTime, mondayOf, PlannerData, PlannerSettings, Schedule, Shift, WEEKDAYS } from './domain';
import { usePlanner } from './store';
import { RecommendationsSheet } from './Recommendations';
import { ManualShiftForm, ManualShiftPrefill } from './ManualShiftForm';
import { HoursOverview } from './HoursOverview';
import { coverageGapCandidates, coverageGapDescription, dailyCoverageGaps, CoverageGap, workedMinutes } from './planner';
import { createYearWorkbook, shiftsForYear } from './exportWorkbook';
import { publicationIssues } from './publication';

type ExportScope = 'week' | 'month' | 'year';

export function WeekScreen() {
  const planner = usePlanner();
  const { data, schedule, weekStart } = planner;
  const [selectedShift, setSelectedShift] = useState<Shift | undefined>();
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>('week');
  const [manualDay, setManualDay] = useState<Date | undefined>();
  const [manualShift, setManualShift] = useState<Shift | undefined>();
  const [manualPrefill, setManualPrefill] = useState<ManualShiftPrefill | undefined>();
  const [coverageDay, setCoverageDay] = useState<Date | undefined>();
  const [showPublishIssues, setShowPublishIssues] = useState(false);
  const weekShot = useRef<ViewShotRef>(null);
  const isHistoricalWeek = weekStart < mondayOf(new Date());

  const stepWeek = (amount: number) => {
    const next = new Date(weekStart); next.setDate(next.getDate() + amount * 7); setShowPublishIssues(false); planner.goToWeek(next);
  };
  const goCurrent = () => { setShowPublishIssues(false); planner.goToWeek(new Date()); };
  const openManual = (day: Date, shift?: Shift, prefill?: ManualShiftPrefill) => { setManualDay(day); setManualShift(shift); setManualPrefill(prefill); };
  const closeManual = () => { setManualDay(undefined); setManualShift(undefined); setManualPrefill(undefined); };
  const leaveCoverageFor = (next: () => void) => { setCoverageDay(undefined); setTimeout(next, 250); };
  const generateMonths = (months: 1 | 6 | 12) => {
    const end = new Date(weekStart); end.setMonth(end.getMonth() + months);
    const hasExisting = data.schedules.some((item) => new Date(item.weekStart) >= weekStart && new Date(item.weekStart) < end);
    const run = () => planner.generateMonths(months);
    if (!hasExisting) { run(); return; }
    Alert.alert('Roosters opnieuw genereren?', 'Alleen vandaag en toekomstige dagen worden opnieuw opgebouwd. Eerdere dagen blijven zoals ze waren; de gewijzigde weken worden concept.', [
      { text: 'Annuleren', style: 'cancel' }, { text: 'Opnieuw genereren', onPress: run },
    ]);
  };
  const generateOneWeek = () => Alert.alert('Deze week opnieuw genereren?', 'Eerdere dagen blijven zoals ze waren. Vandaag en de komende dagen worden opnieuw opgebouwd met het huidige team.', [
    { text: 'Annuleren', style: 'cancel' }, { text: 'Opnieuw genereren', onPress: planner.generateCurrentWeek },
  ]);
  const openCount = schedule?.shifts.filter((shift) => shift.employeeId === null).length ?? 0;
  const publishIssues = schedule ? publicationIssues(schedule, data.employees) : [];
  const changeStatus = () => {
    if (!schedule) return;
    if (schedule.status === 'published') {
      Alert.alert('Rooster opnieuw openen?', 'Het rooster wordt weer een concept. Je kunt het daarna aanpassen en opnieuw controleren.', [
        { text: 'Annuleren', style: 'cancel' }, { text: 'Open als concept', onPress: () => planner.setScheduleStatus('draft') },
      ]);
      return;
    }
    if (publishIssues.length) {
      Alert.alert('Rooster nog niet klaar', `${publishIssues.slice(0, 5).map((issue) => `• ${issue.message}`).join('\n')}${publishIssues.length > 5 ? `\n… en nog ${publishIssues.length - 5} punt${publishIssues.length === 6 ? '' : 'en'}.` : ''}\n\nVul de diensten aan en probeer het opnieuw.`);
      return;
    }
    const next = schedule.status === 'draft' ? 'final' : 'published';
    Alert.alert(next === 'final' ? 'Rooster definitief maken?' : 'Rooster als gepubliceerd markeren?', next === 'final'
      ? 'Alle dagen hebben voldoende bezetting. Je kunt het rooster later weer als concept openen.'
      : 'Dit zet alleen de status op deze tablet. Deel het rooster zelf via Exporteren.', [
      { text: 'Annuleren', style: 'cancel' },
      { text: next === 'final' ? 'Maak definitief' : 'Markeer als gepubliceerd', onPress: () => {
        if (!planner.setScheduleStatus(next)) Alert.alert('Rooster gewijzigd', 'Controleer het rooster opnieuw voordat je doorgaat.');
      } },
    ]);
  };
  const exportSelected = async () => {
    try {
      setExporting(true);
      let uri: string;
      let mimeType: string;
      let title: string;
      if (exportScope === 'year') {
        const year = weekStart.getFullYear();
        const file = new File(Paths.cache, `RoosterPlan-${year}.xlsx`);
        file.write(createYearWorkbook(data, year));
        uri = file.uri;
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        title = `Jaarrooster ${year}`;
      } else {
        if (exportScope === 'week' && !schedule) throw new Error('Er is nog geen rooster voor deze week.');
        uri = await weekShot.current?.capture() ?? '';
        if (!uri) throw new Error('PNG is niet gemaakt.');
        mimeType = 'image/png';
        title = exportScope === 'week' ? 'Weekrooster' : 'Maandrooster';
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType, dialogTitle: title, ...(exportScope === 'year' ? {} : { UTI: 'public.png' }) });
      } else {
        await Share.share({ url: uri, message: `${title} van RoosterPlan` });
      }
      setExportOpen(false);
    } catch (error) {
      Alert.alert('Exporteren mislukt', error instanceof Error ? error.message : 'Probeer het nog eens.');
    } finally { setExporting(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.page }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 19, paddingBottom: 28 }}>
        <PageHeading eyebrow="Planning" title="Weekrooster" subtitle="Jouw team, helder op een rij." right={data.schedules.length ? <RoundIconButton icon="share-outline" accessibilityLabel="Rooster exporteren" onPress={() => { setExportScope(schedule ? 'week' : 'month'); setExportOpen(true); }} /> : undefined} />
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

        {isHistoricalWeek ? <Card style={{ marginTop: 13, gap: 5 }}><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 14 }}>Historisch rooster</Text><Text style={{ color: palette.muted, fontSize: 12 }}>Automatisch genereren begint vanaf de huidige week. Eerdere dagen blijven bewaard; je kunt ze wel bewust handmatig corrigeren.</Text></Card> : data.employees.some((employee) => employee.active) ? <Card style={{ marginTop: 13, gap: 10 }}>
          <Text style={{ color: palette.ink, fontWeight: '800', fontSize: 15 }}>Vooruit plannen</Text>
          <Text style={{ color: palette.muted, fontSize: 12 }}>Vanaf deze week vooruit plannen. Eerdere dagen van de lopende week blijven behouden.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {([1, 6, 12] as const).map((months) => <Pressable key={months} onPress={() => generateMonths(months)} style={{ borderRadius: 12, backgroundColor: palette.palePrimary, paddingHorizontal: 13, paddingVertical: 10 }}><Text style={{ color: palette.primaryDark, fontWeight: '800' }}>{months} {months === 1 ? 'maand' : 'maanden'}</Text></Pressable>)}
            {schedule ? <Pressable onPress={generateOneWeek} style={{ borderRadius: 12, backgroundColor: '#F2F3F6', paddingHorizontal: 13, paddingVertical: 10 }}><Text style={{ color: palette.ink, fontWeight: '800' }}>Deze week opnieuw</Text></Pressable> : null}
          </View>
        </Card> : null}

        {schedule ? <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 4 }}>
            <Pill text={schedule.status === 'draft' ? 'CONCEPT' : schedule.status === 'final' ? 'DEFINITIEF' : 'GEPUBLICEERD'} color={schedule.status === 'draft' ? palette.amber : palette.green} background={schedule.status === 'draft' ? palette.paleAmber : palette.paleGreen} />
            <Pressable onPress={changeStatus} accessibilityRole="button" style={{ padding: 9 }}><Text style={{ color: palette.primary, fontSize: 13, fontWeight: '800' }}>{schedule.status === 'draft' ? 'Maak definitief' : schedule.status === 'final' ? 'Publiceer' : 'Open als concept'}</Text></Pressable>
          </View>
          <Card style={{ marginTop: 10, gap: 7, borderColor: publishIssues.length ? '#EAD9BD' : '#D4E4D3' }}>
            <Text style={{ color: palette.ink, fontSize: 15, fontWeight: '800' }}>Controle voor publiceren</Text>
            {publishIssues.length ? <>
              <Pressable accessibilityRole="button" accessibilityLabel={showPublishIssues ? 'Verberg aandachtspunten' : 'Bekijk aandachtspunten'} onPress={() => setShowPublishIssues((value) => !value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 6 }}><Ionicons name="information-circle-outline" size={18} color={palette.amber} /><Text style={{ flex: 1, color: palette.ink, fontSize: 12, fontWeight: '700' }}>Nog {publishIssues.length} {publishIssues.length === 1 ? 'punt' : 'punten'} om op te lossen</Text><Text style={{ color: palette.primary, fontSize: 12, fontWeight: '800' }}>{showPublishIssues ? 'Verberg' : 'Bekijk'}</Text></Pressable>
              {showPublishIssues ? <View style={{ gap: 5, paddingTop: 3 }}>{publishIssues.map((issue, index) => <Text key={`${issue.day}-${issue.kind}-${index}`} style={{ color: palette.muted, fontSize: 12 }}>• {issue.message}</Text>)}</View> : null}
            </> : <Text style={{ color: palette.green, fontSize: 12, fontWeight: '700' }}>Alle dagen hebben tussen 07:00 en 19:30 minimaal vijf medewerkers. Geen open diensten of stagiairs zonder begeleiding.</Text>}
            <Text style={{ color: palette.muted, fontSize: 11 }}>Publiceren verandert de status op deze tablet. Delen doe je via Exporteren.</Text>
          </Card>
          <HoursOverview schedule={schedule} employees={data.employees} settings={data.settings} title="Uren in deze week" />
          <SectionTitle title="Deze week" trailing={<Text style={{ color: palette.muted, fontSize: 12 }}>{schedule.shifts.length - openCount} diensten · {openCount} open</Text>} />
          <View style={{ gap: 11 }}>
            {WEEKDAYS.map(({ id, long, short }) => {
              const day = new Date(weekStart); day.setDate(day.getDate() + id - 1);
              const dayShifts = schedule.shifts.filter((shift) => sameLocalDay(new Date(shift.startAt), day)).sort((a, b) => a.startAt.localeCompare(b.startAt));
              const coverageGaps = dailyCoverageGaps(day, dayShifts, data.employees);
              const nextDay = new Date(day); nextDay.setDate(nextDay.getDate() + 1);
              const dayAbsences = data.absences.filter((absence) => new Date(absence.startAt) < nextDay && new Date(absence.endAt) > day);
              return <Card key={id} style={{ padding: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: dayShifts.length ? 10 : 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 36, height: 36, borderRadius: 13, backgroundColor: isToday(day) ? palette.primary : '#EEF0F5', justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: isToday(day) ? '#FFF' : palette.muted, fontSize: 10, fontWeight: '800' }}>{short}</Text></View><View><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 14 }}>{long}</Text><Text style={{ color: palette.muted, fontSize: 11, marginTop: 2 }}>{new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long' }).format(day)}</Text></View></View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {coverageGaps.length ? <Pressable accessibilityRole="button" accessibilityLabel={`Bezetting aanvullen op ${long}`} onPress={() => setCoverageDay(day)} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: palette.paleAmber, flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="people-outline" size={16} color={palette.amber} /><Text style={{ color: palette.ink, fontSize: 11, fontWeight: '800' }}>Bezetting aanvullen</Text></Pressable> : null}
                    <Text style={{ color: dayShifts.some((shift) => shift.employeeId === null) ? palette.amber : palette.muted, fontSize: 11, fontWeight: '700' }}>{dayShifts.length ? `${dayShifts.length} dienst${dayShifts.length === 1 ? '' : 'en'}` : 'Geen diensten'}</Text>
                    <Pressable onPress={() => openManual(day)} accessibilityLabel={`Dienst toevoegen op ${long}`} style={{ padding: 8, borderRadius: 10, backgroundColor: palette.palePrimary }}><Ionicons name="add" size={19} color={palette.primary} /></Pressable>
                  </View>
                </View>
                {dayShifts.map((shift) => <ShiftRow key={shift.id} shift={shift} employees={data.employees} settings={data.settings} onOpen={() => shift.source === 'manual' ? openManual(day, schedule.manualShifts?.find((item) => item.id === shift.id || (item.employeeId === shift.employeeId && item.startAt <= shift.startAt && item.endAt >= shift.endAt)) ?? shift) : setSelectedShift(shift)} />)}
                {dayAbsences.length > 0 ? <View style={{ marginTop: 5, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{dayAbsences.map((absence) => { const employee = data.employees.find((person) => person.id === absence.employeeId); return <Pill key={absence.id} text={`${employee?.firstName ?? 'Team'} · afwezig`} color="#C05F59" background="#F8EAE7" />; })}</View> : null}
              </Card>;
            })}
          </View>
        </> : data.employees.length ? <View style={{ marginTop: 22 }}><EmptyState title="Nog geen rooster voor deze week" detail={isHistoricalWeek ? 'Dit is een oude week. Automatisch genereren kan vanaf de huidige week.' : 'Genereer een concept op basis van de vaste werkdagen van je team.'} icon="calendar-outline" action={isHistoricalWeek ? undefined : <PrimaryButton title="Genereer standaardrooster" icon="sparkles" onPress={planner.generateCurrentWeek} />} /></View>
          : <View style={{ marginTop: 22 }}><EmptyState title="Je team komt hier samen" detail="Voeg eerst medewerkers en hun vaste werktijden toe. Daarna maken we met één tik een weekrooster." /></View>}
        {!schedule && data.employees.length ? <View style={{ marginTop: 17, gap: 9 }}><Text style={{ color: palette.ink, fontWeight: '800' }}>Of voeg een dienst toe op:</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{WEEKDAYS.map(({ id, short }) => { const day = new Date(weekStart); day.setDate(day.getDate() + id - 1); return <Pressable key={id} onPress={() => openManual(day)} style={{ borderRadius: 11, backgroundColor: palette.palePrimary, padding: 10 }}><Text style={{ color: palette.primaryDark, fontWeight: '800' }}>+ {short}</Text></Pressable>; })}</View></View> : null}
      </ScrollView>

      {schedule && <RecommendationsSheet visible={Boolean(selectedShift)} onClose={() => setSelectedShift(undefined)} shift={selectedShift} employees={data.employees} scheduleShifts={schedule.shifts} absences={data.absences} settings={data.settings} onAssign={(employeeId) => { if (planner.assign(selectedShift!.id, employeeId)) setSelectedShift(undefined); }} onUsePlan={() => { if (selectedShift && planner.useCoveragePlan(selectedShift)) setSelectedShift(undefined); }} />}
      {schedule && coverageDay ? <CoverageDialog day={coverageDay} schedule={schedule} employees={data.employees} absences={data.absences} settings={data.settings} onClose={() => setCoverageDay(undefined)} onOpenShift={(shift) => leaveCoverageFor(() => setSelectedShift(shift))} onAddManual={(prefill) => leaveCoverageFor(() => openManual(new Date(prefill.startAt), undefined, prefill))} /> : null}
      <ManualShiftForm visible={Boolean(manualDay)} day={manualDay ?? weekStart} shift={manualShift} prefill={manualPrefill} employees={data.employees} onClose={closeManual} onSave={planner.saveManualShift} onDelete={planner.removeManualShift} />
      <ExportSheet visible={exportOpen} onClose={() => setExportOpen(false)} schedule={schedule} data={data} weekStart={weekStart} shotRef={weekShot} exporting={exporting} scope={exportScope} onScopeChange={setExportScope} onExport={exportSelected} />
    </View>
  );
}

function CoverageDialog({ day, schedule, employees, absences, settings, onClose, onOpenShift, onAddManual }: {
  day: Date;
  schedule: Schedule;
  employees: Employee[];
  absences: Absence[];
  settings?: PlannerSettings;
  onClose: () => void;
  onOpenShift: (shift: Shift) => void;
  onAddManual: (prefill: ManualShiftPrefill) => void;
}) {
  const { width, height } = useWindowDimensions();
  const sideBySide = width >= 800 && width > height;
  const [selectedGapKey, setSelectedGapKey] = useState<string | undefined>();
  const shifts = schedule.shifts.filter((shift) => sameLocalDay(new Date(shift.startAt), day));
  const gaps = dailyCoverageGaps(day, shifts, employees);
  const selectedGap = gaps.find((gap) => `${gap.startAt}/${gap.endAt}` === selectedGapKey) ?? gaps[0];
  const candidates = selectedGap ? coverageGapCandidates(selectedGap, schedule, employees, absences, settings) : [];
  const openTarget = selectedGap ? openShiftForGap(shifts, selectedGap) : undefined;
  const date = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(day);

  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: 'rgba(39, 30, 24, 0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: sideBySide ? 920 : 720, maxHeight: '92%', padding: 0, overflow: 'hidden' }}>
        <View style={{ paddingHorizontal: 19, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: palette.line }}>
          <View style={{ flex: 1 }}><Text style={{ color: palette.muted, fontSize: 11, fontWeight: '800' }}>BEZETTING AANVULLEN</Text><Text style={{ color: palette.ink, fontSize: 20, fontWeight: '800', marginTop: 2, textTransform: 'capitalize' }}>{date}</Text></View>
          <RoundIconButton icon="close" accessibilityLabel="Sluiten" onPress={onClose} />
        </View>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 18, paddingBottom: 24, gap: 13 }}>
          <Text style={{ color: palette.muted, fontSize: 12 }}>Kies een tijdvak. Er moeten steeds minimaal vijf medewerkers tegelijk werken.</Text>
          <View style={{ flexDirection: sideBySide ? 'row' : 'column', alignItems: 'flex-start', gap: 16 }}>
            <View style={{ width: sideBySide ? 280 : '100%', gap: 7 }}>
              <Text style={{ color: palette.ink, fontSize: 14, fontWeight: '800', marginBottom: 2 }}>Tijdvakken met tekort</Text>
              {gaps.map((gap) => {
                const key = `${gap.startAt}/${gap.endAt}`;
                const selected = selectedGap?.startAt === gap.startAt && selectedGap?.endAt === gap.endAt;
                return <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setSelectedGapKey(key)} style={{ padding: 11, borderRadius: 11, borderWidth: 1, borderColor: selected ? palette.primary : palette.line, backgroundColor: selected ? palette.palePrimary : '#FFF' }}><Text style={{ color: palette.ink, fontWeight: '700', fontSize: 12 }}>{coverageGapDescription(gap)}</Text></Pressable>;
              })}
            </View>
            <View style={[{ gap: 10 }, sideBySide ? { flex: 1 } : { width: '100%' }]}>
              {selectedGap ? <>
                <Text style={{ color: palette.ink, fontSize: 15, fontWeight: '800' }}>Voorstellen voor {formatTime(selectedGap.startAt)}–{formatTime(selectedGap.endAt)}</Text>
                {openTarget ? <Pressable accessibilityRole="button" onPress={() => onOpenShift(openTarget)} style={{ backgroundColor: palette.paleAmber, borderRadius: 11, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 }}><Ionicons name="person-add-outline" size={19} color={palette.amber} /><Text style={{ color: palette.ink, fontSize: 12, fontWeight: '800', flex: 1 }}>Open dienst invullen</Text><Ionicons name="chevron-forward" size={16} color={palette.amber} /></Pressable> : null}
                {candidates.length ? candidates.map((candidate) => <Pressable key={candidate.employee.id} accessibilityRole="button" accessibilityLabel={`Dienst voorstellen aan ${candidate.employee.displayName} van ${formatTime(candidate.startAt)} tot ${formatTime(candidate.endAt)}`} onPress={() => onAddManual({ employeeId: candidate.employee.id, startAt: candidate.startAt, endAt: candidate.endAt })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 11, borderWidth: 1, borderColor: palette.line, backgroundColor: '#FFF', padding: 10 }}>
                  <Avatar employee={candidate.employee} size={33} />
                  <View style={{ flex: 1 }}><Text style={{ color: palette.ink, fontSize: 12, fontWeight: '800' }}>{candidate.employee.displayName} · {formatTime(candidate.startAt)}–{formatTime(candidate.endAt)}</Text><Text style={{ color: palette.muted, fontSize: 11, marginTop: 3 }}>{candidate.withinRegularHours ? 'Binnen vaste uren' : 'Extra dienst'} · {formatHours(candidate.projectedWeeklyMinutes)} u deze week{candidate.exceedsContract ? ' · boven contract' : ''}</Text></View>
                  <Ionicons name="add-circle-outline" size={20} color={palette.primary} />
                </Pressable>) : <Text style={{ color: palette.muted, fontSize: 12 }}>Geen vrije medewerker gevonden voor dit tijdvak.</Text>}
                <Pressable accessibilityRole="button" onPress={() => onAddManual({ employeeId: '', startAt: selectedGap.startAt, endAt: selectedGap.endAt })} style={{ alignSelf: 'flex-start', paddingVertical: 9 }}><Text style={{ color: palette.primary, fontSize: 12, fontWeight: '800' }}>Zelf medewerker en tijden kiezen</Text></Pressable>
              </> : <Text style={{ color: palette.green, fontSize: 12 }}>De bezetting is nu compleet.</Text>}
            </View>
          </View>
        </ScrollView>
      </Card>
    </SafeAreaView>
  </Modal>;
}

function ShiftRow({ shift, employees, settings, onOpen }: { shift: Shift; employees: Employee[]; settings?: PlannerSettings; onOpen: () => void }) {
  const employee = employees.find((item) => item.id === shift.employeeId);
  const open = shift.employeeId === null;
  const manual = shift.source === 'manual';
  const breakMinutes = durationMinutes(shift) - workedMinutes(shift, settings);
  const content = <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: '#EEE6DC' }}>
    {employee ? <Avatar employee={employee} size={34} /> : <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: '#FFF1DF', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="person-add-outline" size={16} color="#AC6E2D" /></View>}
    <View style={{ flex: 1 }}><Text style={{ color: open ? '#A6631D' : palette.ink, fontWeight: '800', fontSize: 13 }}>{employee?.displayName ?? 'Open dienst'}{shift.paidInternShift ? ' · betaald' : employee?.kind === 'intern' ? ' · stagiair' : ''}</Text><Text style={{ color: palette.muted, fontSize: 11, marginTop: 3 }}>{open ? 'Kies een passende vervanger' : shift.paidInternShift ? 'Betaalde dienst' : manual ? 'Handmatig toegevoegd' : employee?.role}</Text></View>
    <View style={{ alignItems: 'flex-end', gap: 4 }}><Text style={{ color: palette.ink, fontSize: 12, fontWeight: '800' }}>{formatTime(shift.startAt)} – {formatTime(shift.endAt)}</Text>{breakMinutes > 0 ? <Text style={{ color: palette.muted, fontSize: 10 }}>{workedMinutes(shift, settings)} min gewerkt · {breakMinutes} min pauze</Text> : null}{open || manual ? <Text style={{ color: '#A6631D', fontSize: 10, fontWeight: '800' }}>{open ? 'OPEN · BEKIJK' : 'BEWERK'}</Text> : null}</View>
  </View>;
  return open || manual ? <Pressable onPress={onOpen} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>{content}</Pressable> : content;
}

function ExportSheet({ visible, onClose, schedule, data, weekStart, shotRef, exporting, scope, onScopeChange, onExport }: { visible: boolean; onClose: () => void; schedule?: Schedule; data: PlannerData; weekStart: Date; shotRef: React.RefObject<ViewShotRef | null>; exporting: boolean; scope: ExportScope; onScopeChange: (scope: ExportScope) => void; onExport: () => void }) {
  const month = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' }).format(weekStart);
  const year = weekStart.getFullYear();
  const yearShifts = shiftsForYear(data, year);
  const monthHasSchedule = data.schedules.some((item) => { const date = new Date(item.weekStart); const end = new Date(date); end.setDate(end.getDate() + 6); const first = new Date(year, weekStart.getMonth(), 1); const last = new Date(year, weekStart.getMonth() + 1, 0); return date <= last && end >= first; });
  const available = scope === 'week' ? Boolean(schedule) : scope === 'month' ? monthHasSchedule : yearShifts.length > 0;
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: palette.page }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}><View><Text style={{ color: palette.muted, fontSize: 11, fontWeight: '800' }}>DELEN</Text><Text style={{ color: palette.ink, fontSize: 22, fontWeight: '800', marginTop: 3 }}>Rooster exporteren</Text></View><RoundIconButton icon="close" accessibilityLabel="Sluiten" onPress={onClose} /></View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center', padding: 17, paddingBottom: 30, gap: 15 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {([['week', 'Week · PNG'], ['month', 'Maand · PNG'], ['year', 'Jaar · Excel']] as const).map(([value, label]) => <Pressable key={value} onPress={() => onScopeChange(value)} accessibilityRole="radio" accessibilityState={{ selected: scope === value }} style={{ borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: scope === value ? palette.primary : palette.palePrimary }}><Text style={{ color: scope === value ? '#FFF' : palette.primaryDark, fontWeight: '800' }}>{label}</Text></Pressable>)}
        </View>
        {scope === 'year' ? <View style={{ width: '100%', maxWidth: 420, backgroundColor: '#FFF', borderRadius: 18, padding: 22, gap: 8 }}><Text style={{ color: palette.primary, fontWeight: '900', fontSize: 12 }}>JAAROVERZICHT · {year}</Text><Text style={{ color: palette.ink, fontWeight: '900', fontSize: 23 }}>Excel-werkmap</Text><Text style={{ color: palette.muted, fontSize: 13, lineHeight: 19 }}>{yearShifts.length} diensten in dit jaar. De werkmap bevat een maandoverzicht en alle diensten met werktijden, pauzes, werkuren en open diensten.</Text></View>
          : <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }} style={{ width: '100%', maxWidth: 420 }}>
            {scope === 'week' ? schedule ? <RosterPoster schedule={schedule} employees={data.employees} weekStart={weekStart} /> : <View style={{ backgroundColor: '#FFF', padding: 25 }}><Text>Geen rooster voor deze week.</Text></View>
              : <MonthPoster data={data} selectedDate={weekStart} />}
          </ViewShot>}
        <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 360 }}>{available ? scope === 'year' ? 'Sla de Excel-werkmap op of deel hem met je team.' : `De ${scope === 'week' ? 'week' : 'maand'}afbeelding voor ${scope === 'month' ? month : weekRange(weekStart)} is klaar om te delen.` : `Er zijn nog geen diensten voor ${scope === 'week' ? 'deze week' : scope === 'month' ? month : year}.`}</Text>
        <View style={{ width: '100%', maxWidth: 420 }}><PrimaryButton title={exporting ? 'Exporteren…' : scope === 'year' ? 'Exporteer Excel' : 'Exporteer PNG'} icon="download-outline" disabled={exporting || !available} onPress={onExport} /></View>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function MonthPoster({ data, selectedDate }: { data: PlannerData; selectedDate: Date }) {
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const days = Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => new Date(year, month, index + 1));
  const scheduleByWeek = new Map(data.schedules.map((item) => [dateKey(new Date(item.weekStart)), item]));
  const missing = new Set(days.filter((day) => !scheduleByWeek.has(dateKey(mondayOf(day)))).map((day) => dateKey(mondayOf(day)))).size;
  return <View style={{ backgroundColor: '#F8F4EC', padding: 20, gap: 9 }}>
    <View style={{ backgroundColor: palette.primary, borderRadius: 20, padding: 19, overflow: 'hidden', marginBottom: 4 }}>
      <Text style={{ color: '#F5DCCF', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 }}>ROOSTERPLAN · MAAND</Text>
      <Text style={{ color: '#FFFEFA', fontWeight: '900', fontSize: 24, marginTop: 8, textTransform: 'capitalize' }}>{new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' }).format(selectedDate)}</Text>
      <Image source={require('../assets/icon.png')} accessibilityLabel="Hond en kat" resizeMode="contain" style={{ position: 'absolute', width: 86, height: 86, right: -6, bottom: -15 }} />
    </View>
    {days.map((day) => {
      const schedule = scheduleByWeek.get(dateKey(mondayOf(day)));
      const shifts = schedule?.shifts.filter((shift) => dateKey(new Date(shift.startAt)) === dateKey(day)).sort((a, b) => a.startAt.localeCompare(b.startAt)) ?? [];
      return <View key={dateKey(day)} style={{ backgroundColor: '#FFF', borderRadius: 11, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', gap: 10 }}>
        <View style={{ width: 56 }}><Text style={{ color: palette.primary, fontSize: 11, fontWeight: '900' }}>{new Intl.DateTimeFormat('nl-NL', { weekday: 'short' }).format(day).toUpperCase()} {day.getDate()}</Text></View>
        <View style={{ flex: 1, gap: 3 }}>{!schedule ? <Text style={{ color: '#A6631D', fontSize: 11 }}>Nog geen rooster</Text> : shifts.length ? shifts.map((shift) => <View key={shift.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text numberOfLines={1} style={{ color: shift.employeeId ? palette.ink : '#A6631D', fontSize: 11, fontWeight: '700', flex: 1 }}>{data.employees.find((item) => item.id === shift.employeeId)?.displayName ?? 'Open dienst'}{shift.paidInternShift ? ' · betaald' : ''}</Text><Text style={{ color: palette.muted, fontSize: 10 }}>{formatTime(shift.startAt)}–{formatTime(shift.endAt)}</Text></View>) : <Text style={{ color: '#98A0AF', fontSize: 11 }}>Geen diensten</Text>}</View>
      </View>;
    })}
    {missing ? <Text style={{ color: '#A6631D', fontSize: 10, textAlign: 'center' }}>{missing} {missing === 1 ? 'week' : 'weken'} zonder rooster zijn gemarkeerd.</Text> : null}
    <Text style={{ color: '#929AAA', fontSize: 10, textAlign: 'center' }}>Gegenereerd met RoosterPlan</Text>
  </View>;
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
        {shifts.length ? shifts.map((shift) => { const employee = employees.find((item) => item.id === shift.employeeId); return <View key={shift.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEE6DC', paddingTop: 7, gap: 12 }}><Text style={{ color: shift.employeeId ? '#283044' : '#A6631D', fontSize: 12, fontWeight: '700', flex: 1 }}>{employee?.displayName ?? 'Open dienst'}{shift.paidInternShift ? ' · betaald' : ''}</Text><Text style={{ color: '#697286', fontSize: 11, fontWeight: '700' }}>{formatTime(shift.startAt)} – {formatTime(shift.endAt)}</Text></View>; }) : <Text style={{ color: '#98A0AF', fontSize: 11 }}>Geen diensten</Text>}
      </View>;
    })}
    <Text style={{ color: '#929AAA', fontSize: 10, textAlign: 'center', marginTop: 2 }}>Gegenereerd met RoosterPlan</Text>
  </View>;
}

function sameLocalDay(first: Date, second: Date): boolean { return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate(); }
function openShiftForGap(shifts: Shift[], gap: CoverageGap): Shift | undefined {
  return shifts.find((shift) => shift.employeeId === null && new Date(shift.startAt) < new Date(gap.endAt) && new Date(shift.endAt) > new Date(gap.startAt));
}
function formatHours(minutes: number): string { return (minutes / 60).toLocaleString('nl-NL', { maximumFractionDigits: 2 }); }
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
