export type CourseStatus = 'passed' | 'active' | 'pending' | 'retake';
export type ThemePalette = 'feu-green' | 'dark' | 'black-maroon' | 'black-orange' | 'pastel-pink' | 'system';

export type GoalKind =
  | 'earliest_graduation'
  | 'lighter_workload'
  | 'thesis_readiness'
  | 'custom';

export interface CurriculumTerm {
  id: string;
  label: string;
  year: number;
  term: number;
  order: number;
}

export interface Course {
  code: string;
  title: string;
  units: number;
  originalTermId: string;
  prerequisites: string[];
  corequisites: string[];
  linkedLaboratories: string[];
  description?: string;
}

export interface Curriculum {
  id: string;
  program: 'BS Computer Engineering';
  school: 'FEU Institute of Technology';
  sourceFileName: string;
  importedAt: string;
  terms: CurriculumTerm[];
  courses: Course[];
  fingerprint: string;
}

export interface StudentGoal {
  id: string;
  kind: GoalKind;
  name: string;
  notes: string;
  allowAiChanges: boolean;
}

export interface AcademicProfile {
  startYear: number;
  startTerm: number;
  currentYear: number;
  currentTerm: number;
  currentTermId: string;
  currentCourseCodes: string[];
  inferredPassedCodes: string[];
  manualPassedCodes: string[];
  prerequisiteOverrides?: Record<string, string[]>;
}

export interface RetakeAttempt {
  id: string;
  courseCode: string;
  termId: string;
  status: CourseStatus;
  grades: Record<string, number>;
  createdAt: string;
}

export interface BoardLayoutPreferences {
  zoom: number;
  scrollX: number;
  scrollY: number;
  columnOrder: string[];
  columnPositions: Record<string, BoardColumnPosition>;
  columnSpacing: number;
  canvasPadding: number;
  snapToGrid: boolean;
  preventColumnOverlap: boolean;
  lockColumnPositions: boolean;
  collapsedTermIds: string[];
  hiddenTermIds: string[];
  compactCards: boolean;
  hideCompletedYears: boolean;
  currentAndFutureOnly: boolean;
  showUnits: boolean;
  showGwa: boolean;
  showWarnings: boolean;
  showSchoolYear: boolean;
}

export interface BoardColumnPosition {
  x: number;
  y: number;
}

export interface StudentWorkspace {
  plannerModelVersion?: number;
  curriculum?: Curriculum;
  plan: Record<string, string>;
  statuses: Record<string, CourseStatus>;
  grades?: Record<string, number>;
  plannedCourseCodes?: string[];
  plannerTermIds?: string[];
  customPlannerTerms?: CurriculumTerm[];
  retakeAttempts?: RetakeAttempt[];
  academicProfile?: AcademicProfile;
  goal?: StudentGoal;
  preferences?: {
    showPrerequisiteConnectors: boolean;
    cardLabel: 'code' | 'title';
    theme: ThemePalette;
    boardLayouts?: {
      curriculum?: BoardLayoutPreferences;
      planner?: BoardLayoutPreferences;
    };
  };
  updatedAt: string;
}

export interface AppSession {
  id: string;
  username: string;
  role?: 'student' | 'admin';
}

export interface CourseRating {
  id: string;
  userId: string;
  username: string;
  program: 'BS Computer Engineering';
  courseCode: string;
  difficulty: number;
  workload: number;
  usefulness: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
  reportCount?: number;
  hidden?: boolean;
}

export interface CourseRatingSummary {
  courseCode: string;
  difficulty: number | null;
  workload: number | null;
  usefulness: number | null;
  count: number;
}

export interface MoveCommand {
  courseCode: string;
  targetTermId: string;
}

export interface PlanSuggestion {
  id: string;
  title: string;
  detail: string;
  impact: string;
  moves: MoveCommand[];
}

export interface PlanViolation {
  type: 'prerequisite' | 'corequisite' | 'unknown-prerequisite';
  courseCode: string;
  relatedCode: string;
  message: string;
  blocking: boolean;
}

export interface PlanWarning {
  type: 'underload' | 'overload' | 'delayed-chain' | 'unknown-prerequisite';
  termId?: string;
  courseCode?: string;
  message: string;
}
