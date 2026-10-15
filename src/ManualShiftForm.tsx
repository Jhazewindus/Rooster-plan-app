import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dateKey, Employee, Shift, toIsoWeekday } from './domain';
import { canWorkOnDate } from './planner';
import { Field, palette, PrimaryButton, RoundIconButton, TimeField } from './ui';
import { parseTimeInput } from './timeInput';

type Input = Omit<Shift, 'id' | 'source' | 'originalEmployeeId'>;
export type ManualShiftPrefill = { employeeId: string; startAt: string; endAt: string };
type Props = {
  visible: boolean;
  day: Date;
  shift?: Shift;
  prefill?: ManualShiftPrefill;
  employees: Employee[];
  onClose: () => void;
  onSave: (input: Input, existingId?: string) => string | null;
  onDelete: (id: string) => void;
};

function showTime(value: Date): string { return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`; }
function showMinute(value: number): string { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }

export function ManualShiftForm({ visible, day, shift, prefill, employees, onClose, onSave, onDelete }: Props) {
  const eligible = employees.filter((employee) => canWorkOnDate(employee, day));
  const [employeeId, setEmployeeId] = useState('');
  const [start, setStart] = useState('07:00');
  const [end, setEnd] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [paidInternShift, setPaidInternShift] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setEmployeeId(shift?.employeeId ?? prefill?.employeeId ?? eligible[0]?.id ?? '');
    setStart(shift ? showTime(new Date(shift.startAt)) : prefill ? showTime(new Date(prefill.startAt)) : '07:00');
    setEnd(shift ? showTime(new Date(shift.endAt)) : prefill ? showTime(new Date(prefill.endAt)) : '17:00');
    setNotes(shift?.notes ?? '');
    setPaidInternShift(Boolean(shift?.paidInternShift));
  }, [visible, shift, prefill, day.getTime()]);

  const selectedEmployee = eligible.find((employee) => employee.id === employeeId);
  const selectEmployee = (employee: Employee) => {
    setEmployeeId(employee.id);
    setPaidInternShift(shift?.employeeId === employee.id ? Boolean(shift.paidInternShift) : false);
    if (!shift && !prefill) {
      const window = employee.availability[toIsoWeekday(day)];
      if (window) { setStart(showMinute(window.startMinute)); setEnd(showMinute(window.endMinute)); }
    }
  };
  const save = () => {
    if (!selectedEmployee) { Alert.alert('Medewerker kiezen', 'Er is geen beschikbare medewerker voor deze dag.'); return; }
    const startMinute = parseTimeInput(start);
    const endMinute = parseTimeInput(end);
    if (startMinute === null || endMinute === null || endMinute <= startMinute) { Alert.alert('Tijden controleren', 'De eindtijd moet na de begintijd liggen.'); return; }
    const from = new Date(day); from.setHours(Math.floor(startMinute / 60), startMinute % 60, 0, 0);
    const until = new Date(day); until.setHours(Math.floor(endMinute / 60), endMinute % 60, 0, 0);
    const error = onSave({ employeeId, startAt: from.toISOString(), endAt: until.toISOString(), notes: notes.trim(), paidInternShift: selectedEmployee.kind === 'intern' && paidInternShift ? true : undefined }, shift?.id);
    if (error) Alert.alert('Dienst niet opgeslagen', error);
    else onClose();
  };
  const remove = () => shift && Alert.alert('Dienst verwijderen?', 'Deze handmatige dienst verdwijnt uit het rooster.', [
    { text: 'Annuleren', style: 'cancel' },
    { text: 'Verwijderen', style: 'destructive', onPress: () => { onDelete(shift.id); onClose(); } },
  ]);

  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: palette.page }}>
      <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 }}><View><Text style={{ color: palette.muted, fontSize: 12, fontWeight: '800' }}>{dateKey(day)}</Text><Text style={{ color: palette.ink, fontSize: 23, fontWeight: '800' }}>{shift ? 'Dienst bewerken' : 'Dienst toevoegen'}</Text></View><RoundIconButton icon="close" accessibilityLabel="Sluiten" onPress={onClose} /></View>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 18, paddingBottom: 48, gap: 15 }}>
          <View style={{ padding: 17, borderRadius: 20, backgroundColor: '#FFF', gap: 14 }}>
            {prefill ? <Text style={{ color: palette.muted, fontSize: 12 }}>Voorstel voor ontbrekende dagdekking. Controleer de medewerker en tijden voordat je opslaat.</Text> : null}
            <Text style={{ color: palette.ink, fontWeight: '800' }}>Medewerker</Text>
            {eligible.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{eligible.map((employee) => <Pressable key={employee.id} onPress={() => selectEmployee(employee)} style={{ padding: 10, borderRadius: 12, backgroundColor: employeeId === employee.id ? palette.primary : palette.palePrimary }}><Text style={{ color: employeeId === employee.id ? '#FFF' : palette.primaryDark, fontWeight: '700' }}>{employee.displayName}{employee.kind === 'intern' ? ' · stagiair' : employee.kind === 'periodic' ? ' · periodiek' : ''}</Text></Pressable>)}</View> : <Text style={{ color: palette.muted }}>Geen medewerker beschikbaar op deze datum.</Text>}
            {selectedEmployee?.kind === 'intern' ? <Pressable onPress={() => setPaidInternShift((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: paidInternShift }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}><Ionicons name={paidInternShift ? 'checkbox' : 'square-outline'} size={23} color={palette.primary} /><View style={{ flex: 1 }}><Text style={{ color: palette.ink, fontWeight: '800' }}>Betaalde dienst</Text><Text style={{ color: palette.muted, fontSize: 11, marginTop: 2 }}>Telt mee voor de bezetting en mag zonder begeleider.</Text></View></Pressable> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><TimeField label="Van" value={start} onChangeText={setStart} /></View><View style={{ flex: 1 }}><TimeField label="Tot" value={end} onChangeText={setEnd} /></View></View>
            <Field label="Opmerking (optioneel)" value={notes} onChangeText={setNotes} />
          </View>
          <PrimaryButton title={shift ? 'Wijzigingen opslaan' : 'Dienst toevoegen'} icon="checkmark" onPress={save} />
          {shift ? <Pressable onPress={remove} style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: palette.red, fontWeight: '800' }}>Handmatige dienst verwijderen</Text></Pressable> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
