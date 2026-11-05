import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getWellnessEntries } from '../../wellness/entries';
import { colors } from '../../ui/components';
import { Page } from './wellnessUi';

/** Wellness landing. Entries come from the registry in src/wellness/entries.ts (Health profile, Diet plan, plus any registered ones). */
export function WellnessHome() {
  const navigation = useNavigation<{ navigate: (name: string) => void }>();
  return (
    <Page>
      {getWellnessEntries().map((e) => (
        <Pressable key={e.key} accessibilityRole="button" accessibilityLabel={e.title} onPress={() => navigation.navigate(e.routeName)} style={styles.entry}>
          <Text style={styles.title}>{e.title}</Text>
          <Text style={styles.desc}>{e.description}</Text>
        </Pressable>
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  entry: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 4, minHeight: 64 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  desc: { color: colors.muted, fontSize: 14 }
});
