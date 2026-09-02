import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSession, StudentWorkspace } from '../types';
import { cloudConfigured, supabase } from './supabase';
import { normalizeWorkspaceRules } from '../domain/curriculumRules';
import { migratePlannerWorkspace } from '../domain/workspaceMigration';

const localKey = (userId: string) => `cpe-pathfinder.workspace.v2.${userId}`;

export async function loadWorkspace(session: AppSession): Promise<StudentWorkspace | null> {
  if (cloudConfigured && supabase) {
    const { data, error } = await supabase
      .from('workspaces')
      .select('payload')
      .eq('user_id', session.id)
      .maybeSingle();
    if (error) throw error;
    return data?.payload ? migratePlannerWorkspace(normalizeWorkspaceRules(data.payload as StudentWorkspace)) : null;
  }
  const stored = await AsyncStorage.getItem(localKey(session.id));
  return stored ? migratePlannerWorkspace(normalizeWorkspaceRules(JSON.parse(stored) as StudentWorkspace)) : null;
}

export async function saveWorkspace(
  session: AppSession,
  workspace: StudentWorkspace,
): Promise<void> {
  if (cloudConfigured && supabase) {
    const { error } = await supabase.from('workspaces').upsert({
      user_id: session.id,
      payload: workspace,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return;
  }
  await AsyncStorage.setItem(localKey(session.id), JSON.stringify(workspace));
}

export async function clearWorkspace(session: AppSession): Promise<void> {
  if (cloudConfigured && supabase) {
    const { error } = await supabase.from('workspaces').delete().eq('user_id', session.id);
    if (error) throw error;
    return;
  }
  await AsyncStorage.removeItem(localKey(session.id));
}
