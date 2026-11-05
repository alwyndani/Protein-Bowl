import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '../../api/ApiError';
import { formatIstDateTime } from '../../commerce/dates';
import { useRefetchOnFocus } from '../../commerce/hooks';
import type { WorkoutsStackParamList } from '../../navigation/types';
import { useLogProgress, useWorkoutLogs, useWorkoutPlans } from '../../workouts/hooks';
import { validateLog, workoutMessage, type LogFormErrors } from '../../workouts/logForm';
import type { WorkoutDay, WorkoutExercise, WorkoutLog, WorkoutPlan } from '../../workouts/types';
import { Body, Button, colors, Notice, Screen, TextField, Title } from '../../ui/components';
import { EmptyState, ErrorState, Pill, StaleBanner } from '../../ui/commerceUi';

type ListProps = NativeStackScreenProps<WorkoutsStackParamList, 'WorkoutPlans'>;
type DetailProps = NativeStackScreenProps<WorkoutsStackParamList, 'WorkoutPlan'>;

const NOT_PROVIDED = 'Not provided';
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const text = (v: string | null | undefined) => (v && v.trim() ? v : NOT_PROVIDED);

const STATUS: Record<string, { label: string; tone: 'good' | 'neutral' | 'warn' }> = {
  ACTIVE: { label: 'Active', tone: 'good' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
  ARCHIVED: { label: 'Archived', tone: 'warn' }
};
const statusPill = (status: string) => STATUS[status] ?? { label: NOT_PROVIDED, tone: 'neutral' as const };

function Loading({ label }: { label: string }) {
  return (
    <View accessibilityLabel={label} style={styles.center}>
      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  );
}

export function WorkoutPlansScreen({ navigation }: ListProps) {
  const plans = useWorkoutPlans();
  useRefetchOnFocus(plans.refetch);

  if (plans.isPending) return <Loading label="Loading your workout plans" />;
  if (plans.isError && !plans.data) return <ErrorState message={workoutMessage(plans.error)} onRetry={() => void plans.refetch()} />;
  const list = plans.data ?? [];
  return (
    <View style={styles.flex}>
      {plans.isError ? <StaleBanner onRetry={() => void plans.refetch()} /> : null}
      {list.length === 0 ? (
        <EmptyState title="No workout plan yet" body="Once a trainer is assigned to you, the plans they publish will appear here." />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={plans.isRefetching} onRefresh={() => void plans.refetch()} tintColor={colors.accent} />}
          renderItem={({ item }) => <PlanCard plan={item} onPress={() => navigation.navigate('WorkoutPlan', { planId: item.id })} />}
        />
      )}
    </View>
  );
}

function PlanCard({ plan, onPress }: { plan: WorkoutPlan; onPress: () => void }) {
  const s = statusPill(plan.status);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${plan.title}, ${s.label}`} onPress={onPress} style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.name}>{plan.title}</Text>
        <Pill label={s.label} tone={s.tone} />
      </View>
      <Text style={styles.meta}>{`Goal: ${text(plan.goal)}`}</Text>
      <Text style={styles.meta}>{plan.durationWeeks ? `${plan.durationWeeks} weeks` : `Duration: ${NOT_PROVIDED}`}</Text>
    </Pressable>
  );
}

function exerciseLine(x: WorkoutExercise): string {
  const sets = x.sets != null ? `${x.sets} sets` : `sets ${NOT_PROVIDED}`;
  const reps = x.reps ? `${x.reps} reps` : `reps ${NOT_PROVIDED}`;
  const rest = x.restSeconds != null ? `rest ${x.restSeconds}s` : `rest ${NOT_PROVIDED}`;
  return `${sets} · ${reps} · ${rest}`;
}

function DayCard({ day }: { day: WorkoutDay }) {
  return (
    <View style={styles.box}>
      <Text style={styles.name}>{`${cap(day.dayOfWeek)} - ${day.title}`}</Text>
      <Text style={styles.meta}>{`Focus: ${text(day.focusArea)}`}</Text>
      {day.exercises.map((x) => (
        <View key={x.id} style={styles.exercise}>
          <Text style={styles.exName}>{x.name}</Text>
          <Text style={styles.meta}>{exerciseLine(x)}</Text>
          {x.notes ? <Text style={styles.meta}>{x.notes}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export function WorkoutPlanScreen({ route }: DetailProps) {
  const { planId } = route.params;
  const plans = useWorkoutPlans();
  useRefetchOnFocus(plans.refetch);

  if (plans.isPending) return <Loading label="Loading workout plan" />;
  if (plans.isError && !plans.data) return <ErrorState message={workoutMessage(plans.error)} onRetry={() => void plans.refetch()} />;
  const plan = plans.data?.find((p) => p.id === planId);
  if (!plan) return <ErrorState message="We could not find this workout plan." />;
  const s = statusPill(plan.status);

  return (
    <Screen>
      {plans.isError ? <StaleBanner onRetry={() => void plans.refetch()} /> : null}
      <Title>{plan.title}</Title>
      <View style={styles.rowWrap}>
        <Pill label={s.label} tone={s.tone} />
      </View>
      <Body muted>{`Goal: ${text(plan.goal)}`}</Body>
      <Body muted>{plan.durationWeeks ? `${plan.durationWeeks} weeks` : `Duration: ${NOT_PROVIDED}`}</Body>
      <View style={styles.box}>
        <Text style={styles.name}>Trainer notes</Text>
        <Text style={styles.meta}>{text(plan.notes)}</Text>
      </View>
      {plan.workoutDays.map((d) => (
        <DayCard key={d.id} day={d} />
      ))}
      {plan.status === 'ACTIVE' ? <LogForm plan={plan} /> : <Notice tone="info">This plan is not active, so progress can no longer be logged.</Notice>}
      <LogHistory plan={plan} />
    </Screen>
  );
}

function LogForm({ plan }: { plan: WorkoutPlan }) {
  const log = useLogProgress(plan.id);
  const [dayId, setDayId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(true);
  const [effort, setEffort] = useState('');
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<LogFormErrors>({});
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async () => {
    if (log.isPending) return;
    setSaved(false);
    setFailure(null);
    const result = validateLog({ workoutDayId: dayId, completed, effort, weight, notes });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    try {
      await log.mutateAsync(result.body);
      setSaved(true);
      setDayId(null);
      setCompleted(true);
      setEffort('');
      setWeight('');
      setNotes('');
    } catch (e) {
      setFailure(workoutMessage(e)); // never reported as saved
    }
  };

  return (
    <View style={styles.box}>
      <Text style={styles.name}>Log your progress</Text>
      <Text style={styles.meta}>Session</Text>
      <View style={styles.rowWrap}>
        <Chip label="General" selected={dayId === null} onPress={() => setDayId(null)} />
        {plan.workoutDays.map((d) => (
          <Chip key={d.id} label={`${cap(d.dayOfWeek)} - ${d.title}`} selected={dayId === d.id} onPress={() => setDayId(d.id)} />
        ))}
      </View>
      <View style={styles.rowWrap}>
        <Chip label="Completed" selected={completed} onPress={() => setCompleted(true)} />
        <Chip label="Skipped" selected={!completed} onPress={() => setCompleted(false)} />
      </View>
      <TextField label="Effort (1-10)" value={effort} onChangeText={setEffort} keyboardType="number-pad" maxLength={2} error={errors.effort} />
      <TextField label="Body weight (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" maxLength={6} error={errors.weight} />
      <TextField label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={600} error={errors.notes} />
      {failure ? <Notice>{failure}</Notice> : null}
      {saved ? <Notice tone="info">Progress saved.</Notice> : null}
      <Button label="Save progress" onPress={() => void submit()} busy={log.isPending} />
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipOn]}>
      <Text style={[styles.chipText, selected && { color: colors.accentText }]}>{label}</Text>
    </Pressable>
  );
}

function LogHistory({ plan }: { plan: WorkoutPlan }) {
  const logs = useWorkoutLogs(plan.id);
  const dayTitle = (id: string | null) => {
    if (!id) return 'General';
    const d = plan.workoutDays.find((x) => x.id === id);
    return d ? `${cap(d.dayOfWeek)} - ${d.title}` : NOT_PROVIDED;
  };

  let body: React.ReactNode;
  if (logs.isPending) body = <Text style={styles.meta}>Loading your progress...</Text>;
  else if (logs.isError && !logs.data) {
    const gone = logs.error instanceof ApiError && logs.error.status === 404;
    body = (
      <>
        <Notice>{gone ? 'We could not find this plan.' : workoutMessage(logs.error)}</Notice>
        {gone ? null : <Button label="Reload progress" variant="secondary" onPress={() => void logs.refetch()} />}
      </>
    );
  } else if ((logs.data ?? []).length === 0) body = <Text style={styles.meta}>No progress logged yet.</Text>;
  else body = (logs.data ?? []).map((l) => <LogRow key={l.id} log={l} day={dayTitle(l.workoutDayId)} />);

  return (
    <View style={styles.box}>
      <Text style={styles.name}>Your progress</Text>
      {body}
    </View>
  );
}

function LogRow({ log, day }: { log: WorkoutLog; day: string }) {
  return (
    <View style={styles.exercise}>
      <Text style={styles.exName}>{`${formatIstDateTime(log.loggedOn)} · ${log.completed ? 'Completed' : 'Skipped'}`}</Text>
      <Text style={styles.meta}>{day}</Text>
      <Text style={styles.meta}>{`Effort: ${log.perceivedEffort != null ? `${log.perceivedEffort}/10` : NOT_PROVIDED}`}</Text>
      <Text style={styles.meta}>{`Body weight: ${log.bodyWeightKg != null && log.bodyWeightKg !== '' ? `${log.bodyWeightKg} kg` : NOT_PROVIDED}`}</Text>
      {log.notes ? <Text style={styles.meta}>{log.notes}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  card: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 6 },
  box: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  rowWrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  name: { color: colors.text, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  exName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 13 },
  exercise: { gap: 2, paddingVertical: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '600' }
});
