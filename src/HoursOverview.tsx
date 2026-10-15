import React from 'react';
import { Text, View } from 'react-native';
import { Employee, PlannerSettings, Schedule } from './domain';
import { weeklyHoursOverview } from './planner';
import { Avatar, Card, palette, SectionTitle } from './ui';

function hours(minutes: number): string {
  return (minutes / 60).toLocaleString('nl-NL', { maximumFractionDigits: 2 });
}

export function HoursOverview({ schedule, employees, settings, title = 'Uren deze week' }: { schedule: Schedule; employees: Employee[]; settings?: PlannerSettings; title?: string }) {
  const rows = weeklyHoursOverview(schedule, employees, settings);
  const total = rows.reduce((sum, row) => sum + row.plannedMinutes, 0);
  return <>
    <SectionTitle title={title} trailing={<Text style={{ color: palette.muted, fontSize: 12 }}>{hours(total)} uur gepland</Text>} />
    <Card style={{ padding: 14, gap: 8 }}>
      <Text style={{ color: palette.muted, fontSize: 11, marginBottom: 2 }}>Werkuren na aftrek van pauzes · verschil ten opzichte van weekcontract</Text>
      {rows.map(({ employee, plannedMinutes, paidInternMinutes, contractMinutes }) => {
        const difference = plannedMinutes - contractMinutes;
        return <View key={employee.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: palette.line }}>
          <Avatar employee={employee} size={33} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.ink, fontSize: 13, fontWeight: '800' }}>{employee.displayName}{employee.active ? '' : ' · uit dienst'}</Text>
            {paidInternMinutes > 0 ? <Text style={{ color: palette.primary, fontSize: 11, marginTop: 2 }}>{hours(paidInternMinutes)} uur betaalde stage</Text> : null}
          </View>
          <View style={{ minWidth: 115, alignItems: 'flex-end' }}>
            <Text style={{ color: palette.ink, fontSize: 13, fontWeight: '800' }}>{hours(plannedMinutes)} / {contractMinutes > 0 ? hours(contractMinutes) : '—'} u</Text>
            <Text style={{ color: contractMinutes > 0 && difference > 0 ? palette.amber : palette.muted, fontSize: 11, marginTop: 2 }}>
              {contractMinutes > 0 ? `${difference > 0 ? '+' : ''}${hours(difference)} u verschil` : 'Geen weekcontract'}
            </Text>
          </View>
        </View>;
      })}
    </Card>
  </>;
}
