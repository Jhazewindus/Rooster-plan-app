import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BreakRule, makeId, WEEKDAYS, Weekday } from './domain';
import { usePlanner } from './store';
import { Card, Field, PageHeading, palette, PrimaryButton, RoundIconButton, TimeField } from './ui';
import { parseTimeInput } from './timeInput';

function showTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function SettingsScreen() {
  const planner = usePlanner();
  const rules = planner.data.settings?.breaks ?? [];
  const [formVisible, setFormVisible] = useState(false);
  const [selected, setSelected] = useState<BreakRule | undefined>();
  const open = (rule?: BreakRule) => { setSelected(rule); setFormVisible(true); };
  const close = () => { setFormVisible(false); setSelected(undefined); };
  const save = (rule: BreakRule) => {
    planner.setSettings({ breaks: [...rules.filter((item) => item.id !== rule.id), rule] });
    close();
  };
  const remove = (rule: BreakRule) => Alert.alert('Pauze verwijderen?', 'De getelde uren worden meteen opnieuw berekend.', [
    { text: 'Annuleren', style: 'cancel' },
    { text: 'Verwijderen', style: 'destructive', onPress: () => planner.setSettings({ breaks: rules.filter((item) => item.id !== rule.id) }) },
  ]);

  return <View style={{ flex: 1, backgroundColor: palette.page }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 19, paddingBottom: 32, gap: 12 }}>
      <PageHeading eyebrow="Algemeen" title="Instellingen" subtitle="Pauzes tellen voor medewerkers en stagiairs mee als niet-gewerkte tijd." right={<RoundIconButton icon="add" accessibilityLabel="Pauze toevoegen" onPress={() => open()} />} />
      <Card style={{ gap: 9 }}>
        <Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>Pauzeregels</Text>
        <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 19 }}>Stel een tijdvak en de weekdagen in. De pauze wordt alleen afgetrokken van diensten die dat tijdvak overlappen. Een avondpauze telt dus alleen voor wie dan werkt. Pauzes veranderen de begin- en eindtijd van een dienst niet.</Text>
      </Card>
      {rules.length === 0 ? <Card><Text style={{ color: palette.muted }}>Nog geen pauzes ingesteld. Voeg bijvoorbeeld een dagpauze of avondpauze toe.</Text></Card> : rules.map((rule) => <Card key={rule.id} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name={rule.kind === 'evening' ? 'moon-outline' : 'sunny-outline'} size={21} color={palette.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: palette.ink, fontWeight: '800', fontSize: 15 }}>{rule.label}</Text>
          <Text style={{ color: palette.muted, fontSize: 12, marginTop: 4 }}>{showTime(rule.startMinute)}–{showTime(rule.endMinute)} · {rule.weekdays.map((day) => WEEKDAYS.find((item) => item.id === day)?.short).join(' ')}</Text>
        </View>
        <Pressable onPress={() => open(rule)} accessibilityLabel="Pauze bewerken" style={{ padding: 9 }}><Ionicons name="create-outline" size={21} color={palette.primary} /></Pressable>
        <Pressable onPress={() => remove(rule)} accessibilityLabel="Pauze verwijderen" style={{ padding: 9 }}><Ionicons name="trash-outline" size={20} color={palette.red} /></Pressable>
      </Card>)}
      <PrimaryButton title="Pauze toevoegen" icon="add" onPress={() => open()} />
    </ScrollView>
    <BreakForm visible={formVisible} rule={selected} onClose={close} onSave={save} />
  </View>;
}

function BreakForm({ visible, rule, onClose, onSave }: { visible: boolean; rule?: BreakRule; onClose: () => void; onSave: (rule: BreakRule) => void }) {
  const [kind, setKind] = useState<'day' | 'evening'>('day');
  const [label, setLabel] = useState('Dagpauze');
  const [start, setStart] = useState('12:00');
  const [end, setEnd] = useState('12:30');
  const [days, setDays] = useState<Weekday[]>(WEEKDAYS.map(({ id }) => id));

  useEffect(() => {
    if (!visible) return;
    setKind(rule?.kind ?? 'day');
    setLabel(rule?.label ?? 'Dagpauze');
    setStart(showTime(rule?.startMinute ?? 720));
    setEnd(showTime(rule?.endMinute ?? 750));
    setDays(rule?.weekdays ?? WEEKDAYS.map(({ id }) => id));
  }, [visible, rule]);

  const selectKind = (next: 'day' | 'evening') => {
    setKind(next);
    if (!rule || label === 'Dagpauze' || label === 'Avondpauze') setLabel(next === 'day' ? 'Dagpauze' : 'Avondpauze');
    if (!rule) { setStart(next === 'day' ? '12:00' : '18:00'); setEnd(next === 'day' ? '12:30' : '18:30'); }
  };
  const save = () => {
    const from = parseTimeInput(start);
    const until = parseTimeInput(end);
    if (from === null || until === null || until <= from) { Alert.alert('Pauzetijden controleren', 'De eindtijd moet na de begintijd liggen.'); return; }
    if (days.length === 0) { Alert.alert('Weekdagen kiezen', 'Selecteer ten minste één dag.'); return; }
    onSave({ id: rule?.id ?? makeId(), kind, label: label.trim() || (kind === 'day' ? 'Dagpauze' : 'Avondpauze'), startMinute: from, endMinute: until, weekdays: [...days].sort() });
  };
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: palette.page }}>
      <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18 }}><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 23 }}>{rule ? 'Pauze bewerken' : 'Pauze toevoegen'}</Text><RoundIconButton icon="close" accessibilityLabel="Sluiten" onPress={onClose} /></View>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 18, paddingBottom: 48, gap: 15 }}>
          <Card style={{ gap: 13 }}>
            <View style={{ flexDirection: 'row', gap: 9 }}>{(['day', 'evening'] as const).map((item) => <Pressable key={item} onPress={() => selectKind(item)} style={{ padding: 11, borderRadius: 12, backgroundColor: kind === item ? palette.primary : palette.palePrimary }}><Text style={{ color: kind === item ? '#FFF' : palette.primaryDark, fontWeight: '800' }}>{item === 'day' ? 'Overdag' : 'Avond'}</Text></Pressable>)}</View>
            <Field label="Naam" value={label} onChangeText={setLabel} />
            <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><TimeField label="Van" value={start} onChangeText={setStart} /></View><View style={{ flex: 1 }}><TimeField label="Tot" value={end} onChangeText={setEnd} /></View></View>
            <Text style={{ color: palette.ink, fontWeight: '800' }}>Weekdagen</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{WEEKDAYS.map(({ id, short }) => <Pressable key={id} onPress={() => setDays((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} accessibilityRole="checkbox" accessibilityState={{ checked: days.includes(id) }} style={{ paddingHorizontal: 13, paddingVertical: 9, borderRadius: 11, backgroundColor: days.includes(id) ? palette.primary : palette.palePrimary }}><Text style={{ color: days.includes(id) ? '#FFF' : palette.primaryDark, fontWeight: '800' }}>{short}</Text></Pressable>)}</View>
          </Card>
          <PrimaryButton title="Pauze opslaan" icon="checkmark" onPress={save} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
