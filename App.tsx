import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AbsencesScreen, DashboardScreen, TeamScreen } from './src/screens';
import { WeekScreen } from './src/WeekScreen';
import { HistoryScreen } from './src/HistoryScreen';
import { SettingsScreen } from './src/SettingsScreen';
import { PlannerProvider, usePlanner } from './src/store';
import { LoadingBlock, palette } from './src/ui';

type TabId = 'home' | 'week' | 'history' | 'team' | 'absences' | 'settings';
const tabs: { id: TabId; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; activeIcon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'home', label: 'Inzicht', icon: 'grid-outline', activeIcon: 'grid' },
  { id: 'week', label: 'Week', icon: 'calendar-outline', activeIcon: 'calendar' },
  { id: 'history', label: 'Historie', icon: 'time-outline', activeIcon: 'time' },
  { id: 'team', label: 'Team', icon: 'people-outline', activeIcon: 'people' },
  { id: 'absences', label: 'Afwezig', icon: 'calendar-clear-outline', activeIcon: 'calendar-clear' },
  { id: 'settings', label: 'Instellingen', icon: 'settings-outline', activeIcon: 'settings' },
];

export default function App() {
  return <SafeAreaProvider><PlannerProvider><AppContent /></PlannerProvider></SafeAreaProvider>;
}

function AppContent() {
  const planner = usePlanner();
  const [tab, setTab] = useState<TabId>('home');
  if (!planner.ready) return <SafeAreaView style={{ flex: 1, backgroundColor: palette.page }}><LoadingBlock /></SafeAreaView>;
  if (planner.storageBlocked) return <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: palette.page }}><StatusBar style="dark" /><SettingsScreen /></SafeAreaView>;

  const navigateFromHome = (target: 'week' | 'team' | 'absences') => setTab(target);
  return <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: palette.page }}>
    <StatusBar style="dark" />
    <View style={{ flex: 1 }}>
      {planner.error ? <View style={{ backgroundColor: '#F8EAE7', padding: 9, paddingHorizontal: 16 }}><Text style={{ color: '#C05F59', fontSize: 12 }}>{planner.error}</Text></View> : null}
      {tab === 'home' ? <DashboardScreen onNavigate={navigateFromHome} /> : null}
      {tab === 'week' ? <WeekScreen /> : null}
      {tab === 'history' ? <HistoryScreen /> : null}
      {tab === 'team' ? <TeamScreen /> : null}
      {tab === 'absences' ? <AbsencesScreen /> : null}
      {tab === 'settings' ? <SettingsScreen /> : null}
    </View>
    <View style={{ backgroundColor: palette.card, borderTopColor: palette.line, borderTopWidth: 1, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 5, flexDirection: 'row', justifyContent: 'space-around' }}>
      {tabs.map((item) => {
        const active = tab === item.id;
        return <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={item.label} onPress={() => setTab(item.id)} style={({ pressed }) => ({ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, gap: 4, opacity: pressed ? 0.72 : 1 })}>
          <View style={{ minWidth: 54, height: 29, borderRadius: 12, backgroundColor: active ? palette.palePrimary : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Ionicons name={active ? item.activeIcon : item.icon} size={20} color={active ? palette.primary : '#887A6E'} /></View>
          <Text style={{ color: active ? palette.primary : '#887A6E', fontSize: 10, fontWeight: active ? '800' : '600' }}>{item.label}</Text>
        </Pressable>;
      })}
    </View>
  </SafeAreaView>;
}
