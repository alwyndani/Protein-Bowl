import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '../../api/ApiError';
import { useRefetchOnFocus } from '../../commerce/hooks';
import { formatIstDateTime } from '../../commerce/dates';
import { useCalendar, useMealActions } from '../../mess/hooks';
import { formatDay, mealBadge, NOT_PROVIDED, PAUSE_FORFEIT_COPY, reasonCopy, slotLabel } from '../../mess/labels';
import { messMessage } from '../../mess/messErrors';
import type { MessMeal } from '../../mess/types';
import type { MessStackParamList } from '../../navigation/MessNavigator';
import { Body, Button, colors, Notice, Screen, Title } from '../../ui/components';
import { EmptyState, ErrorState, Pill, StaleBanner } from '../../ui/commerceUi';
import { HandoverCodePanel } from './HandoverCodePanel';
import { FailureView, LoadingView, messStyles } from './messShared';

type Props = NativeStackScreenProps<MessStackParamList, 'MessCalendar'>;

interface RowProps {
  meal: MessMeal;
  subscriptionId: string;
  actionsBusy: boolean;
  onPause: (mealId: string) => void;
  onResume: (mealId: string) => void;
}

function MealRow({ meal, subscriptionId, actionsBusy, onPause, onResume }: RowProps) {
  const [confirmPause, setConfirmPause] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const badge = mealBadge(meal);
  const why = !meal.canPause && !meal.canResume ? reasonCopy(meal.reason) : null;
  const outForService = meal.status === 'SCHEDULED' && meal.kitchenState === 'OUT_FOR_DELIVERY';
  const title = `${slotLabel(meal.slot)}, ${formatDay(meal.date)}`;

  return (
    <View style={messStyles.box} accessibilityLabel={`${title}, ${badge.label}`}>
      <View style={messStyles.between}>
        <Text style={messStyles.name}>{slotLabel(meal.slot)}</Text>
        <Pill label={badge.label} tone={badge.tone} />
      </View>
      <Text style={messStyles.meta}>{formatIstDateTime(meal.serviceAt)}</Text>
      {why ? <Text style={messStyles.meta}>{why}</Text> : null}

      {meal.canPause ? (
        confirmPause ? (
          <View style={{ gap: 8 }}>
            <Text style={styles.text}>{meal.forfeitIfPaused ? PAUSE_FORFEIT_COPY : 'This meal will be paused.'}</Text>
            <Button
              label={`Confirm pause ${title}`}
              onPress={() => {
                setConfirmPause(false);
                onPause(meal.id);
              }}
              disabled={actionsBusy}
            />
            <Button label="Keep this meal" variant="secondary" onPress={() => setConfirmPause(false)} />
          </View>
        ) : (
          <Button label={`Pause ${title}`} variant="secondary" onPress={() => setConfirmPause(true)} disabled={actionsBusy} />
        )
      ) : null}
      {meal.canResume ? <Button label={`Resume ${title}`} variant="secondary" onPress={() => onResume(meal.id)} disabled={actionsBusy} /> : null}

      {outForService ? (
        showCode ? (
          <>
            <HandoverCodePanel subscriptionId={subscriptionId} mealId={meal.id} />
            <Button label="Close handover code" variant="secondary" onPress={() => setShowCode(false)} />
          </>
        ) : (
          <Button label={`Handover code for ${title}`} variant="secondary" onPress={() => setShowCode(true)} />
        )
      ) : null}
    </View>
  );
}

/** The meal calendar. Which actions exist for a meal (canPause / canResume / reason) is entirely the server's answer. */
export function MealCalendarScreen({ route }: Props) {
  const { subscriptionId } = route.params;
  const calendar = useCalendar(subscriptionId);
  const actions = useMealActions(subscriptionId);
  useRefetchOnFocus(calendar.refetch);
  const [actionError, setActionError] = useState<unknown>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (calendar.isPending) return <LoadingView label="Loading meal calendar" />;
  if (calendar.isError && calendar.data === undefined) {
    const missing = calendar.error instanceof ApiError && calendar.error.status === 404;
    return missing ? <ErrorState message="We could not find this subscription." /> : <FailureView error={calendar.error} onRetry={() => void calendar.refetch()} />;
  }
  const data = calendar.data!;
  const head = data.subscription;

  const run = (kind: 'pause' | 'resume', mealId: string) => {
    if (actions.isLocked()) return;
    setActionError(null);
    setInfo(null);
    const m = kind === 'pause' ? actions.pause : actions.resume;
    m.mutate(mealId, {
      onSuccess: (out) => setInfo(out.changed ? (kind === 'pause' ? 'Meal paused.' : 'Meal resumed.') : 'No change: the meal was already in that state.'),
      onError: (e) => setActionError(e)
    });
  };

  const groups: Array<{ date: string; meals: MessMeal[] }> = [];
  for (const m of data.meals) {
    const last = groups[groups.length - 1];
    if (last && last.date === m.date) last.meals.push(m);
    else groups.push({ date: m.date, meals: [m] });
  }

  return (
    <Screen>
      {calendar.isError ? <StaleBanner onRetry={() => void calendar.refetch()} /> : null}
      <Title>Meal calendar</Title>
      <Body muted>{PAUSE_FORFEIT_COPY}</Body>
      <View style={messStyles.box} accessibilityLabel="Pauses">
        <Text style={styles.text}>{`Pauses used: ${head.pausesUsed}${head.maxPauses === null ? ` (limit ${NOT_PROVIDED})` : ` of ${head.maxPauses}`}`}</Text>
        {head.pauseCutoffHours !== null ? <Text style={messStyles.meta}>{`Pause or resume at least ${head.pauseCutoffHours} hours before the meal.`}</Text> : null}
      </View>
      {actionError ? <Notice>{messMessage(actionError)}</Notice> : null}
      {info && !actionError ? <Notice tone="info">{info}</Notice> : null}

      {!head.mealsReady ? (
        <Notice tone="info">Your meals are being scheduled. They will appear here shortly.</Notice>
      ) : groups.length === 0 ? (
        <EmptyState title="No meals to show" body="There are no meals in this period." />
      ) : (
        groups.map((g) => (
          <View key={g.date} style={{ gap: 8 }}>
            <Text accessibilityRole="header" style={styles.day}>
              {formatDay(g.date)}
            </Text>
            {g.meals.map((m) => (
              <MealRow key={m.id} meal={m} subscriptionId={subscriptionId} actionsBusy={actions.busy} onPause={(id) => run('pause', id)} onResume={(id) => run('resume', id)} />
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.text, fontSize: 14 },
  day: { color: colors.text, fontSize: 17, fontWeight: '700' }
});
