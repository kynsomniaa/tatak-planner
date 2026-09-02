import { BoardColumnPosition, CurriculumTerm } from '../types';

export const DEFAULT_COLUMN_SPACING = 52;
export const DEFAULT_CANVAS_PADDING = 180;
export const BOARD_GRID_SIZE = 20;

export interface BoardColumnSize {
  width: number;
  height: number;
}

export function orderedBoardTerms(terms: CurriculumTerm[], columnOrder: string[] = []): CurriculumTerm[] {
  const byId = new Map(terms.map((term) => [term.id, term]));
  const ids = [...columnOrder.filter((id) => byId.has(id)), ...terms.map((term) => term.id).filter((id) => !columnOrder.includes(id))];
  return ids.map((id) => byId.get(id)).filter((term): term is CurriculumTerm => Boolean(term));
}

export function reorderBoardColumns(
  allTerms: CurriculumTerm[],
  visibleTerms: CurriculumTerm[],
  columnOrder: string[],
  termId: string,
  direction: -1 | 1,
): string[] {
  const visibleIndex = visibleTerms.findIndex((term) => term.id === termId);
  const target = visibleTerms[visibleIndex + direction];
  if (visibleIndex < 0 || !target) return columnOrder;
  const full = orderedBoardTerms(allTerms, columnOrder).map((term) => term.id);
  const from = full.indexOf(termId);
  const to = full.indexOf(target.id);
  [full[from], full[to]] = [full[to], full[from]];
  return full;
}

export function starterBoardPositions(
  terms: CurriculumTerm[],
  widthForTerm: (termId: string) => number,
  spacing = DEFAULT_COLUMN_SPACING,
  canvasPadding = DEFAULT_CANVAS_PADDING,
  top?: number,
): Record<string, BoardColumnPosition> {
  const origin = Math.min(80, Math.max(24, Math.round(canvasPadding / 2)));
  let x = origin;
  const y = top ?? origin + 34;
  return terms.reduce<Record<string, BoardColumnPosition>>((positions, term) => {
    positions[term.id] = { x, y };
    x += widthForTerm(term.id) + spacing;
    return positions;
  }, {});
}

export function resolvedBoardPositions(
  terms: CurriculumTerm[],
  widthForTerm: (termId: string) => number,
  saved: Record<string, BoardColumnPosition> | undefined,
  spacing = DEFAULT_COLUMN_SPACING,
  canvasPadding = DEFAULT_CANVAS_PADDING,
): Record<string, BoardColumnPosition> {
  const starter = starterBoardPositions(terms, widthForTerm, spacing, canvasPadding);
  return terms.reduce<Record<string, BoardColumnPosition>>((positions, term) => {
    positions[term.id] = saved?.[term.id] ?? starter[term.id];
    return positions;
  }, {});
}

const overlaps = (
  left: BoardColumnPosition,
  leftSize: BoardColumnSize,
  right: BoardColumnPosition,
  rightSize: BoardColumnSize,
  gutter = 16,
) => left.x < right.x + rightSize.width + gutter
  && left.x + leftSize.width + gutter > right.x
  && left.y < right.y + rightSize.height + gutter
  && left.y + leftSize.height + gutter > right.y;

export function resolveBoardColumnDrop({
  termId,
  candidate,
  positions,
  sizes,
  snapToGrid,
  preventOverlap,
  minimum = 24,
}: {
  termId: string;
  candidate: BoardColumnPosition;
  positions: Record<string, BoardColumnPosition>;
  sizes: Record<string, BoardColumnSize>;
  snapToGrid: boolean;
  preventOverlap: boolean;
  minimum?: number;
}): BoardColumnPosition {
  const snap = (value: number) => snapToGrid ? Math.round(value / BOARD_GRID_SIZE) * BOARD_GRID_SIZE : Math.round(value);
  const base = { x: Math.max(minimum, snap(candidate.x)), y: Math.max(minimum, snap(candidate.y)) };
  if (!preventOverlap || !sizes[termId]) return base;
  const occupied = Object.entries(positions).filter(([id]) => id !== termId && sizes[id]);
  const isFree = (point: BoardColumnPosition) => occupied.every(([id, other]) => !overlaps(point, sizes[termId], other, sizes[id]));
  if (isFree(base)) return base;

  for (let ring = 1; ring <= 24; ring += 1) {
    const distance = ring * BOARD_GRID_SIZE;
    const candidates = [
      { x: base.x + distance, y: base.y },
      { x: Math.max(minimum, base.x - distance), y: base.y },
      { x: base.x, y: base.y + distance },
      { x: base.x, y: Math.max(minimum, base.y - distance) },
      { x: base.x + distance, y: base.y + distance },
      { x: Math.max(minimum, base.x - distance), y: base.y + distance },
    ];
    const free = candidates.find(isFree);
    if (free) return free;
  }
  return positions[termId] ?? base;
}
