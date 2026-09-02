import React, { useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
import { colors } from '../theme';
import { Curriculum, StudentWorkspace } from '../types';
import { parseFeuCurriculumHtml } from '../parser/feuCurriculumParser';
import { PrimaryButton } from './ui';
import { AcademicSetupScreen } from './AcademicSetupScreen';

export function ImportScreen({ onImported, onBackToLogin }: { onImported: (workspace: StudentWorkspace) => void; onBackToLogin: () => void }) {
  const [preview, setPreview] = useState<Curriculum | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [settingUp, setSettingUp] = useState(false);

  const chooseFile = async () => {
    setLoading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/html', 'application/xhtml+xml', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!/\.html?$/i.test(asset.name)) throw new Error('Choose an .html file exported from SOLAR.');
      const html = asset.file ? await asset.file.text() : await new ExpoFile(asset.uri).text();
      const parsed = parseFeuCurriculumHtml(html, asset.name);
      setPreview(parsed.curriculum);
      setWarnings(parsed.warnings);
      setSettingUp(false);
    } catch (error) {
      Alert.alert('Import failed', String((error as Error).message));
    } finally {
      setLoading(false);
    }
  };

  if (preview && settingUp) {
    return (
      <AcademicSetupScreen
        curriculum={preview}
        onBack={() => setSettingUp(false)}
        onComplete={onImported}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable onPress={onBackToLogin} style={styles.backButton}><Text style={styles.backText}>← Back to login</Text></Pressable>
        <View style={styles.step}><Text style={styles.stepText}>1 OF 2</Text></View>
        <Text style={styles.title}>Import your official curriculum</Text>
        <Text style={styles.subtitle}>
          In SOLAR, open Program Curriculum and save the page as an HTML file. CpE Pathfinder reads the table only—it never runs scripts from the file.
        </Text>

        <View style={styles.uploadCard}>
          <Text style={styles.uploadIcon}>⇧</Text>
          <Text style={styles.uploadTitle}>Program Curriculum.html</Text>
          <Text style={styles.uploadBody}>FEU Tech BS Computer Engineering only for version 1</Text>
          <PrimaryButton
            label={preview ? 'Choose a different file' : 'Choose HTML file'}
            loading={loading}
            onPress={chooseFile}
            tone={preview ? 'light' : 'green'}
            style={styles.chooseButton}
          />
        </View>

        {preview && (
          <View style={styles.resultCard}>
            <Text style={styles.valid}>✓ VALID FEU TECH EXPORT</Text>
            <Text style={styles.program}>{preview.program}</Text>
            <View style={styles.metrics}>
              <Metric value={preview.courses.length} label="Courses" />
              <Metric value={preview.terms.length} label="Trimesters" />
              <Metric
                value={preview.courses.reduce((total, course) => total + course.units, 0)}
                label="Total units"
              />
            </View>
            {warnings.map((warning) => (
              <Text key={warning} style={styles.warning}>⚠ {warning}</Text>
            ))}
            <PrimaryButton
              label="Continue to academic setup"
              onPress={() => setSettingUp(true)}
              style={styles.createButton}
            />
          </View>
        )}
        <Text style={styles.privacy}>
          The importer requires the SOLAR URL marker, curriculum table headers, and a CpE course set. Other HTML files are rejected.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { padding: 24, paddingBottom: 48 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 7 },
  backText: { color: colors.green700, fontSize: 12, fontWeight: '900' },
  step: { alignSelf: 'flex-start', borderRadius: 10, backgroundColor: colors.green100, paddingHorizontal: 10, paddingVertical: 6 },
  stepText: { color: colors.green800, fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  title: { marginTop: 18, color: colors.ink, fontSize: 31, lineHeight: 36, fontWeight: '900' },
  subtitle: { marginTop: 10, color: colors.muted, fontSize: 15, lineHeight: 23 },
  uploadCard: {
    marginTop: 26,
    padding: 25,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: '#B9CDC1',
    borderStyle: 'dashed',
    borderRadius: 22,
    alignItems: 'center',
  },
  uploadIcon: { fontSize: 35, color: colors.green700, fontWeight: '700' },
  uploadTitle: { marginTop: 9, fontSize: 17, fontWeight: '900', color: colors.ink },
  uploadBody: { marginTop: 5, textAlign: 'center', color: colors.muted, lineHeight: 20 },
  chooseButton: { marginTop: 18, alignSelf: 'stretch' },
  resultCard: { marginTop: 18, padding: 20, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  valid: { color: colors.green700, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  program: { marginTop: 6, fontSize: 20, fontWeight: '900', color: colors.ink },
  metrics: { marginTop: 16, flexDirection: 'row', gap: 8 },
  metric: { flex: 1, padding: 11, backgroundColor: colors.canvas, borderRadius: 12 },
  metricValue: { color: colors.green900, fontSize: 20, fontWeight: '900' },
  metricLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  warning: { color: colors.warning, marginTop: 12, lineHeight: 18, fontSize: 12 },
  createButton: { marginTop: 18 },
  privacy: { marginTop: 18, color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
