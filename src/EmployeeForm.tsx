import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EMPLOYEE_COLORS, Employee, WEEKDAYS, Weekday } from './domain';
import { Field, palette, PrimaryButton, RoundIconButton, TimeField } from './ui';
import { parseTimeInput } from './timeInput';
import { parseDateKey } from './dateInput';

type DraftDay = { enabled: boolean; start: string; end: string };
type Props = { visible: boolean; onClose: () => void; onSave: (employee: Omit<Employee, 'id' | 'displayName' | 'active'>) => void; employeeCount: number; employee?: Employee };

export function EmployeeForm({ visible, onClose, onSave, employeeCount, employee }: Props) {
  const initialDays = useMemo(() => Object.fromEntries(WEEKDAYS.map(({ id }) => [id, { enabled: id < 6, start: '07:00', end: '17:00' }])) as Record<Weekday, DraftDay>, []);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('Dierenverzorger');
  const [contractHours, setContractHours] = useState('32');
  const [days, setDays] = useState(initialDays);
  const [kind, setKind] = useState<NonNullable<Employee['kind']>>('regular');
  const [stageStart, setStageStart] = useState('');
  const [stageEnd, setStageEnd] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  useEffect(() => {
    if (!visible) return;
    setFirstName(employee?.firstName ?? '');
    setLastName(employee?.lastName ?? '');
    setRole(employee?.role ?? 'Dierenverzorger');
    setContractHours(String((employee?.weeklyContractMinutes ?? 1920) / 60));
    setKind(employee?.kind ?? 'regular');
    setStageStart(employee?.internship?.startDate ?? '');
    setStageEnd(employee?.internship?.endDate ?? '');
    setPeriodStart(employee?.period?.startDate ?? '');
    setPeriodEnd(employee?.period?.endDate ?? '');
    setDays(employee ? Object.fromEntries(WEEKDAYS.map(({ id }) => [id, {
      enabled: Boolean(employee.availability[id]),
      start: employee.availability[id] ? formatMinutes(employee.availability[id]!.startMinute) : '07:00',
      end: employee.availability[id] ? formatMinutes(employee.availability[id]!.endMinute) : '17:00',
    }])) as Record<Weekday, DraftDay> : initialDays);
  }, [visible, employee, initialDays]);

  const close = () => onClose();

  const save = () => {
    const hours = Number(contractHours.replace(',', '.'));
    if (!firstName.trim()) { Alert.alert('Naam ontbreekt', 'Vul de voornaam van de medewerker in.'); return; }
    if (!Number.isFinite(hours) || hours <= 0 || hours > 80) { Alert.alert('Contracturen controleren', 'Vul een aantal uren tussen 1 en 80 in.'); return; }
    if (kind === 'intern' && (!parseDateKey(stageStart) || !parseDateKey(stageEnd) || stageEnd < stageStart)) {
      Alert.alert('Stageperiode controleren', 'Vul geldige begin- en einddatums in (JJJJ-MM-DD).'); return;
    }
    if (kind === 'periodic' && (!parseDateKey(periodStart) || !parseDateKey(periodEnd) || periodEnd < periodStart)) {
      Alert.alert('Werkperiode controleren', 'Vul geldige begin- en einddatums in (JJJJ-MM-DD).'); return;
    }
    const availability: Employee['availability'] = {};
    for (const { id, long } of WEEKDAYS) {
      const day = days[id];
      if (!day.enabled) continue;
      const start = parseTimeInput(day.start);
      const end = parseTimeInput(day.end);
      if (start === null || end === null || end <= start) { Alert.alert('Tijden controleren', `Vul geldige tijden in voor ${long}; de eindtijd moet na de begintijd liggen.`); return; }
      availability[id] = { startMinute: start, endMinute: end };
    }
    if (Object.keys(availability).length === 0) { Alert.alert('Werkdagen ontbreken', 'Selecteer ten minste één vaste werkdag.'); return; }
    onSave({ firstName: firstName.trim(), lastName: lastName.trim(), role: role.trim() || 'Medewerker', color: employee?.color ?? EMPLOYEE_COLORS[employeeCount % EMPLOYEE_COLORS.length], weeklyContractMinutes: Math.round(hours * 60), availability, kind, internship: kind === 'intern' ? { startDate: stageStart.trim(), endDate: stageEnd.trim() } : undefined, period: kind === 'periodic' ? { startDate: periodStart.trim(), endDate: periodEnd.trim() } : undefined });
    close();
  };

  const patchDay = (weekday: Weekday, patch: Partial<DraftDay>) => setDays((current) => ({ ...current, [weekday]: { ...current[weekday], ...patch } }));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: palette.page }}>
        <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 9, paddingBottom: 10 }}>
            <View><Text style={{ color: palette.muted, fontWeight: '700', fontSize: 12 }}>TEAM INSTELLEN</Text><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 23, marginTop: 3 }}>{employee ? 'Medewerker bewerken' : 'Medewerker toevoegen'}</Text></View>
            <RoundIconButton icon="close" accessibilityLabel="Sluiten" onPress={close} />
          </View>
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ flexGrow: 1, padding: 18, paddingBottom: 48, gap: 15 }}>
            <View style={{ backgroundColor: '#FFF', borderRadius: 20, borderWidth: 1, borderColor: '#E9E0D5', padding: 17, gap: 13 }}>
              <Field label="Voornaam" value={firstName} onChangeText={setFirstName} placeholder="Bijvoorbeeld Lisa" autoCapitalize="words" returnKeyType="next" />
              <Field label="Achternaam" value={lastName} onChangeText={setLastName} placeholder="Bijvoorbeeld Jansen" autoCapitalize="words" returnKeyType="next" />
              <Field label="Functie" value={role} onChangeText={setRole} placeholder="Bijvoorbeeld Dierenverzorger" autoCapitalize="words" />
              <Field label="Contracturen per week" value={contractHours} onChangeText={setContractHours} placeholder="32" keyboardType="decimal-pad" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {([['regular', 'Vast'], ['periodic', 'Periodiek'], ['intern', 'Stagiair']] as const).map(([value, label]) => <Pressable key={value} onPress={() => setKind(value)} accessibilityRole="radio" accessibilityState={{ selected: kind === value }} style={{ borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: kind === value ? palette.primary : palette.palePrimary }}><Text style={{ color: kind === value ? '#FFF' : palette.primaryDark, fontWeight: '800' }}>{label}</Text></Pressable>)}
              </View>
              {kind === 'intern' ? <View style={{ gap: 11 }}>
                <Text style={{ color: palette.muted, fontSize: 12 }}>Een stagiair wordt alleen binnen de stageperiode en samen met een gewone medewerker ingepland.</Text>
                <Field label="Stage begint (JJJJ-MM-DD)" value={stageStart} onChangeText={setStageStart} placeholder="2026-10-14" keyboardType="numbers-and-punctuation" />
                <Field label="Stage eindigt (JJJJ-MM-DD)" value={stageEnd} onChangeText={setStageEnd} placeholder="2027-01-31" keyboardType="numbers-and-punctuation" />
              </View> : null}
              {kind === 'periodic' ? <View style={{ gap: 11 }}>
                <Text style={{ color: palette.muted, fontSize: 12 }}>Een periodieke medewerker wordt alleen binnen deze werkperiode ingepland en kan zelfstandig werken.</Text>
                <Field label="Periode begint (JJJJ-MM-DD)" value={periodStart} onChangeText={setPeriodStart} placeholder="2026-10-14" keyboardType="numbers-and-punctuation" />
                <Field label="Periode eindigt (JJJJ-MM-DD)" value={periodEnd} onChangeText={setPeriodEnd} placeholder="2027-01-31" keyboardType="numbers-and-punctuation" />
              </View> : null}
            </View>

            <View style={{ backgroundColor: '#FFF', borderRadius: 20, borderWidth: 1, borderColor: '#E9E0D5', padding: 17 }}>
              <Text style={{ color: palette.ink, fontSize: 16, fontWeight: '800' }}>Vaste werkdagen</Text>
              <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 11 }}>Stel per dag de normale begin- en eindtijd in.</Text>
              {WEEKDAYS.map(({ id, short, long }) => (
                <View key={id} style={{ paddingVertical: 11, borderTopWidth: 1, borderColor: '#EEE6DC' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Pressable onPress={() => patchDay(id, { enabled: !days[id].enabled })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <View style={{ width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: days[id].enabled ? palette.palePrimary : '#F2F3F6' }}><Text style={{ color: days[id].enabled ? palette.primary : palette.muted, fontSize: 10, fontWeight: '800' }}>{short}</Text></View>
                      <Text style={{ color: palette.ink, fontWeight: '700' }}>{long}</Text>
                    </Pressable>
                    <Pressable onPress={() => patchDay(id, { enabled: !days[id].enabled })} accessibilityRole="checkbox" accessibilityState={{ checked: days[id].enabled }}>
                      <Ionicons name={days[id].enabled ? 'checkbox' : 'square-outline'} size={23} color={days[id].enabled ? palette.primary : '#B5BBC7'} />
                    </Pressable>
                  </View>
                  {days[id].enabled ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10, marginLeft: 44 }}>
                    <TimeField accessibilityLabel={`${long} begintijd`} label="Van" value={days[id].start} onChangeText={(value) => patchDay(id, { start: value })} placeholder="07:00" style={{ width: 88, minHeight: 40, paddingHorizontal: 9, textAlign: 'center' }} />
                    <Text style={{ color: palette.muted, paddingTop: 18 }}>tot</Text>
                    <TimeField accessibilityLabel={`${long} eindtijd`} label="Tot" value={days[id].end} onChangeText={(value) => patchDay(id, { end: value })} placeholder="17:00" style={{ width: 88, minHeight: 40, paddingHorizontal: 9, textAlign: 'center' }} />
                  </View> : null}
                </View>
              ))}
            </View>
            <PrimaryButton title={employee ? 'Wijzigingen opslaan' : 'Medewerker opslaan'} onPress={save} icon="checkmark" />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
