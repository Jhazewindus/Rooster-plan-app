import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Employee, Shift, formatTime } from './domain';
import { recommendations, suggestCoverage } from './planner';
import { Avatar, Card, palette, Pill, PrimaryButton, RoundIconButton } from './ui';

type Props = {
  visible: boolean;
  onClose: () => void;
  shift?: Shift;
  employees: Employee[];
  scheduleShifts: Shift[];
  absences: Parameters<typeof recommendations>[3];
  onAssign: (employeeId: string) => void;
  onUsePlan: () => void;
};

export function RecommendationsSheet({ visible, onClose, shift, employees, scheduleShifts, absences, onAssign, onUsePlan }: Props) {
  const schedule = useMemo(() => shift ? ({
    id: 'suggestion-context', weekStart: shift.startAt, status: 'draft' as const,
    createdAt: shift.startAt, updatedAt: shift.startAt, shifts: scheduleShifts,
  }) : undefined, [shift, scheduleShifts]);
  const options = shift && schedule ? recommendations(shift, schedule, employees, absences) : [];
  const coverage = shift && schedule ? suggestCoverage(shift, schedule, employees, absences) : undefined;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: palette.page }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
          <View><Text style={{ color: palette.muted, fontWeight: '700', fontSize: 11, letterSpacing: 0.9 }}>OPEN DIENST</Text><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 23, marginTop: 3 }}>Vervangers</Text></View>
          <RoundIconButton icon="close" accessibilityLabel="Sluiten" onPress={onClose} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, paddingBottom: 35, gap: 14 }}>
          {shift ? <Card style={{ backgroundColor: '#FFF8F0', borderColor: '#F4E6D4' }}>
            <Text style={{ color: '#A6631D', fontSize: 11, fontWeight: '800', letterSpacing: 0.7 }}>OPEN TIJDVAK</Text>
            <Text style={{ color: palette.ink, fontSize: 20, fontWeight: '800', marginTop: 6 }}>{formatTime(shift.startAt)} – {formatTime(shift.endAt)}</Text>
            <Text style={{ color: palette.muted, fontSize: 13, marginTop: 4 }}>Kies een vervanger. De planner bevestigt elke wijziging.</Text>
          </Card> : null}

          {coverage?.isComplete && coverage.segments.length > 1 ? <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="git-branch-outline" size={18} color={palette.primary} /><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>Verdeling over meerdere mensen</Text></View>
            <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 5 }}>Samen vullen zij het hele open tijdvak. Controleer de voorgestelde verdeling voor je bevestigt.</Text>
            <View style={{ marginTop: 12, gap: 8 }}>
              {coverage.segments.map((segment) => {
                const employee = employees.find((item) => item.id === segment.employeeId);
                return employee ? <View key={`${segment.employeeId}-${segment.startAt}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Avatar employee={employee} size={31} /><Text style={{ color: palette.ink, flex: 1, fontWeight: '700', fontSize: 13 }}>{employee.firstName}</Text><Text style={{ color: palette.muted, fontWeight: '700', fontSize: 12 }}>{formatTime(segment.startAt)} – {formatTime(segment.endAt)}</Text></View> : null;
              })}
            </View>
            <View style={{ marginTop: 15 }}><PrimaryButton title="Gebruik deze verdeling" onPress={onUsePlan} icon="checkmark-done" /></View>
          </Card> : null}

          <Text style={{ color: palette.ink, fontSize: 17, fontWeight: '800', marginTop: 3 }}>Beste matches</Text>
          {options.length === 0 ? <Card><Text style={{ color: palette.muted, lineHeight: 20 }}>Voeg medewerkers toe om vervangers te kunnen voorstellen.</Text></Card> : options.map((option, index) => (
            <Card key={option.employee.id} style={{ padding: 14, opacity: option.canCover ? 1 : 0.68 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                <Avatar employee={option.employee} size={43} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Text style={{ color: palette.ink, fontSize: 15, fontWeight: '800' }}>{option.employee.displayName}</Text>
                    {index === 0 && option.canCover ? <Pill text="Beste keuze" color="#5E8267" background="#E9F0E7" /> : null}
                  </View>
                  <Text style={{ color: palette.muted, fontSize: 12, marginTop: 3 }}>{option.employee.role} · {formatHours(option.projectedWeeklyMinutes)} / {formatHours(option.employee.weeklyContractMinutes)} uur na dienst</Text>
                </View>
                {option.exceedsContract ? <Pill text="Overuren" color="#A6631D" background="#FFF3E2" /> : null}
              </View>
              <View style={{ marginTop: 11, gap: 6 }}>
                {option.reasons.slice(0, 3).map((reason) => <View key={reason} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name={reason.includes('conflict') || reason.includes('Afwezig') ? 'alert-circle' : 'checkmark-circle'} size={15} color={reason.includes('conflict') || reason.includes('Afwezig') ? palette.red : palette.green} /><Text style={{ color: palette.muted, fontSize: 12 }}>{reason}</Text></View>)}
              </View>
              {option.canCover ? <Pressable onPress={() => onAssign(option.employee.id)} style={({ pressed }) => ({ marginTop: 12, minHeight: 42, borderRadius: 13, backgroundColor: pressed ? '#F1D9CB' : palette.palePrimary, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 })}><Ionicons name="person-add-outline" size={16} color={palette.primary} /><Text style={{ color: palette.primaryDark, fontWeight: '800', fontSize: 13 }}>Wijs toe</Text></Pressable> : <View style={{ marginTop: 11, flexDirection: 'row', gap: 6, alignItems: 'center' }}><Ionicons name="ban-outline" size={15} color={palette.red} /><Text style={{ color: palette.red, fontSize: 12, fontWeight: '700' }}>Niet beschikbaar</Text></View>}
            </Card>
          ))}
          {!coverage?.isComplete && shift ? <Card style={{ backgroundColor: '#F9FAFC' }}><Text style={{ color: palette.muted, fontSize: 13, lineHeight: 19 }}>Er is nog geen combinatie gevonden die alle uren dekt. Je kunt een deel van de dienst toewijzen en de rest open laten.</Text></Card> : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace('.', ',');
}
