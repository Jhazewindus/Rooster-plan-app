import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { BreakRule, makeId, WEEKDAYS, Weekday } from './domain';
import { usePlanner } from './store';
import { Card, Field, PageHeading, palette, PrimaryButton, RoundIconButton, TimeField } from './ui';
import { parseTimeInput } from './timeInput';
import { createBackup, parseBackup } from './backup';

function showTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function SettingsScreen() {
  const planner = usePlanner();
  const rules = planner.data.settings?.breaks ?? [];
  const [formVisible, setFormVisible] = useState(false);
  const [selected, setSelected] = useState<BreakRule | undefined>();
  const [busy, setBusy] = useState(false);
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

  const saveBackup = async () => {
    try {
      setBusy(true);
      const name = `RoosterPlan-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const file = new File(Paths.cache, name);
      file.write(createBackup({ data: planner.data, history: planner.history }));
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Back-up bewaren' });
      else await Share.share({ url: file.uri, message: 'RoosterPlan-back-up' });
    } catch (cause) {
      Alert.alert('Back-up maken mislukt', cause instanceof Error ? cause.message : 'Probeer het opnieuw.');
    } finally { setBusy(false); }
  };

  const restoreBackup = async () => {
    try {
      setBusy(true);
      const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (picked.canceled) return;
      const file = new File(picked.assets[0].uri);
      const { archive, exportedAt } = parseBackup(await file.text());
      const day = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(exportedAt));
      Alert.alert('Back-up terugzetten?', `Back-up van ${day}: ${archive.data.employees.length} medewerkers, ${archive.data.schedules.length} roosterweken en ${archive.data.absences.length} afwezigheden.\n\nDe huidige gegevens en wijzigingsgeschiedenis op deze tablet worden vervangen. Bewaar ze eerst als back-up als je ze wilt houden.`, [
        { text: 'Annuleren', style: 'cancel' },
        { text: 'Terugzetten', onPress: () => planner.restoreArchive(archive) },
      ]);
    } catch (cause) {
      Alert.alert('Back-up openen mislukt', cause instanceof Error ? cause.message : 'Kies een RoosterPlan-back-upbestand.');
    } finally { setBusy(false); }
  };

  if (planner.storageBlocked) return <View style={{ flex: 1, backgroundColor: palette.page }}><ScrollView contentContainerStyle={{ padding: 19, gap: 14 }}>
    <PageHeading eyebrow="Herstel" title="Gegevens terugzetten" subtitle="De opgeslagen gegevens konden niet worden geopend. Zet een RoosterPlan-back-up terug om verder te gaan." />
    <Card style={{ gap: 12 }}><Text style={{ color: palette.ink, fontSize: 14 }}>Je huidige gegevens worden niet overschreven totdat je een back-up kiest en bevestigt.</Text><PrimaryButton title={busy ? 'Bestand openen…' : 'Back-up terugzetten'} icon="folder-open-outline" disabled={busy} onPress={restoreBackup} /></Card>
  </ScrollView></View>;

  return <View style={{ flex: 1, backgroundColor: palette.page }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 19, paddingBottom: 32, gap: 12 }}>
      <PageHeading eyebrow="Algemeen" title="Instellingen" subtitle="Pauzes, back-ups en je laatste wijzigingen op één plek." />
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

      <Card style={{ gap: 10, marginTop: 6 }}>
        <Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>Back-up en herstel</Text>
        <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}>Bewaar een volledige kopie van medewerkers, afwezigheden, roosters, pauzes en de wijzigingsgeschiedenis. Zet die later terug op deze of een andere tablet.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
          <View style={{ minWidth: 190, flex: 1 }}><PrimaryButton title={busy ? 'Even wachten…' : 'Back-up bewaren'} icon="download-outline" disabled={busy} compact onPress={saveBackup} /></View>
          <View style={{ minWidth: 190, flex: 1 }}><PrimaryButton title="Back-up terugzetten" icon="folder-open-outline" disabled={busy} compact onPress={restoreBackup} /></View>
        </View>
        <Text style={{ color: palette.muted, fontSize: 11 }}>Bewaar het bestand op een veilige plek. Een Excel-export kan niet worden teruggezet.</Text>
      </Card>

      <Card style={{ gap: 9 }}>
        <Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>Laatste wijzigingen</Text>
        <Text style={{ color: palette.muted, fontSize: 12 }}>De laatste 30 wijzigingen op deze tablet. Alleen de nieuwste wijziging kun je terugdraaien.</Text>
        {planner.history.length === 0 ? <Text style={{ color: palette.muted, fontSize: 12 }}>Nog geen wijzigingen opgeslagen.</Text> : planner.history.slice().reverse().map((entry, index) => <View key={entry.id} style={{ borderTopWidth: 1, borderColor: palette.line, paddingTop: 9, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View style={{ flex: 1 }}><Text style={{ color: entry.undoneAt ? palette.muted : palette.ink, fontWeight: '700', fontSize: 12 }}>{entry.label}{entry.undoneAt ? ' · teruggedraaid' : ''}</Text><Text style={{ color: palette.muted, fontSize: 11, marginTop: 3 }}>{new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(entry.at))} · {entry.actor}</Text></View>
          {index === 0 && planner.canUndo ? <Pressable accessibilityRole="button" accessibilityLabel="Laatste wijziging terugdraaien" onPress={() => Alert.alert('Laatste wijziging terugdraaien?', entry.label, [
            { text: 'Annuleren', style: 'cancel' }, { text: 'Terugdraaien', onPress: planner.undoLastChange },
          ])} style={{ padding: 8, borderRadius: 9, backgroundColor: palette.palePrimary }}><Text style={{ color: palette.primaryDark, fontWeight: '800', fontSize: 12 }}>Terugdraaien</Text></Pressable> : null}
        </View>)}
      </Card>
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
