import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WellnessStackParamList } from '../../navigation/WellnessNavigator';
import { Body, Button, colors, Notice, TextField } from '../../ui/components';
import { EmptyState, ErrorState, Pill, StaleBanner } from '../../ui/commerceUi';
import { wellnessMessage } from '../../wellness/errors';
import { useDietPlans, useDietRequests, useDietWrites } from '../../wellness/diet/hooks';
import {
  amount,
  buildRequest,
  dietRequestGate,
  type DietRequestErrors,
  type DietRequestForm,
  mealTypeLabel,
  NOT_PROVIDED,
  PLAN_TYPE_OPTIONS,
  planStatus,
  planTypeLabel,
  requestStatus,
  validateRequest
} from '../../wellness/diet/form';
import type { DietDay, DietPlan } from '../../wellness/diet/types';
import { useHealthProfile } from '../../wellness/health/hooks';
import { GOAL_OPTIONS } from '../../wellness/health/form';
import { Card, Chip, ChipGroup, Field, Heading, Loading, Page } from './wellnessUi';

type ListProps = NativeStackScreenProps<WellnessStackParamList, 'DietPlans'>;
type FormProps = NativeStackScreenProps<WellnessStackParamList, 'DietRequestForm'>;
type DetailProps = NativeStackScreenProps<WellnessStackParamList, 'DietPlanDetail'>;

const dateText = (iso: string | null | undefined): string => {
  if (!iso) return NOT_PROVIDED;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? NOT_PROVIDED : d.toISOString().slice(0, 10);
};

// ------------------------------------------------------------------------------------------------------------ list + status
export function DietPlansScreen({ navigation }: ListProps) {
  const profile = useHealthProfile();
  const requests = useDietRequests();
  const plans = useDietPlans();

  if (requests.isPending || plans.isPending) return <Loading label="Loading diet plans" />;
  if ((requests.isError && !requests.data) || (plans.isError && !plans.data)) {
    const failed = requests.isError && !requests.data ? requests.error : plans.error;
    return (
      <ErrorState
        message={wellnessMessage(failed)}
        onRetry={() => {
          void requests.refetch();
          void plans.refetch();
        }}
      />
    );
  }
  const reqs = requests.data ?? [];
  const list = plans.data ?? [];
  const gate = dietRequestGate(profile.data, reqs);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {requests.isError || plans.isError ? (
        <StaleBanner
          onRetry={() => {
            void requests.refetch();
            void plans.refetch();
          }}
        />
      ) : null}
      <Page>
        <Card>
          <Heading>Request a diet plan</Heading>
          {profile.isPending ? (
            <Body muted>Checking your health profile...</Body>
          ) : profile.isError && !profile.data ? (
            <>
              <Notice>{wellnessMessage(profile.error)}</Notice>
              <Button label="Try again" variant="secondary" onPress={() => void profile.refetch()} />
            </>
          ) : gate.allowed ? (
            <>
              <Body muted>A nutritionist will prepare a plan from your goal and health profile.</Body>
              <Button label="Request a diet plan" onPress={() => navigation.navigate('DietRequestForm')} />
            </>
          ) : gate.reason === 'open' ? (
            <Body muted>You already have a request in progress. You can ask for a new plan once it is finished.</Body>
          ) : (
            <>
              <Body muted>Complete your health profile (height, weight, goal and activity level) before requesting a plan.</Body>
              <Button label="Open health profile" variant="secondary" onPress={() => navigation.navigate('HealthProfile')} />
            </>
          )}
        </Card>

        <Heading>Your requests</Heading>
        {reqs.length === 0 ? (
          <EmptyState title="No diet plan requests yet" />
        ) : (
          reqs.map((r) => {
            const st = requestStatus(r.status);
            return (
              <Card key={r.id}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{r.goal}</Text>
                <Pill label={st.label} tone={st.tone} />
                <Field label="Plan type" value={planTypeLabel(r.planType)} />
                <Field label="Duration" value={amount(r.durationDays, 'days')} />
                <Field label="Requested on" value={dateText(r.createdAt)} />
                {r.revisionNotes ? <Field label="Your revision request" value={r.revisionNotes} /> : null}
              </Card>
            );
          })
        )}

        <Heading>Your plans</Heading>
        {list.length === 0 ? (
          <EmptyState title="No plans published yet" body="Your plan appears here when your nutritionist publishes it." />
        ) : (
          list.map((p) => {
            const st = planStatus(p.status);
            return (
              <Card key={p.id}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{p.name}</Text>
                <Text style={{ color: colors.muted }}>{`Version ${p.versionNumber}`}</Text>
                <Pill label={st.label} tone={st.tone} />
                <Button label={`View ${p.name}`} variant="secondary" onPress={() => navigation.navigate('DietPlanDetail', { planId: p.id })} />
              </Card>
            );
          })
        )}
      </Page>
    </View>
  );
}

// ------------------------------------------------------------------------------------------------------------ request form
export function DietRequestFormScreen({ navigation }: FormProps) {
  const profile = useHealthProfile();
  const requests = useDietRequests();
  const writes = useDietWrites();
  const [form, setForm] = useState<DietRequestForm>({ goal: '', planType: '', durationDays: '', allergiesExclusions: '', notes: '' });
  const [errors, setErrors] = useState<DietRequestErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const lock = useRef(false);
  const set = <K extends keyof DietRequestForm>(k: K, v: DietRequestForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (profile.isPending || requests.isPending) return <Loading label="Loading" />;
  if (profile.isError && !profile.data) return <ErrorState message={wellnessMessage(profile.error)} onRetry={() => void profile.refetch()} />;
  if (requests.isError && !requests.data) return <ErrorState message={wellnessMessage(requests.error)} onRetry={() => void requests.refetch()} />;
  const gate = dietRequestGate(profile.data, requests.data);
  if (!gate.allowed) {
    return (
      <EmptyState
        title={gate.reason === 'open' ? 'You already have a request in progress' : 'Complete your health profile first'}
        body={gate.reason === 'open' ? 'You can ask for a new plan once it is finished.' : 'Height, weight, goal and activity level are needed.'}
      />
    );
  }

  async function submit() {
    if (lock.current) return;
    const e = validateRequest(form);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    lock.current = true;
    setFormError(null);
    try {
      await writes.create.mutateAsync(buildRequest(form));
      navigation.goBack();
    } catch (err) {
      setFormError(wellnessMessage(err));
    } finally {
      lock.current = false;
    }
  }

  return (
    <Page>
      {formError ? <Notice>{formError}</Notice> : null}
      <Card>
        <ChipGroup label="Your goal" error={errors.goal}>
          {GOAL_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} selected={form.goal === o.label} onPress={() => set('goal', o.label)} />
          ))}
        </ChipGroup>
        <ChipGroup label="Plan type" error={errors.planType}>
          {PLAN_TYPE_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} selected={form.planType === o.value} onPress={() => set('planType', o.value)} />
          ))}
        </ChipGroup>
        <TextField label="Number of days (optional)" value={form.durationDays} onChangeText={(v) => set('durationDays', v)} error={errors.durationDays} keyboardType="number-pad" />
        <TextField label="Allergies or foods to avoid (optional)" value={form.allergiesExclusions} onChangeText={(v) => set('allergiesExclusions', v)} multiline />
        <TextField label="Notes for your nutritionist (optional)" value={form.notes} onChangeText={(v) => set('notes', v)} multiline />
      </Card>
      <Button label="Send request" busy={writes.create.isPending} onPress={() => void submit()} />
    </Page>
  );
}

// ------------------------------------------------------------------------------------------------------------ plan detail
function DayCard({ day, open, onToggle }: { day: DietDay; open: boolean; onToggle: () => void }) {
  return (
    <Card>
      <Pressable accessibilityRole="button" accessibilityLabel={`Day ${day.dayNumber} ${day.dayName}`} accessibilityState={{ expanded: open }} onPress={onToggle}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{`Day ${day.dayNumber} - ${day.dayName}`}</Text>
      </Pressable>
      {open ? (
        <>
          {day.notes ? <Body muted>{day.notes}</Body> : null}
          {day.meals.length === 0 ? <Body muted>No meals listed for this day.</Body> : null}
          {day.meals.map((m) => (
            <View key={m.id} style={{ gap: 2, paddingTop: 6 }}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>{`${mealTypeLabel(m.mealType)}${m.timingLabel ? ` - ${m.timingLabel}` : ''}`}</Text>
              <Text style={{ color: colors.text, fontSize: 16 }}>{m.recipeName}</Text>
              <Text style={{ color: colors.text, fontSize: 14 }}>{`${m.calories} kcal | Protein ${m.protein} g | Carbs ${m.carbs} g | Fat ${m.fat} g`}</Text>
              {m.portionSize || typeof m.portionGrams === 'number' ? <Text style={{ color: colors.muted, fontSize: 13 }}>{`Portion: ${m.portionSize ?? `${m.portionGrams} g`}`}</Text> : null}
              {m.instructions ? <Text style={{ color: colors.muted, fontSize: 13 }}>{m.instructions}</Text> : null}
              {m.customizationNote ? <Text style={{ color: colors.muted, fontSize: 13 }}>{m.customizationNote}</Text> : null}
            </View>
          ))}
        </>
      ) : null}
    </Card>
  );
}

function PlanActions({ plan }: { plan: DietPlan }) {
  const writes = useDietWrites();
  const [panel, setPanel] = useState<'none' | 'approve' | 'revise'>('none');
  const [notes, setNotes] = useState('');
  const [notesError, setNotesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  async function run(action: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setError(null);
    try {
      await action();
      setPanel('none');
      setNotes('');
    } catch (e) {
      setError(wellnessMessage(e));
    } finally {
      lock.current = false;
    }
  }

  return (
    <Card>
      <Heading>Your decision</Heading>
      {error ? <Notice>{error}</Notice> : null}
      {panel === 'none' ? (
        <>
          <Button label="Approve this plan" onPress={() => setPanel('approve')} />
          <Button label="Request changes" variant="secondary" onPress={() => setPanel('revise')} />
        </>
      ) : null}
      {panel === 'approve' ? (
        <>
          <Body muted>Approve this plan as it is?</Body>
          <Button label="Yes, approve" busy={writes.approve.isPending} onPress={() => void run(() => writes.approve.mutateAsync({ planId: plan.id }))} />
          <Button label="Not yet" variant="secondary" disabled={writes.approve.isPending} onPress={() => setPanel('none')} />
        </>
      ) : null}
      {panel === 'revise' ? (
        <>
          <TextField label="What should change?" value={notes} onChangeText={setNotes} error={notesError} multiline />
          <Button
            label="Send change request"
            busy={writes.revise.isPending}
            onPress={() => {
              if (notes.trim().length < 3) {
                setNotesError('Please describe the change (at least 3 characters).');
                return;
              }
              setNotesError(null);
              void run(() => writes.revise.mutateAsync({ planId: plan.id, notes: notes.trim() }));
            }}
          />
          <Button label="Cancel" variant="secondary" disabled={writes.revise.isPending} onPress={() => setPanel('none')} />
        </>
      ) : null}
    </Card>
  );
}

export function DietPlanDetailScreen({ route }: DetailProps) {
  const plans = useDietPlans();
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});
  if (plans.isPending) return <Loading label="Loading plan" />;
  if (plans.isError && !plans.data) return <ErrorState message={wellnessMessage(plans.error)} onRetry={() => void plans.refetch()} />;
  const plan = (plans.data ?? []).find((p) => p.id === route.params.planId);
  if (!plan) return <EmptyState title="This plan is no longer available" body="Go back and refresh your plans." />;
  const st = planStatus(plan.status);
  const days = [...plan.days].sort((a, b) => a.dayNumber - b.dayNumber);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {plans.isError ? <StaleBanner onRetry={() => void plans.refetch()} /> : null}
      <Page>
        <Card>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>{plan.name}</Text>
          <Pill label={st.label} tone={st.tone} />
          <Field label="Version" value={String(plan.versionNumber)} />
          <Field label="Published" value={dateText(plan.createdAt)} />
        </Card>
        <Card>
          <Heading>Daily targets</Heading>
          <Field label="Calories" value={amount(plan.targetCalories, 'kcal')} />
          <Field label="Protein" value={amount(plan.proteinGrams, 'g')} />
          <Field label="Carbs" value={amount(plan.carbsGrams, 'g')} />
          <Field label="Fat" value={amount(plan.fatGrams, 'g')} />
          <Field label="Fibre" value={amount(plan.fiberGrams, 'g')} />
        </Card>
        {plan.customerVisibleNotes ? (
          <Card>
            <Heading>Notes from your nutritionist</Heading>
            <Body>{plan.customerVisibleNotes}</Body>
          </Card>
        ) : null}
        {plan.customerFeedback ? <Field label="Your feedback" value={plan.customerFeedback} /> : null}
        <Card>
          <Heading>Version history</Heading>
          <Body>{`This is version ${plan.versionNumber} of your plan.`}</Body>
          <Body muted>{plan.parentPlanId ? 'It was revised from an earlier version. Earlier versions are not shown in the app.' : 'There is no earlier version.'}</Body>
        </Card>
        {plan.status === 'SUBMITTED' ? <PlanActions plan={plan} /> : null}
        <Heading>Meals</Heading>
        {days.length === 0 ? <EmptyState title="No days listed in this plan" /> : null}
        {days.map((d, i) => (
          <DayCard key={d.id} day={d} open={openDays[d.id] ?? i === 0} onToggle={() => setOpenDays((o) => ({ ...o, [d.id]: !(o[d.id] ?? i === 0) }))} />
        ))}
      </Page>
    </View>
  );
}
