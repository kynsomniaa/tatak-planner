import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSession, CourseRating, CourseRatingSummary } from '../types';
import { cloudConfigured, supabase } from './supabase';

const LOCAL_RATINGS_KEY = 'cpe-pathfinder.local-ratings.v1';

const readLocalRatings = async (): Promise<CourseRating[]> => {
  const stored = await AsyncStorage.getItem(LOCAL_RATINGS_KEY);
  return stored ? (JSON.parse(stored) as CourseRating[]) : [];
};

const mapRemoteRating = (row: Record<string, unknown>): CourseRating => ({
  id: String(row.id),
  userId: String(row.user_id),
  username: String(row.username),
  program: 'BS Computer Engineering',
  courseCode: String(row.course_code),
  difficulty: Number(row.difficulty),
  workload: Number(row.workload),
  usefulness: Number(row.usefulness),
  comment: String(row.comment ?? ''),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  reportCount: Number(row.report_count ?? 0),
  hidden: Boolean(row.hidden),
});

export async function loadRatings(session?: AppSession): Promise<CourseRating[]> {
  if (cloudConfigured && supabase) {
    const { data, error } = await supabase
      .from('ratings')
      .select('*')
      .eq('program', 'BS Computer Engineering')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => mapRemoteRating(row as Record<string, unknown>))
      .filter((rating) => !rating.hidden || session?.role === 'admin' || rating.userId === session?.id);
  }
  const ratings = await readLocalRatings();
  return ratings.filter((rating) => !rating.hidden || session?.role === 'admin');
}

export async function saveRating(
  session: AppSession,
  input: Pick<CourseRating, 'courseCode' | 'difficulty' | 'workload' | 'usefulness' | 'comment'>,
): Promise<void> {
  if (![input.difficulty, input.workload, input.usefulness].every((value) => value >= 1 && value <= 5)) {
    throw new Error('Every rating must be between 1 and 5.');
  }
  if (input.comment.length > 300) throw new Error('Comments are limited to 300 characters.');
  const now = new Date().toISOString();
  if (cloudConfigured && supabase) {
    const { error } = await supabase.from('ratings').upsert({
      user_id: session.id,
      username: session.username,
      program: 'BS Computer Engineering',
      course_code: input.courseCode,
      difficulty: input.difficulty,
      workload: input.workload,
      usefulness: input.usefulness,
      comment: input.comment.trim(),
      updated_at: now,
    }, { onConflict: 'user_id,program,course_code' });
    if (error) throw error;
    return;
  }
  const ratings = await readLocalRatings();
  const existing = ratings.findIndex(
    (rating) => rating.userId === session.id && rating.courseCode === input.courseCode,
  );
  const rating: CourseRating = {
    id: existing >= 0 ? ratings[existing].id : `local-rating-${Date.now()}`,
    userId: session.id,
    username: session.username,
    program: 'BS Computer Engineering',
    ...input,
    comment: input.comment.trim(),
    createdAt: existing >= 0 ? ratings[existing].createdAt : now,
    updatedAt: now,
    reportCount: existing >= 0 ? ratings[existing].reportCount : 0,
    hidden: false,
  };
  if (existing >= 0) ratings[existing] = rating;
  else ratings.push(rating);
  await AsyncStorage.setItem(LOCAL_RATINGS_KEY, JSON.stringify(ratings));
}

export async function deleteRating(session: AppSession, ratingId: string): Promise<void> {
  if (cloudConfigured && supabase) {
    const { error } = await supabase.from('ratings').delete().eq('id', ratingId).eq('user_id', session.id);
    if (error) throw error;
    return;
  }
  const ratings = await readLocalRatings();
  await AsyncStorage.setItem(
    LOCAL_RATINGS_KEY,
    JSON.stringify(ratings.filter((rating) => !(rating.id === ratingId && rating.userId === session.id))),
  );
}

export async function reportRating(session: AppSession, ratingId: string): Promise<void> {
  if (cloudConfigured && supabase) {
    const { error } = await supabase.rpc('report_rating', { target_rating_id: ratingId });
    if (error) throw error;
    return;
  }
  const ratings = await readLocalRatings();
  const next = ratings.map((rating) => rating.id === ratingId
    ? { ...rating, reportCount: (rating.reportCount ?? 0) + 1 }
    : rating);
  await AsyncStorage.setItem(LOCAL_RATINGS_KEY, JSON.stringify(next));
}

export async function moderateRating(
  session: AppSession,
  ratingId: string,
  hidden: boolean,
): Promise<void> {
  if (session.role !== 'admin') throw new Error('Only an administrator can moderate ratings.');
  if (cloudConfigured && supabase) {
    const { error } = await supabase.rpc('moderate_rating', { target_rating_id: ratingId, should_hide: hidden });
    if (error) throw error;
    return;
  }
  const ratings = await readLocalRatings();
  await AsyncStorage.setItem(
    LOCAL_RATINGS_KEY,
    JSON.stringify(ratings.map((rating) => rating.id === ratingId ? { ...rating, hidden } : rating)),
  );
}

export function ratingSummary(courseCode: string, ratings: CourseRating[]): CourseRatingSummary {
  const relevant = ratings.filter((rating) => rating.courseCode === courseCode && !rating.hidden);
  const average = (key: 'difficulty' | 'workload' | 'usefulness') => relevant.length > 0
    ? relevant.reduce((total, rating) => total + rating[key], 0) / relevant.length
    : null;
  return {
    courseCode,
    difficulty: average('difficulty'),
    workload: average('workload'),
    usefulness: average('usefulness'),
    count: relevant.length,
  };
}
