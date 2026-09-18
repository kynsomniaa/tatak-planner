import React, { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, contrastText, useAppTheme } from '../theme';
import { Curriculum, StudentWorkspace } from '../types';
import { curriculumForProgram, supportedPrograms } from '../data/supportedPrograms';
import { AcademicSetupScreen } from './AcademicSetupScreen';

/** Kept under the historical filename so saved navigation imports stay stable. */
export function ImportScreen({ onImported, onBackToLogin }: { onImported: (workspace: StudentWorkspace) => void; onBackToLogin: () => void }) {
  const theme = useAppTheme();
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);

  if (curriculum) {
    return <AcademicSetupScreen curriculum={curriculum} onBack={() => setCurriculum(null)} onComplete={onImported} />;
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.canvas }]}>
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable onPress={onBackToLogin} style={styles.backButton}><Text style={[styles.backText, { color: theme.green700 }]}>← Back to login</Text></Pressable>
        <View style={[styles.step, { backgroundColor: theme.green100 }]}><Text style={[styles.stepText, { color: contrastText(theme.green100, '#FFFFFF', theme.green900) }]}>ACADEMIC SETUP · 1</Text></View>
        <Text style={[styles.eyebrow, { color: theme.green700 }]}>SELECT YOUR PROGRAM</Text>
        <Text style={[styles.title, { color: theme.ink }]}>Choose your degree route</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>Supported curricula are maintained inside TAM // CORE, so you no longer need to save or upload a SOLAR HTML page.</Text>

        <View style={styles.programGrid}>
          {supportedPrograms.map((program) => (
            <Pressable
              key={program.id}
              accessibilityRole="button"
              accessibilityLabel={`Select ${program.code}, ${program.name}`}
              onPress={() => {
                const selected = curriculumForProgram(program.id);
                if (selected) setCurriculum(selected);
              }}
              style={({ pressed }) => [styles.programCard, { backgroundColor: theme.surface, borderColor: theme.green700, shadowColor: theme.green900 }, pressed && styles.pressed]}
            >
              <View style={[styles.programBadge, { backgroundColor: theme.green900 }]}><Text style={[styles.programBadgeText, { color: theme.gold }]}>{program.code}</Text></View>
              <Text style={[styles.programName, { color: theme.ink }]}>{program.name}</Text>
              <Text style={[styles.school, { color: theme.muted }]}>{program.school}</Text>
              <View style={styles.programFooter}><Text style={[styles.programMeta, { color: theme.green700 }]}>{program.curriculum.courses.length} courses · {program.curriculum.terms.length} trimesters</Text><Text style={[styles.arrow, { color: theme.green700 }]}>→</Text></View>
            </Pressable>
          ))}
        </View>

        <View style={[styles.notice, { backgroundColor: theme.green100, borderColor: theme.border }]}>
          <Text style={[styles.noticeTitle, { color: theme.green800 }]}>More FEU Tech programs can be added</Text>
          <Text style={[styles.noticeText, { color: theme.muted }]}>The selector is backed by a reusable internal program catalog. BSCpE is the supported program in this version.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 26, paddingBottom: 54 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8 },
  backText: { fontSize: 12, fontWeight: '900' },
  step: { alignSelf: 'flex-start', marginTop: 8, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  stepText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  eyebrow: { marginTop: 28, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title: { marginTop: 7, fontSize: 33, lineHeight: 39, fontWeight: '900' },
  subtitle: { marginTop: 10, maxWidth: 680, fontSize: 14, lineHeight: 22 },
  programGrid: { marginTop: 26, gap: 12 },
  programCard: { minHeight: 190, padding: 22, borderRadius: 22, borderWidth: 2, shadowOpacity: 0.12, shadowRadius: 16, elevation: 5 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  programBadge: { alignSelf: 'flex-start', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10 },
  programBadgeText: { fontSize: 15, fontWeight: '900', letterSpacing: 0.8 },
  programName: { marginTop: 18, maxWidth: 560, fontSize: 22, lineHeight: 28, fontWeight: '900' },
  school: { marginTop: 5, fontSize: 12, fontWeight: '700' },
  programFooter: { marginTop: 'auto', paddingTop: 18, flexDirection: 'row', alignItems: 'center' },
  programMeta: { flex: 1, fontSize: 10, fontWeight: '900' },
  arrow: { fontSize: 24, fontWeight: '900' },
  notice: { marginTop: 18, padding: 15, borderRadius: 15, borderWidth: 1 },
  noticeTitle: { fontSize: 12, fontWeight: '900' },
  noticeText: { marginTop: 5, fontSize: 11, lineHeight: 17 },
});
