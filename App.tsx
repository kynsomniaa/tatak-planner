import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { colors, ThemeProvider } from './src/theme';
import { AppSession, StudentWorkspace } from './src/types';
import { restoreSession, signOut } from './src/services/session';
import { clearWorkspace, loadWorkspace, saveWorkspace } from './src/services/repository';
import { AuthScreen } from './src/components/AuthScreen';
import { ImportScreen } from './src/components/ImportScreen';
import { MainShell } from './src/components/MainShell';
import { markTutorialPending } from './src/domain/tutorial';

export default function App() {
  const [session, setSession] = useState<AppSession | null>(null);
  const [workspace, setWorkspace] = useState<StudentWorkspace | null>(null);
  const [ready, setReady] = useState(false);
  const [launchTutorial, setLaunchTutorial] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const restored = await restoreSession();
        setSession(restored);
        if (restored) setWorkspace(await loadWorkspace(restored));
      } catch (error) {
        Alert.alert('Could not restore account', String((error as Error).message));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!ready || !session || !workspace) return;
    const timer = setTimeout(() => {
      void saveWorkspace(session, workspace).catch((error) =>
        Alert.alert('Could not save plan', String((error as Error).message)),
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [ready, session, workspace]);

  const handleAuthenticated = async (nextSession: AppSession) => {
    setSession(nextSession);
    try {
      setWorkspace(await loadWorkspace(nextSession));
    } catch (error) {
      Alert.alert('Cloud sync unavailable', String((error as Error).message));
      setWorkspace(null);
    }
  };

  if (!ready) {
    return (
      <View style={styles.loading}>
        <Text style={styles.logoText}>TAM // CORE</Text>
        <ActivityIndicator color={colors.green800} />
        <Text style={styles.loadingText}>Opening your degree plan…</Text>
      </View>
    );
  }

  return (
    <ThemeProvider palette={workspace?.preferences?.theme ?? 'feu-green'}>
      <GestureHandlerRootView style={styles.root}>
        <StatusBar style={session && workspace?.curriculum ? 'light' : 'auto'} />
        {!session ? (
          <AuthScreen onAuthenticated={handleAuthenticated} />
        ) : !workspace?.curriculum ? (
          <ImportScreen
            onImported={(nextWorkspace) => {
              setWorkspace(nextWorkspace);
              setLaunchTutorial(true);
              void markTutorialPending(session.id);
            }}
            onBackToLogin={() => {
              void signOut().finally(() => {
                setSession(null);
                setWorkspace(null);
                setLaunchTutorial(false);
              });
            }}
          />
        ) : (
          <MainShell
            session={session}
            workspace={workspace}
            onChange={setWorkspace}
            launchTutorial={launchTutorial}
            onReplaceCurriculum={() => {
              void clearWorkspace(session).finally(() => setWorkspace(null));
            }}
            onSignOut={() => {
              void signOut().finally(() => {
                setSession(null);
                setWorkspace(null);
                setLaunchTutorial(false);
              });
            }}
          />
        )}
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  logoText: { marginBottom: 20, color: colors.green900, fontSize: 19, fontWeight: '900', letterSpacing: 1.5 },
  loadingText: { marginTop: 12, color: colors.muted, fontSize: 12 },
});
