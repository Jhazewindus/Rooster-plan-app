import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Employee } from './domain';

export const palette = {
  page: '#F8F4EC',
  card: '#FFFEFA',
  ink: '#3E342D',
  muted: '#83766C',
  line: '#E9E0D5',
  primary: '#B76445',
  primaryDark: '#8E4934',
  palePrimary: '#F7E7DD',
  green: '#5E8267',
  paleGreen: '#E9F0E7',
  red: '#C05F59',
  paleRed: '#F8EAE7',
  amber: '#A96A2C',
  paleAmber: '#FBF0DE',
};

export function PageHeading({ eyebrow, title, subtitle, right }: { eyebrow?: string; title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 14 }}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={{ color: palette.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginBottom: 5 }}>{eyebrow.toUpperCase()}</Text> : null}
        <Text style={{ color: palette.ink, fontSize: 27, fontWeight: '800', letterSpacing: -0.65 }}>{title}</Text>
        {subtitle ? <Text style={{ color: palette.muted, fontSize: 14, marginTop: 5, lineHeight: 20 }}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: palette.card, borderRadius: 20, padding: 17, borderWidth: 1, borderColor: palette.line, shadowColor: '#514235', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 1 }, style]}>{children}</View>;
}

export function PrimaryButton({ title, onPress, icon, disabled, compact }: { title: string; onPress: () => void; icon?: React.ComponentProps<typeof Ionicons>['name']; disabled?: boolean; compact?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => ({ minHeight: compact ? 42 : 50, borderRadius: 15, paddingHorizontal: compact ? 13 : 17, backgroundColor: disabled ? '#C9CDE1' : pressed ? palette.primaryDark : palette.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: pressed ? 0.9 : 1 })}>
      {icon ? <Ionicons name={icon} size={18} color="#FFF" /> : null}
      <Text style={{ color: '#FFF', fontWeight: '800', fontSize: compact ? 13 : 15 }}>{title}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ title, onPress, icon, compact }: { title: string; onPress: () => void; icon?: React.ComponentProps<typeof Ionicons>['name']; compact?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ minHeight: compact ? 40 : 48, borderRadius: 14, paddingHorizontal: compact ? 12 : 15, backgroundColor: pressed ? '#F1D9CB' : palette.palePrimary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 })}>
      {icon ? <Ionicons name={icon} size={17} color={palette.primary} /> : null}
      <Text style={{ color: palette.primaryDark, fontWeight: '700', fontSize: compact ? 13 : 14 }}>{title}</Text>
    </Pressable>
  );
}

export function RoundIconButton({ icon, onPress, accessibilityLabel }: { icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; accessibilityLabel: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 15, backgroundColor: pressed ? '#F1D9CB' : palette.palePrimary, justifyContent: 'center', alignItems: 'center' })}><Ionicons name={icon} size={20} color={palette.primary} /></Pressable>;
}

export function Pill({ text, color = palette.primary, background = palette.palePrimary }: { text: string; color?: string; background?: string }) {
  return <View style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: background, borderRadius: 30, alignSelf: 'flex-start' }}><Text style={{ color, fontSize: 11, fontWeight: '800' }}>{text}</Text></View>;
}

export function Avatar({ employee, size = 43 }: { employee: Pick<Employee, 'displayName' | 'color'>; size?: number }) {
  const initials = employee.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: employee.color, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#FFFEFA', fontWeight: '800', fontSize: size * 0.33 }}>{initials}</Text></View>;
}

export function Field({ label, style, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '700' }}>{label}</Text>
      <TextInput placeholderTextColor="#A99D91" {...props} style={[{ minHeight: 48, borderWidth: 1, borderColor: palette.line, borderRadius: 13, paddingHorizontal: 13, color: palette.ink, fontSize: 15, backgroundColor: '#FFFEFA' }, style]} />
    </View>
  );
}

export function SectionTitle({ title, trailing }: { title: string; trailing?: React.ReactNode }) {
  return <View style={{ marginTop: 23, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: palette.ink, fontWeight: '800', fontSize: 17 }}>{title}</Text>{trailing}</View>;
}

export function EmptyState({ title, detail, icon = 'calendar-outline', action }: { title: string; detail: string; icon?: React.ComponentProps<typeof Ionicons>['name']; action?: React.ReactNode }) {
  return <Card style={{ alignItems: 'center', paddingVertical: 27, paddingHorizontal: 22 }}>
    <View style={{ width: 54, height: 54, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.palePrimary, marginBottom: 12 }}><Ionicons name={icon} size={26} color={palette.primary} /></View>
    <Text style={{ color: palette.ink, fontSize: 16, fontWeight: '800', textAlign: 'center' }}>{title}</Text>
    <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' }}>{detail}</Text>
    {action ? <View style={{ marginTop: 15, width: '100%' }}>{action}</View> : null}
  </Card>;
}

export function LoadingBlock() {
  return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 }}><ActivityIndicator color={palette.primary} /><Text style={{ color: palette.muted }}>RoosterPlan laden…</Text></View>;
}
