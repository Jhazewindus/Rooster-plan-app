import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EMPLOYEE_COLORS, Employee, WEEKDAYS, Weekday } from './domain';
import { Field, palette, PrimaryButton, RoundIconButton } from './ui';

type DraftDay = { enabled: boolean; start: string; end: string };
type Props = { visible: boolean; onClose: () => void; onSave: (employee: Omit<Employee, 'id' | 'displayName' | 'active'>) => void; employeeCount: number };

export function EmployeeForm({ visible, onClose, onSave, employeeCount }: Props) {
  const initialDays = useMemo(() => Object.fromEntries(WEEKDAYS.map(({ id }) => [id, { enabled: id < 6, start: '08:00', end: '17:00' }])) as Record<Weekday, DraftDay>, []);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('Dierenverzorger');
  const [contractHours, setContractHours] = useState('32');
  const [days, setDays] = useState(initialDays);

  const close = () => {
    setFirstName(''); setLastName(''); setRole('Dierenverzorger'); setContractHours('32'); setDays(initialDays); onClose();
  };

  const save = () => {
    const hours = Number(contractHours.replace(',', '.'));
    if (!firstName.trim()) { Alert.alert('Naam ontbreekt', 'Vul de voornaam van de medewerker in.'); return; }
    if (!Number.isFinite(hours) || hours <= 0 || hours > 80) { Alert.alert('Contracturen controleren', 'Vul een aantal uren tussen 1 en 80 in.'); return; }
    const availability: Employee['availability'] = {};
    for (const { id, long } of WEEKDAYS) {
      const day = days[id];
      if (!day.enabled) continue;
      const start = parseTime(day.start);
      const end = parseTime(day.end);
      if (start === null || end === null || end <= start) { Alert.alert('Tijden controleren', `Vul geldige tijden in voor ${long}; de eindtijd moet na de begintijd liggen.`); return; }
      availability[id] = { startMinute: start, endMinute: end };
    }
    if (Object.keys(availability).length === 0) { Alert.alert('Werkdagen ontbreken', 'Selecteer ten minste één vaste werkdag.'); return; }
    onSave({ firstName: firstName.trim(), lastName: lastName.trim(), role: role.trim() || 'Medewerker', color: EMPLOYEE_COLORS[employeeCount % EMPLOYEE_COLORS.length], weeklyContractMinutes: Math.round(hours * 60), availability });
    close();
  };

  const patchDay = (weekday: Weekday, patch: Partial<DraftDay>) => setDays((current) => ({ ...current, [weekday]: { ...current[weekday], ...patch } }));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: palette.page }}>
        <KeyboardAvoidingView style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 9, paddingBottom: 10 }}>
            <View><Text style={{ color: palette.muted, fontWeight: '700', fontSize: 12 }}>TEAM INSTELLEN</Text><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 23, marginTop: 3 }}>Medewerker toevoegen</Text></View>
            <RoundIconButton icon="close" accessibilityLabel="Sluiten" onPress={close} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: 32, gap: 15 }}>
            <View style={{ backgroundColor: '#FFF', borderRadius: 20, borderWidth: 1, borderColor: '#E9E0D5', padding: 17, gap: 13 }}>
              <Field label="Voornaam" value={firstName} onChangeText={setFirstName} placeholder="Bijvoorbeeld Lisa" autoCapitalize="words" returnKeyType="next" />
              <Field label="Achternaam" value={lastName} onChangeText={setLastName} placeholder="Bijvoorbeeld Jansen" autoCapitalize="words" returnKeyType="next" />
              <Field label="Functie" value={role} onChangeText={setRole} placeholder="Bijvoorbeeld Dierenverzorger" autoCapitalize="words" />
              <Field label="Contracturen per week" value={contractHours} onChangeText={setContractHours} placeholder="32" keyboardType="decimal-pad" />
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
                    <Field accessibilityLabel={`${long} begintijd`} label="Van" value={days[id].start} onChangeText={(value) => patchDay(id, { start: value })} keyboardType="numbers-and-punctuation" maxLength={5} placeholder="08:00" style={{ width: 88, minHeight: 40, paddingHorizontal: 9, textAlign: 'center' }} />
                    <Text style={{ color: palette.muted, paddingTop: 18 }}>tot</Text>
                    <Field accessibilityLabel={`${long} eindtijd`} label="Tot" value={days[id].end} onChangeText={(value) => patchDay(id, { end: value })} keyboardType="numbers-and-punctuation" maxLength={5} placeholder="17:00" style={{ width: 88, minHeight: 40, paddingHorizontal: 9, textAlign: 'center' }} />
                  </View> : null}
                </View>
              ))}
            </View>
            <PrimaryButton title="Medewerker opslaan" onPress={save} icon="checkmark" />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}
