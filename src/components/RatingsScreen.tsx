import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { colors, contrastText, useAppTheme } from '../theme';
import { AppSession, Course, CourseRating, StudentWorkspace } from '../types';
import { visibleCurriculumCourses } from '../domain/academicSetup';
import { CourseFilter, courseDepartment, courseFilters } from '../domain/coursePresentation';
import { cloudConfigured } from '../services/supabase';
import { deleteRating, loadRatings, moderateRating, ratingSummary, reportRating, saveRating } from '../services/ratings';
import { StarRating } from './StarRating';
import { PrimaryButton } from './ui';

export function RatingsScreen({ session, workspace }: { session: AppSession; workspace: StudentWorkspace }) {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const curriculum = workspace.curriculum;
  const [ratings, setRatings] = useState<CourseRating[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [department, setDepartment] = useState<CourseFilter>('ALL');
  const [query, setQuery] = useState('');
  const [showInfo, setShowInfo] = useState(true);
  const [difficulty, setDifficulty] = useState(3);
  const [workload, setWorkload] = useState(3);
  const [usefulness, setUsefulness] = useState(3);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [mobileFormOpen, setMobileFormOpen] = useState(false);

  const refresh = async () => {
    try { setRatings(await loadRatings(session)); }
    catch (error) { Alert.alert('Could not load ratings', String((error as Error).message)); }
  };
  useEffect(() => { void refresh(); }, [session.id]);
  if (!curriculum) return null;

  const allCourses = visibleCurriculumCourses(curriculum);
  const courses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return allCourses.filter((course) => (department === 'ALL' || courseDepartment(course.code) === department) && (!normalized || course.code.toLowerCase().includes(normalized) || course.title.toLowerCase().includes(normalized)));
  }, [curriculum, query, department]);
  const selectedRatings = selectedCourse ? ratings.filter((rating) => rating.courseCode === selectedCourse.code) : [];
  const visibleRatings = selectedRatings.filter((rating) => !rating.hidden);
  const summary = selectedCourse ? ratingSummary(selectedCourse.code, ratings) : null;
  const ownRating = selectedRatings.find((rating) => rating.userId === session.id);
  const eligible = selectedCourse ? (
    workspace.statuses[selectedCourse.code] === 'passed' ||
    workspace.statuses[selectedCourse.code] === 'retake' ||
    (workspace.retakeAttempts ?? []).some((attempt) => attempt.courseCode === selectedCourse.code && (attempt.status === 'passed' || attempt.status === 'retake'))
  ) : false;

  const chooseCourse = (course: Course) => {
    const existing = ratings.find((rating) => rating.userId === session.id && rating.courseCode === course.code);
    setSelectedCourse(course);
    setDifficulty(existing?.difficulty ?? 3);
    setWorkload(existing?.workload ?? 3);
    setUsefulness(existing?.usefulness ?? 3);
    setComment(existing?.comment ?? '');
  };
  const submit = async () => {
    if (!selectedCourse || !eligible) return;
    setSaving(true);
    try {
      await saveRating(session, { courseCode: selectedCourse.code, difficulty, workload, usefulness, comment });
      await refresh();
      setMobileFormOpen(false);
      Alert.alert('Rating saved', cloudConfigured ? 'Your anonymous-username rating is now shared.' : 'Saved in local preview mode. Connect Supabase to share it.');
    } catch (error) { Alert.alert('Could not save rating', String((error as Error).message)); }
    finally { setSaving(false); }
  };

  const comments = (
    <CommentsList ratings={visibleRatings} session={session} onRefresh={refresh} />
  );
  const form = (
    <RatingForm
      eligible={eligible}
      ownRating={ownRating}
      difficulty={difficulty}
      workload={workload}
      usefulness={usefulness}
      comment={comment}
      saving={saving}
      onDifficulty={setDifficulty}
      onWorkload={setWorkload}
      onUsefulness={setUsefulness}
      onComment={setComment}
      onSubmit={submit}
      onDelete={ownRating ? () => Alert.alert('Delete rating?', 'This removes your rating and short comment.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void deleteRating(session, ownRating.id).then(refresh) },
      ]) : undefined}
    />
  );

  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: theme.canvas }]}> 
      <View nativeID="tour-ratings-overview">
        <Text style={[styles.eyebrow, { color: theme.green700 }]}>03 // SCOUT AHEAD</Text>
        <Text style={[styles.title, { color: theme.ink }]}>Ratings</Text>
      </View>

      {!cloudConfigured && <View style={[styles.previewBanner, { backgroundColor: theme.warningSoft, borderColor: theme.warning }]}><Text style={[styles.previewTitle, { color: theme.warning }]}>Local preview mode</Text><Text style={[styles.previewText, { color: theme.ink }]}>Ratings become shared after Supabase is connected.</Text></View>}
      {showInfo && (
        <View style={[styles.infoBubble, { backgroundColor: theme.surface, borderColor: theme.green700 }]}>
          <Pressable accessibilityLabel="Close How to rate" onPress={() => setShowInfo(false)} style={[styles.infoClose, { backgroundColor: theme.canvas }]}><Text style={[styles.infoCloseText, { color: theme.ink }]}>×</Text></Pressable>
          <Text style={[styles.infoTitle, { color: theme.ink }]}>How to rate</Text>
          <Text style={[styles.infoText, { color: theme.ink }]}><Text style={[styles.infoStrong, { color: theme.green700 }]}>Difficulty:</Text> overall difficulty of the course.</Text>
          <Text style={[styles.infoText, { color: theme.ink }]}><Text style={[styles.infoStrong, { color: theme.green700 }]}>Workload:</Text> how demanding or time-consuming it is.</Text>
          <Text style={[styles.infoText, { color: theme.ink }]}><Text style={[styles.infoStrong, { color: theme.green700 }]}>Usefulness:</Text> how valuable or relevant the subject felt.</Text>
        </View>
      )}
      <View nativeID="tour-rating-intel" style={[styles.intelPrompt, { backgroundColor: theme.green100, borderColor: theme.border }]}>
        <View style={styles.intelStars}><Text style={[styles.intelStar, { color: theme.green700 }]}>★</Text><Text style={[styles.intelStar, { color: theme.green700 }]}>★</Text><Text style={[styles.intelStar, { color: theme.green700 }]}>★</Text></View>
        <View style={styles.intelCopy}><Text style={[styles.intelTitle, { color: theme.ink }]}>Finished a course? ★ Leave a rating.</Text><Text style={[styles.intelText, { color: theme.muted }]}>Your experience helps other students scout what lies ahead. Ratings are subjective planning signals; curriculum and prerequisite rules always take priority.</Text></View>
      </View>

      <View style={[styles.departmentTabs, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
        {courseFilters.map((item) => {
          const count = item === 'ALL' ? allCourses.length : allCourses.filter((course) => courseDepartment(course.code) === item).length;
          return <Pressable key={item} onPress={() => { setDepartment(item); setSelectedCourse(null); }} style={[styles.departmentTab, department === item && { backgroundColor: theme.green900 }]}><Text style={[styles.departmentText, { color: department === item ? contrastText(theme.green900) : theme.muted }]}>{item === 'ALL' ? 'All' : item}<Text style={styles.departmentCount}> · {count}</Text></Text></Pressable>;
        })}
      </View>
      <TextInput value={query} onChangeText={setQuery} placeholder={department === 'ALL' ? 'Search all courses' : `Search ${department} courses`} placeholderTextColor={theme.muted} style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.ink }]} />
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.courseStrip}>
        {courses.map((course) => {
          const courseSummary = ratingSummary(course.code, ratings);
          const active = selectedCourse?.code === course.code;
          const foreground = active ? contrastText(theme.green900) : theme.muted;
          return <Pressable key={course.code} onPress={() => chooseCourse(course)} style={[styles.courseChoice, { backgroundColor: active ? theme.green900 : theme.surface, borderColor: active ? theme.green900 : theme.border }]}><Text style={[styles.courseCode, { color: active ? theme.gold : theme.green700 }]}>{course.code}</Text><Text numberOfLines={2} style={[styles.courseTitle, { color: active ? contrastText(theme.green900) : theme.ink }]}>{course.title}</Text>{courseSummary.count > 0 && courseSummary.difficulty !== null ? <View style={styles.courseRating}><StarRating value={courseSummary.difficulty} size="xs" label="Difficulty" valueColor={foreground} /><Text style={[styles.courseRatingCount, { color: foreground }]}>{courseSummary.count} rating{courseSummary.count === 1 ? '' : 's'}</Text></View> : <Text style={[styles.courseRatingEmpty, { color: foreground }]}>Not yet rated</Text>}</Pressable>;
        })}
      </ScrollView>

      {selectedCourse ? (
        <View style={[styles.detailCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
          <Text style={[styles.selectedCode, { color: theme.green700 }]}>{selectedCourse.code}</Text>
          <Text style={[styles.selectedTitle, { color: theme.ink }]}>{selectedCourse.title}</Text>
          <View style={styles.summaryRow}><Summary label="Difficulty" value={summary?.difficulty} /><Summary label="Workload" value={summary?.workload} /><Summary label="Usefulness" value={summary?.usefulness} /></View>
          {desktop ? (
            <View style={styles.desktopColumns}>
              <View style={[styles.commentsColumn, { borderRightColor: theme.border }]}>{comments}</View>
              <View style={styles.formColumn}>{form}</View>
            </View>
          ) : (
            <View style={styles.mobileDetail}>
              {comments}
              {eligible ? <PrimaryButton label={ownRating ? 'Edit my rating' : 'Write a rating'} onPress={() => setMobileFormOpen(true)} style={styles.mobileRateButton} /> : <Text style={[styles.ineligible, { color: theme.warning, backgroundColor: theme.warningSoft }]}>Mark this course Passed or Retake in Progress before rating it.</Text>}
            </View>
          )}
        </View>
      ) : <View style={[styles.emptyState, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.emptyTitle, { color: theme.ink }]}>Choose a {department === 'ALL' ? '' : `${department} `}course</Text><Text style={[styles.emptyText, { color: theme.muted }]}>Its community comments and rating form will appear here.</Text></View>}

      {!desktop && (
        <Modal animationType="slide" transparent visible={mobileFormOpen} onRequestClose={() => setMobileFormOpen(false)}>
          <View style={styles.scrim}><View style={[styles.sheet, { backgroundColor: theme.canvas }]}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><Text style={[styles.sheetTitle, { color: theme.ink }]}>{ownRating ? 'Edit your rating' : 'Write a rating'}</Text><Pressable onPress={() => setMobileFormOpen(false)} style={[styles.closeButton, { backgroundColor: theme.surface }]}><Text style={[styles.closeText, { color: theme.ink }]}>×</Text></Pressable></View><ScrollView contentContainerStyle={styles.sheetContent}>{form}</ScrollView></View></View>
        </Modal>
      )}
    </ScrollView>
  );
}

function RatingForm({ eligible, ownRating, difficulty, workload, usefulness, comment, saving, onDifficulty, onWorkload, onUsefulness, onComment, onSubmit, onDelete }: {
  eligible: boolean;
  ownRating?: CourseRating;
  difficulty: number;
  workload: number;
  usefulness: number;
  comment: string;
  saving: boolean;
  onDifficulty: (value: number) => void;
  onWorkload: (value: number) => void;
  onUsefulness: (value: number) => void;
  onComment: (value: string) => void;
  onSubmit: () => void;
  onDelete?: () => void;
}) {
  const theme = useAppTheme();
  if (!eligible) return <Text style={[styles.ineligible, { color: theme.warning, backgroundColor: theme.warningSoft }]}>Mark this course Passed or Retake in Progress before rating it.</Text>;
  return (
    <View style={styles.form}>
      <Text style={[styles.panelTitle, { color: theme.ink }]}>{ownRating ? 'Edit your rating' : 'Your rating'}</Text>
      <Text style={[styles.panelHelp, { color: theme.muted }]}>One rating and one short comment per account.</Text>
      <ScorePicker label="Difficulty" value={difficulty} onChange={onDifficulty} />
      <ScorePicker label="Workload" value={workload} onChange={onWorkload} />
      <ScorePicker label="Usefulness" value={usefulness} onChange={onUsefulness} />
      <Text style={[styles.commentLabel, { color: theme.muted }]}>SHORT COMMENT · {comment.length}/300</Text>
      <TextInput value={comment} onChangeText={onComment} maxLength={300} multiline placeholder="What should another CpE student know?" placeholderTextColor={theme.muted} style={[styles.commentInput, { backgroundColor: theme.canvas, borderColor: theme.border, color: theme.ink }]} />
      <PrimaryButton label={ownRating ? 'Update rating' : 'Publish rating'} loading={saving} onPress={onSubmit} />
      {onDelete && <PrimaryButton label="Delete my rating" tone="danger" style={styles.deleteButton} onPress={onDelete} />}
    </View>
  );
}

function CommentsList({ ratings, session, onRefresh }: { ratings: CourseRating[]; session: AppSession; onRefresh: () => Promise<void> }) {
  const theme = useAppTheme();
  return (
    <View>
      <Text style={[styles.panelTitle, { color: theme.ink }]}>Student comments</Text>
      <Text style={[styles.panelHelp, { color: theme.muted }]}>{ratings.length} shared experience{ratings.length === 1 ? '' : 's'}</Text>
      {ratings.map((rating) => <View key={rating.id} style={[styles.review, { backgroundColor: theme.canvas }]}><View style={styles.reviewHeader}><Text style={[styles.username, { color: theme.green700 }]}>@{rating.username}</Text><View style={styles.reviewScores}><CriterionStars label="D" fullLabel="Difficulty" value={rating.difficulty} /><CriterionStars label="W" fullLabel="Workload" value={rating.workload} /><CriterionStars label="U" fullLabel="Usefulness" value={rating.usefulness} /></View></View>{rating.comment ? <Text style={[styles.reviewComment, { color: theme.ink }]}>{rating.comment}</Text> : <Text style={[styles.noComment, { color: theme.muted }]}>No written comment.</Text>}<View style={styles.reviewActions}>{rating.userId !== session.id && <Pressable onPress={() => void reportRating(session, rating.id).then(onRefresh)}><Text style={[styles.actionText, { color: theme.danger }]}>Report</Text></Pressable>}{session.role === 'admin' && <Pressable onPress={() => void moderateRating(session, rating.id, true).then(onRefresh)}><Text style={[styles.adminAction, { color: theme.warning }]}>Hide · {rating.reportCount ?? 0} reports</Text></Pressable>}</View></View>)}
      {ratings.length === 0 && <View style={[styles.noReviewsBox, { backgroundColor: theme.canvas }]}><Text style={[styles.noReviews, { color: theme.muted }]}>No comments yet. The first student experience can be especially useful.</Text></View>}
    </View>
  );
}

function ScorePicker({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const theme = useAppTheme();
  return <View style={styles.scoreBlock}><View style={styles.scoreHeading}><Text style={[styles.scoreLabel, { color: theme.ink }]}>{label}</Text><StarRating value={value} size="sm" label={label} valueColor={theme.green700} /></View><View style={styles.scoreButtons}>{[1, 2, 3, 4, 5].map((score) => <Pressable accessibilityLabel={`Rate ${label} ${score} out of 5`} key={score} onPress={() => onChange(score)} style={[styles.scoreButton, { backgroundColor: value === score ? theme.green800 : theme.canvas }]}><Text style={[styles.scoreText, { color: value === score ? contrastText(theme.green800) : theme.muted }]}>{score}</Text></Pressable>)}</View></View>;
}

function Summary({ label, value }: { label: string; value?: number | null }) {
  const theme = useAppTheme();
  return <View style={[styles.summaryCard, { backgroundColor: theme.canvas }]}><Text style={[styles.summaryLabel, { color: theme.muted }]}>{label}</Text>{value == null ? <Text style={[styles.summaryEmpty, { color: theme.muted }]}>No ratings yet</Text> : <StarRating value={value} size="sm" label={label} valueColor={theme.green700} />}</View>;
}

function CriterionStars({ label, fullLabel, value }: { label: string; fullLabel: string; value: number }) {
  const theme = useAppTheme();
  return <View style={styles.reviewCriterion}><Text style={[styles.reviewCriterionLabel, { color: theme.muted }]}>{label}</Text><StarRating value={value} size={9} showValue={false} label={fullLabel} /></View>;
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 110 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { marginTop: 5, fontSize: 27, fontWeight: '900' },
  subtitle: { marginTop: 7, fontSize: 12, lineHeight: 19 },
  previewBanner: { marginTop: 15, padding: 13, borderRadius: 13, borderWidth: 1 },
  previewTitle: { fontSize: 12, fontWeight: '900' },
  previewText: { marginTop: 3, fontSize: 10 },
  infoBubble: { marginTop: 15, padding: 15, borderRadius: 15, borderWidth: 1 },
  infoClose: { position: 'absolute', right: 9, top: 7, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  infoCloseText: { fontSize: 20, fontWeight: '900' },
  infoTitle: { fontSize: 13, fontWeight: '900' },
  infoText: { marginTop: 5, fontSize: 11, lineHeight: 16 },
  infoStrong: { fontWeight: '900' },
  intelPrompt: { marginTop: 10, padding: 13, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  intelStars: { flexDirection: 'row', gap: 2 },
  intelStar: { fontSize: 14, fontWeight: '900' },
  intelCopy: { flex: 1 },
  intelTitle: { fontSize: 11, fontWeight: '900' },
  intelText: { marginTop: 3, fontSize: 9.5, lineHeight: 14 },
  departmentTabs: { marginTop: 16, maxWidth: 560, padding: 4, borderRadius: 14, borderWidth: 1, flexDirection: 'row' },
  departmentTab: { flex: 1, minHeight: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  departmentText: { fontSize: 11, fontWeight: '900' },
  departmentCount: { fontSize: 9 },
  search: { marginTop: 10, height: 49, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1 },
  courseStrip: { paddingVertical: 12, gap: 8 },
  courseChoice: { width: 184, minHeight: 102, padding: 12, borderRadius: 14, borderWidth: 1 },
  courseCode: { fontSize: 11, fontWeight: '900' },
  courseTitle: { marginTop: 4, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  courseRating: { marginTop: 'auto', paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 },
  courseRatingCount: { fontSize: 7.5, fontWeight: '800' },
  courseRatingEmpty: { marginTop: 'auto', paddingTop: 8, fontSize: 8, fontWeight: '800' },
  detailCard: { marginTop: 3, padding: 18, borderRadius: 19, borderWidth: 1 },
  selectedCode: { fontSize: 11, fontWeight: '900' },
  selectedTitle: { marginTop: 4, fontSize: 21, fontWeight: '900' },
  summaryRow: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryCard: { flex: 1, minWidth: 150, padding: 11, borderRadius: 12, gap: 5 },
  summaryLabel: { fontSize: 9, fontWeight: '800' },
  summaryEmpty: { fontSize: 10, fontStyle: 'italic' },
  desktopColumns: { marginTop: 18, flexDirection: 'row', alignItems: 'flex-start' },
  commentsColumn: { width: '58%', paddingRight: 18, borderRightWidth: 1 },
  formColumn: { width: '42%', paddingLeft: 18 },
  mobileDetail: { marginTop: 18 },
  panelTitle: { fontSize: 17, fontWeight: '900' },
  panelHelp: { marginTop: 3, marginBottom: 11, fontSize: 10, lineHeight: 15 },
  review: { marginBottom: 8, padding: 13, borderRadius: 13 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  username: { fontSize: 11, fontWeight: '900' },
  reviewScores: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 },
  reviewCriterion: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  reviewCriterionLabel: { fontSize: 8, fontWeight: '900' },
  reviewComment: { marginTop: 7, fontSize: 12, lineHeight: 18 },
  noComment: { marginTop: 7, fontSize: 10, fontStyle: 'italic' },
  reviewActions: { marginTop: 8, flexDirection: 'row', gap: 15 },
  actionText: { fontSize: 9, fontWeight: '800' },
  adminAction: { fontSize: 9, fontWeight: '900' },
  noReviewsBox: { padding: 18, borderRadius: 13 },
  noReviews: { textAlign: 'center', fontSize: 11, lineHeight: 17 },
  form: { width: '100%' },
  scoreBlock: { marginTop: 12 },
  scoreHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  scoreLabel: { fontSize: 11, fontWeight: '800' },
  scoreButtons: { marginTop: 6, flexDirection: 'row', gap: 5 },
  scoreButton: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  scoreText: { fontSize: 11, fontWeight: '900' },
  commentLabel: { marginTop: 15, marginBottom: 6, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  commentInput: { minHeight: 106, marginBottom: 12, padding: 12, textAlignVertical: 'top', borderRadius: 12, borderWidth: 1 },
  deleteButton: { marginTop: 8 },
  ineligible: { padding: 13, borderRadius: 12, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  mobileRateButton: { marginTop: 12 },
  emptyState: { marginTop: 3, padding: 28, borderRadius: 18, borderWidth: 1, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '900' },
  emptyText: { marginTop: 5, fontSize: 11 },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(4,25,16,0.48)' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  sheetHandle: { width: 46, height: 5, marginTop: 10, borderRadius: 4, backgroundColor: '#B5BEB9', alignSelf: 'center' },
  sheetHeader: { paddingHorizontal: 20, paddingTop: 12, flexDirection: 'row', alignItems: 'center' },
  sheetTitle: { flex: 1, fontSize: 20, fontWeight: '900' },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 24 },
  sheetContent: { padding: 20, paddingBottom: 36 },
});
