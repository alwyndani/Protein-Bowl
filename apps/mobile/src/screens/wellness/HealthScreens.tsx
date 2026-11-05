import React, { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WellnessStackParamList } from '../../navigation/WellnessNavigator';
import { Body, Button, colors, Notice, TextField } from '../../ui/components';
import { ErrorState, StaleBanner } from '../../ui/commerceUi';
import { wellnessMessage } from '../../wellness/errors';
import { useHealthProfile, useSaveHealthProfile } from '../../wellness/health/hooks';
import {
  ACTIVITY_OPTIONS,
  buildInput,
  exerciseLabel,
  type ExerciseAnswer,
  formFromProfile,
  GENDER_OPTIONS,
  GOAL_OPTIONS,
  type HealthForm,
  labelFor,
  listText,
  numberOrNotProvided,
  PRIMARY_GOAL_OPTIONS,
  STEPS,
  textOrNotProvided,
  validateForm,
  validateStep,
  type FormErrors
} from '../../wellness/health/form';
import type { HealthProfile } from '../../wellness/health/types';
import { Card, Chip, ChipGroup, Field, Heading, Loading, Page } from './wellnessUi';

type ViewProps = NativeStackScreenProps<WellnessStackParamList, 'HealthProfile'>;
type EditProps = NativeStackScreenProps<WellnessStackParamList, 'HealthProfileEdit'>;

const NOT_AVAILABLE = 'Not available';

function Derived({ p }: { p: HealthProfile }) {
  const macros = p.macroTargets;
  const missing = p.calculation && !p.calculation.available ? p.calculation.missing : [];
  return (
    <Card>
      <Heading>Calculated by Protein Bowl</Heading>
      <Field label="BMI" value={p.bmi !== undefined ? `${p.bmi}${p.bmiCategory ? ` (${p.bmiCategory})` : ''}` : NOT_AVAILABLE} />
      <Field label="Daily calories target" value={p.targetCalories !== undefined ? `${p.targetCalories} kcal` : NOT_AVAILABLE} />
      <Field label="Protein target" value={macros ? `${macros.proteinGrams} g` : NOT_AVAILABLE} />
      <Field label="Carbs target" value={macros ? `${macros.carbsGrams} g` : NOT_AVAILABLE} />
      <Field label="Fat target" value={macros ? `${macros.fatGrams} g` : NOT_AVAILABLE} />
      <Field label="Water" value={p.waterRequirementL !== undefined ? `${p.waterRequirementL} L` : NOT_AVAILABLE} />
      <Field label="Ideal body weight" value={p.idealBodyWeightKg !== undefined ? `${p.idealBodyWeightKg} kg` : NOT_AVAILABLE} />
      {missing.length > 0 ? <Body muted>Calories and macros need: {missing.join(', ')}.</Body> : null}
    </Card>
  );
}

export function HealthProfileScreen({ navigation }: ViewProps) {
  const q = useHealthProfile();
  if (q.isPending) return <Loading label="Loading health profile" />;
  if (q.isError && !q.data) return <ErrorState message={wellnessMessage(q.error)} onRetry={() => void q.refetch()} />;
  const p = q.data!;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {q.isError ? <StaleBanner onRetry={() => void q.refetch()} /> : null}
      <Page>
        <Body muted>Only you and the nutritionist handling your diet request can see your health details.</Body>
        <Card>
          <Heading>Basics</Heading>
          <Field label="Name" value={textOrNotProvided(p.name)} />
          <Field label="Date of birth" value={textOrNotProvided(p.dob)} />
          <Field label="Gender" value={labelFor(GENDER_OPTIONS, p.gender)} />
        </Card>
        <Card>
          <Heading>Body and activity</Heading>
          <Field label="Height" value={numberOrNotProvided(p.heightCm, 'cm')} />
          <Field label="Weight" value={numberOrNotProvided(p.weightKg, 'kg')} />
          <Field label="Target weight" value={numberOrNotProvided(p.targetWeightKg, 'kg')} />
          <Field label="Activity level" value={labelFor(ACTIVITY_OPTIONS, p.activityLevel)} />
          <Field label="Exercise regularly" value={exerciseLabel(p.hasExercise)} />
        </Card>
        <Card>
          <Heading>Goals</Heading>
          <Field label="Main goal" value={labelFor(GOAL_OPTIONS, p.goal)} />
          <Field label="Other goals" value={listText(p.primaryGoals)} />
        </Card>
        <Card>
          <Heading>Food and health</Heading>
          <Field label="Food preference" value={textOrNotProvided(p.foodPreference)} />
          <Field label="Allergies" value={listText(p.allergies)} />
          <Field label="Foods you dislike" value={listText(p.foodDislikes)} />
          <Field label="Medical conditions" value={listText(p.medicalConditions)} />
          <Field label="Current medications" value={textOrNotProvided(p.currentMedications)} />
        </Card>
        <Derived p={p} />
        <Button label="Edit health profile" onPress={() => navigation.navigate('HealthProfileEdit')} />
      </Page>
    </View>
  );
}

function EditForm({ profile, onDone }: { profile: HealthProfile; onDone: () => void }) {
  const save = useSaveHealthProfile();
  const [form, setForm] = useState<HealthForm>(() => formFromProfile(profile));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const lock = useRef(false);
  const set = <K extends keyof HealthForm>(key: K, value: HealthForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  // The server accepts no "unanswered" value: once answered, the question can only change between Yes and No.
  const answeredBefore = profile.hasExercise !== undefined;
  const current = STEPS[step];

  function next() {
    const e = validateStep(current.id, form);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep(step + 1);
  }

  async function submit() {
    if (lock.current) return;
    const e = validateForm(form);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setFormError(e.requiredTogether ?? 'Please fix the highlighted fields.');
      if (e.fullName || e.dob) setStep(0);
      else if (e.heightCm || e.weightKg || e.targetWeightKg || e.requiredTogether) setStep(1);
      return;
    }
    const input = buildInput(form, profile);
    if (Object.keys(input).length === 0) {
      setFormError('There is nothing to save yet.');
      return;
    }
    lock.current = true;
    setFormError(null);
    try {
      await save.mutateAsync(input);
      onDone();
    } catch (err) {
      setFormError(wellnessMessage(err));
    } finally {
      lock.current = false;
    }
  }

  const toggleGoal = (g: string) => set('primaryGoals', form.primaryGoals.includes(g) ? form.primaryGoals.filter((x) => x !== g) : [...form.primaryGoals, g]);

  return (
    <Page>
      <Text accessibilityRole="header" style={{ color: colors.muted, fontSize: 14 }}>{`Step ${step + 1} of ${STEPS.length}: ${current.title}`}</Text>
      {formError ? <Notice>{formError}</Notice> : null}

      {current.id === 'basics' ? (
        <Card>
          <TextField label="Full name" value={form.fullName} onChangeText={(v) => set('fullName', v)} error={errors.fullName} autoCapitalize="words" />
          <TextField label="Date of birth (YYYY-MM-DD)" value={form.dob} onChangeText={(v) => set('dob', v)} error={errors.dob} placeholder="1995-04-23" keyboardType="numbers-and-punctuation" autoCapitalize="none" />
          <ChipGroup label="Gender">
            {GENDER_OPTIONS.map((o) => (
              <Chip key={o.value} label={o.label} selected={form.gender === o.value} onPress={() => set('gender', o.value)} />
            ))}
          </ChipGroup>
        </Card>
      ) : null}

      {current.id === 'body' ? (
        <Card>
          <TextField label="Height (cm)" value={form.heightCm} onChangeText={(v) => set('heightCm', v)} error={errors.heightCm} keyboardType="decimal-pad" />
          <TextField label="Weight (kg)" value={form.weightKg} onChangeText={(v) => set('weightKg', v)} error={errors.weightKg} keyboardType="decimal-pad" />
          <TextField label="Target weight (kg, optional)" value={form.targetWeightKg} onChangeText={(v) => set('targetWeightKg', v)} error={errors.targetWeightKg} keyboardType="decimal-pad" />
          <ChipGroup label="Activity level">
            {ACTIVITY_OPTIONS.map((o) => (
              <Chip key={o.value} label={o.label} selected={form.activityLevel === o.value} onPress={() => set('activityLevel', o.value)} />
            ))}
          </ChipGroup>
          <ChipGroup label="Do you exercise regularly?">
            {(
              [
                ['yes', 'Yes'],
                ['no', 'No'],
                ['unanswered', 'Not answered']
              ] as Array<[ExerciseAnswer, string]>
            ).map(([value, label]) => (
              <Chip key={value} label={label} selected={form.exercise === value} disabled={value === 'unanswered' && answeredBefore} onPress={() => set('exercise', value)} />
            ))}
          </ChipGroup>
          {answeredBefore ? <Body muted>An answer you have given can be changed but not removed.</Body> : null}
        </Card>
      ) : null}

      {current.id === 'goals' ? (
        <Card>
          <ChipGroup label="Main goal">
            {GOAL_OPTIONS.map((o) => (
              <Chip key={o.value} label={o.label} selected={form.goal === o.value} onPress={() => set('goal', o.value)} />
            ))}
          </ChipGroup>
          <ChipGroup label="Other goals (choose any)">
            {PRIMARY_GOAL_OPTIONS.map((g) => (
              <Chip key={g} label={g} selected={form.primaryGoals.includes(g)} onPress={() => toggleGoal(g)} />
            ))}
          </ChipGroup>
        </Card>
      ) : null}

      {current.id === 'food' ? (
        <Card>
          <TextField label="Food preference (for example vegetarian)" value={form.foodPreference} onChangeText={(v) => set('foodPreference', v)} />
          <TextField label="Allergies (separate with commas)" value={form.allergies} onChangeText={(v) => set('allergies', v)} multiline />
          <TextField label="Foods you dislike (separate with commas)" value={form.foodDislikes} onChangeText={(v) => set('foodDislikes', v)} multiline />
          <TextField label="Medical conditions (separate with commas)" value={form.medicalConditions} onChangeText={(v) => set('medicalConditions', v)} multiline />
          <TextField label="Current medications" value={form.currentMedications} onChangeText={(v) => set('currentMedications', v)} multiline />
        </Card>
      ) : null}

      <View style={{ gap: 10 }}>
        {step < STEPS.length - 1 ? <Button label="Next" onPress={next} /> : <Button label="Save health profile" busy={save.isPending} onPress={() => void submit()} />}
        {step > 0 ? <Button label="Back" variant="secondary" disabled={save.isPending} onPress={() => setStep(step - 1)} /> : null}
      </View>
    </Page>
  );
}

export function HealthProfileEditScreen({ navigation }: EditProps) {
  const q = useHealthProfile();
  if (q.isPending) return <Loading label="Loading health profile" />;
  if (q.isError && !q.data) return <ErrorState message={wellnessMessage(q.error)} onRetry={() => void q.refetch()} />;
  return <EditForm profile={q.data!} onDone={() => navigation.goBack()} />;
}
