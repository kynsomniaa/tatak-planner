export type CourseDepartment = 'GED' | 'COE' | 'CPE';
export type CourseFilter = 'ALL' | CourseDepartment;

export const courseDepartment = (courseCode: string): CourseDepartment => {
  if (courseCode.toUpperCase().startsWith('CPE')) return 'CPE';
  if (courseCode.toUpperCase().startsWith('COE')) return 'COE';
  return 'GED';
};

export const departments: CourseDepartment[] = ['GED', 'COE', 'CPE'];
export const courseFilters: CourseFilter[] = ['ALL', ...departments];

const boardDepartmentPriority: Record<CourseDepartment, number> = {
  CPE: 0,
  COE: 1,
  GED: 2,
};

/** Keep major subjects at the top of every term: CPE, then COE, then GED/other. */
export function compareCourseCodesForBoard(leftCode: string, rightCode: string): number {
  return boardDepartmentPriority[courseDepartment(leftCode)] - boardDepartmentPriority[courseDepartment(rightCode)];
}
