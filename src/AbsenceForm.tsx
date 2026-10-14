import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Absence, AbsenceType, ABSENCE_COLOR, ABSENCE_LABEL, Employee } from './domain';
import { Field, palette, PrimaryButton, RoundIconButton } from './ui';

type Props = { visible: boolean; onClose: () => void; employees: Employee[]; onSave: (absence: Omit<Absence, 'id'>) => void };
const TYPES: AbsenceType[] = ['sick', 'vacation', 'dayOff', 'specialLeave', 'unavailable', 'other'];

export function AbsenceForm({ visible, onClose, employees, onSave }: Props) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '');
  const [type, setType] = useState<AbsenceType>('sick');
  const [startDate, setStartDate] = useState(todayKey());
  const [endDate, setEndDate] = useState(todayKey());
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [allDay, setAllDay] = useState(true);
  const [notes, setNotes] = useState('');

  const close = () => { setNotes(''); setStartDate(todayKey()); setEndDate(todayKey()); onClose(); };
  const save = () => {
    if (!employeeId) { Alert.alert('Medewerker kiezen', 'Voeg eerst een medewerker toe.'); return; }
    const startDay = parseDate(startDate);
    const endDay = parseDate(endDate);
    if (!startDay || !endDay || endDay < startDay) { Alert.alert('Datum controleren', 'Vul een geldige start- en einddatum in.'); return; }
    let startAt: Date;
    let endAt: Date;
    if (allDay) {
      startAt = new Date(startDay); startAt.setHours(0, 0, 0, 0);
      endAt = new Date(endDay); endAt.setDate(endAt.getDate() + 1); endAt.setHours(0, 0, 0, 0);
    } else {
      const startMinute = parseTime(startTime);
      const endMinute = parseTime(endTime);
      if (startMinute === null || endMinute === null) { Alert.alert('Tijd controleren', 'Gebruik tijden zoals 08:00.'); return; }
      startAt = new Date(startDay); startAt.setHours(Math.floor(startMinute / 60), startMinute % 60, 0, 0);
      endAt = new Date(endDay); endAt.setHours(Math.floor(endMinute / 60), endMinute % 60, 0, 0);
      if (endAt <= startAt) { Alert.alert('Tijd controleren', 'De eindtijd moet na de begintijd liggen.'); return; }
    }
    onSave({ employeeId, type, startAt: startAt.toISOString(), endAt: endAt.toISOString(), notes: notes.trim() });
    close();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: palette.page }}>
        <KeyboardAvoidingView style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 9, paddingBottom: 10 }}>
            <View><Text style={{ color: palette.muted, fontWeight: '700', fontSize: 12 }}>BESCHIKBAARHEID</Text><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 23, marginTop: 3 }}>Afwezigheid melden</Text></View>
            <RoundIconButton icon="close" accessibilityLabel="Sluiten" onPress={close} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: 32, gap: 15 }}>
            <View style={{ backgroundColor: '#FFF', borderRadius: 20, borderWidth: 1, borderColor: '#E9E0D5', padding: 17 }}>
              <Text style={{ color: palette.muted, fontWeight: '700', fontSize: 12, marginBottom: 10 }}>MEDEWERKER</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {employees.map((employee) => {
                  const selected = employee.id === employeeId;
                  return <Pressable key={employee.id} onPress={() => setEmployeeId(employee.id)} style={{ borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: selected ? palette.primary : '#F1F2F6' }}><Text style={{ color: selected ? '#FFF' : palette.ink, fontWeight: '700', fontSize: 13 }}>{employee.firstName}</Text></Pressable>;
                })}
              </ScrollView>
            </View>

            <View style={{ backgroundColor: '#FFF', borderRadius: 20, borderWidth: 1, borderColor: '#E9E0D5', padding: 17 }}>
              <Text style={{ color: palette.muted, fontWeight: '700', fontSize: 12, marginBottom: 10 }}>TYPE AFWEZIGHEID</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {TYPES.map((item) => {
                  const selected = item === type;
                  const color = ABSENCE_COLOR[item];
                  return <Pressable key={item} onPress={() => setType(item)} style={{ paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, backgroundColor: selected ? `${color}1A` : '#F2F3F6', borderWidth: selected ? 1 : 0, borderColor: color }}><Text style={{ color: selected ? color : palette.muted, fontSize: 12, fontWeight: '700' }}>{ABSENCE_LABEL[item]}</Text></Pressable>;
                })}
              </View>
            </View>

            <View style={{ backgroundColor: '#FFF', borderRadius: 20, borderWidth: 1, borderColor: '#E9E0D5', padding: 17, gap: 13 }}>
              <Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>Wanneer?</Text>
              <Field label="Eerste dag (JJJJ-MM-DD)" value={startDate} onChangeText={setStartDate} placeholder="2026-10-15" keyboardType="numbers-and-punctuation" />
              <Field label="Laatste dag (JJJJ-MM-DD)" value={endDate} onChangeText={setEndDate} placeholder="2026-10-15" keyboardType="numbers-and-punctuation" />
              <Pressable onPress={() => setAllDay((value) => !value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
                <Ionicons name={allDay ? 'checkbox' : 'square-outline'} size={22} color={allDay ? palette.primary : '#A8AEBB'} />
                <Text style={{ color: palette.ink, fontWeight: '700' }}>Hele dag afwezig</Text>
              </Pressable>
              {!allDay ? <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label="Begintijd" value={startTime} onChangeText={setStartTime} keyboardType="numbers-and-punctuation" maxLength={5} placeholder="08:00" style={{ flex: 1 }} />
                <Field label="Eindtijd" value={endTime} onChangeText={setEndTime} keyboardType="numbers-and-punctuation" maxLength={5} placeholder="12:00" style={{ flex: 1 }} />
              </View> : null}
              <Field label="Notitie (optioneel)" value={notes} onChangeText={setNotes} placeholder="Voeg eventueel context toe" multiline numberOfLines={3} style={{ minHeight: 78, paddingTop: 12, textAlignVertical: 'top' }} />
            </View>
            <PrimaryButton title="Afwezigheid opslaan" onPress={save} icon="checkmark" />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function todayKey(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null;
  return date;
}

function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]); const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}
