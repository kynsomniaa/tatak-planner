import type { CurriculumGraphAnalysis } from './curriculumGraphAnalysis';
import type {
  CourseImportance,
  CurriculumFieldDefinition,
  CurriculumFieldId,
  CurriculumGraphEdge,
  CurriculumGraphField,
  CurriculumGraphNode,
  CurriculumGraphPoint,
  CurriculumGraphRect,
} from './curriculumGraph';

const CANVAS_PADDING = 110;
const RANK_SPACING = 390;
const HORIZONTAL_GAP = 76;
const VERTICAL_GAP = 38;
const FIELD_SPACING = 260;
const LAYOUT_SWEEPS = 8;
const STARTER_COLUMNS = 2;
const STARTER_COLUMN_GAP = 34;
const STARTER_ROW_GAP = 24;

const dimensions: Record<CourseImportance, { width: number; height: number }> = {
  normal: { width: 168, height: 78 },
  medium: { width: 190, height: 86 },
  large: { width: 220, height: 100 },
  major: { width: 260, height: 120 },
};
const milestoneDimensions = {
  thesis: { width: 328, height: 156 },
  internship: { width: 312, height: 134 },
};
const STARTING_REGION_EXIT = CANVAS_PADDING + STARTER_COLUMNS * dimensions.major.width + STARTER_COLUMN_GAP + HORIZONTAL_GAP;

const codeJitter = (code: string) => {
  let hash = 0;
  for (let index = 0; index < code.length; index += 1) hash = (hash * 31 + code.charCodeAt(index)) >>> 0;
  return (hash % 1000) / 1000;
};

const centerY = (node: CurriculumGraphNode) => node.y + node.height / 2;

function fieldPairKey(left: CurriculumFieldId, right: CurriculumFieldId) {
  return [left, right].sort().join('|');
}

function calculateFieldPlacement(
  analysis: CurriculumGraphAnalysis,
  edges: CurriculumGraphEdge[],
  definitions: CurriculumFieldDefinition[],
) {
  const present = definitions.filter((definition) => [...analysis.courses.values()].some((item) => item.fieldId === definition.id));
  const affinity = new Map<string, number>();
  const addAffinity = (left: CurriculumFieldId, right: CurriculumFieldId, amount: number) => {
    if (left === right) return;
    const key = fieldPairKey(left, right);
    affinity.set(key, (affinity.get(key) ?? 0) + amount);
  };
  const outgoing = new Map<string, string[]>();
  edges.filter((edge) => edge.kind === 'prerequisite').forEach((edge) => {
    const sourceField = analysis.courses.get(edge.sourceCode)?.fieldId;
    const targetField = analysis.courses.get(edge.targetCode)?.fieldId;
    if (sourceField && targetField) addAffinity(sourceField, targetField, 1);
    outgoing.set(edge.sourceCode, [...(outgoing.get(edge.sourceCode) ?? []), edge.targetCode]);
  });
  for (const [source, children] of outgoing) {
    const sourceField = analysis.courses.get(source)?.fieldId;
    if (!sourceField) continue;
    children.flatMap((child) => outgoing.get(child) ?? []).forEach((grandchild) => {
      const targetField = analysis.courses.get(grandchild)?.fieldId;
      if (targetField) addAffinity(sourceField, targetField, 0.3);
    });
  }
  const directCrossCount = new Map<CurriculumFieldId, number>();
  edges.filter((edge) => edge.kind === 'prerequisite').forEach((edge) => {
    const source = analysis.courses.get(edge.sourceCode)?.fieldId;
    const target = analysis.courses.get(edge.targetCode)?.fieldId;
    if (!source || !target || source === target) return;
    directCrossCount.set(source, (directCrossCount.get(source) ?? 0) + 1);
    directCrossCount.set(target, (directCrossCount.get(target) ?? 0) + 1);
  });
  const maxCross = Math.max(1, ...directCrossCount.values());
  const importance = new Map<CurriculumFieldId, number>();
  present.forEach((definition) => {
    const members = [...analysis.courses.values()].filter((item) => item.fieldId === definition.id);
    const average = members.reduce((sum, item) => sum + item.importanceScore, 0) / Math.max(1, members.length);
    const milestone = Math.max(0, ...members.map((item) => item.metrics.milestoneWeight));
    const cross = (directCrossCount.get(definition.id) ?? 0) / maxCross;
    importance.set(definition.id, Math.min(1.5, average + milestone * 0.65 + cross * 0.25));
  });

  const availableOffsets: number[] = [0];
  for (let step = 1; availableOffsets.length < present.length; step += 1) availableOffsets.push(-step, step);
  const root = [...present].sort((left, right) => (importance.get(right.id) ?? 0) - (importance.get(left.id) ?? 0) || left.id.localeCompare(right.id))[0];
  const offsets = new Map<CurriculumFieldId, number>();
  if (root) offsets.set(root.id, 0);
  while (offsets.size < present.length) {
    const unplaced = present.filter((field) => !offsets.has(field.id));
    const candidate = [...unplaced].sort((left, right) => {
      const affinityToPlaced = (field: CurriculumFieldId) => [...offsets.keys()].reduce((sum, placed) => sum + (affinity.get(fieldPairKey(field, placed)) ?? 0), 0);
      return affinityToPlaced(right.id) - affinityToPlaced(left.id)
        || (importance.get(right.id) ?? 0) - (importance.get(left.id) ?? 0)
        || left.id.localeCompare(right.id);
    })[0];
    // The most graph-connected remaining field receives the next-nearest slot.
    // Alternating sides keeps the world map balanced without hardcoding a field order.
    offsets.set(candidate.id, availableOffsets[offsets.size]);
  }
  const minOffset = Math.min(0, ...offsets.values());
  const maxOffset = Math.max(0, ...offsets.values());
  const centerline = CANVAS_PADDING + (Math.max(Math.abs(minOffset), Math.abs(maxOffset)) + 0.75) * FIELD_SPACING;
  const centers = new Map<CurriculumFieldId, number>();
  offsets.forEach((offset, field) => centers.set(field, centerline + offset * FIELD_SPACING));
  return { centers, importance, affinity };
}

function packLayer(nodes: CurriculumGraphNode[], desired: Map<string, number>) {
  nodes.sort((left, right) => (desired.get(left.course.code) ?? 0) - (desired.get(right.course.code) ?? 0) || left.course.code.localeCompare(right.course.code));
  let cursor = CANVAS_PADDING;
  nodes.forEach((node) => {
    node.y = Math.max(cursor, (desired.get(node.course.code) ?? cursor) - node.height / 2);
    cursor = node.y + node.height + VERTICAL_GAP;
  });
}

function crossingCount(nodes: CurriculumGraphNode[], edges: CurriculumGraphEdge[]): number {
  const byCode = new Map(nodes.map((node) => [node.course.code, node]));
  const directed = edges.filter((edge) => edge.kind === 'prerequisite').flatMap((edge) => {
    const source = byCode.get(edge.sourceCode);
    const target = byCode.get(edge.targetCode);
    return source && target ? [{ edge, source, target }] : [];
  });
  let count = 0;
  const intersects = (a1: { x: number; y: number }, a2: { x: number; y: number }, b1: { x: number; y: number }, b2: { x: number; y: number }) => {
    const denominator = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
    if (Math.abs(denominator) < 0.001) return false;
    const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / denominator;
    const u = ((b1.x - a1.x) * (a2.y - a1.y) - (b1.y - a1.y) * (a2.x - a1.x)) / denominator;
    return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
  };
  for (let leftIndex = 0; leftIndex < directed.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < directed.length; rightIndex += 1) {
      const left = directed[leftIndex];
      const right = directed[rightIndex];
      if (left.edge.sourceCode === right.edge.sourceCode || left.edge.targetCode === right.edge.targetCode) continue;
      const leftStart = { x: left.source.x + left.source.width, y: centerY(left.source) };
      const leftEnd = { x: left.target.x, y: centerY(left.target) };
      const rightStart = { x: right.source.x + right.source.width, y: centerY(right.source) };
      const rightEnd = { x: right.target.x, y: centerY(right.target) };
      if (intersects(leftStart, leftEnd, rightStart, rightEnd)) count += 1;
    }
  }
  return count;
}

function verticalEdgeLength(nodes: CurriculumGraphNode[], edges: CurriculumGraphEdge[]): number {
  const byCode = new Map(nodes.map((node) => [node.course.code, node]));
  return edges.reduce((sum, edge) => {
    const source = byCode.get(edge.sourceCode);
    const target = byCode.get(edge.targetCode);
    return source && target ? sum + Math.abs(centerY(source) - centerY(target)) : sum;
  }, 0);
}

function resolveCollisions(nodes: CurriculumGraphNode[]) {
  for (let pass = 0; pass < 12; pass += 1) {
    let moved = false;
    const ordered = [...nodes].sort((left, right) => left.y - right.y || left.x - right.x);
    for (let aIndex = 0; aIndex < ordered.length; aIndex += 1) {
      for (let bIndex = aIndex + 1; bIndex < ordered.length; bIndex += 1) {
        const a = ordered[aIndex];
        const b = ordered[bIndex];
        const horizontalOverlap = a.x < b.x + b.width + 24 && a.x + a.width + 24 > b.x;
        const verticalOverlap = a.y < b.y + b.height + VERTICAL_GAP && a.y + a.height + VERTICAL_GAP > b.y;
        if (!horizontalOverlap || !verticalOverlap) continue;
        const movable = a.importanceScore <= b.importanceScore ? a : b;
        const anchor = movable === a ? b : a;
        movable.y = Math.max(movable.y, anchor.y + anchor.height + VERTICAL_GAP);
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function boundsFor(nodes: CurriculumGraphNode[], paddingX = 60, paddingY = 80): CurriculumGraphRect {
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));
  return { x: minX - paddingX, y: minY - paddingY, width: maxX - minX + paddingX * 2, height: maxY - minY + paddingY * 2 };
}

function rectanglesOverlap(left: CurriculumGraphRect, right: CurriculumGraphRect, padding = 0) {
  return left.x < right.x + right.width + padding
    && left.x + left.width + padding > right.x
    && left.y < right.y + right.height + padding
    && left.y + left.height + padding > right.y;
}

function placeFieldLabel(
  members: CurriculumGraphNode[],
  fieldBounds: CurriculumGraphRect,
  allNodes: CurriculumGraphNode[],
  occupiedLabels: CurriculumGraphRect[],
): CurriculumGraphRect {
  const width = 430;
  const height = 82;
  const minX = Math.min(...members.map((node) => node.x));
  const maxX = Math.max(...members.map((node) => node.x + node.width));
  const minY = Math.min(...members.map((node) => node.y));
  const maxY = Math.max(...members.map((node) => node.y + node.height));
  const centerX = (minX + maxX) / 2;
  const centerYValue = (minY + maxY) / 2;
  const candidates = [
    { x: centerX - width / 2, y: minY - height - 34, width, height },
    { x: centerX - width / 2, y: minY - height * 2 - 68, width, height },
    { x: minX, y: minY - height - 34, width, height },
    { x: minX - width * 0.55, y: minY - height - 34, width, height },
    { x: maxX - width, y: minY - height - 34, width, height },
    { x: maxX - width * 0.45, y: minY - height - 34, width, height },
    { x: minX - width - 42, y: centerYValue - height / 2, width, height },
    { x: minX - width - 42, y: centerYValue - height * 1.7, width, height },
    { x: minX - width - 42, y: centerYValue + height * 0.7, width, height },
    { x: maxX + 42, y: centerYValue - height / 2, width, height },
    { x: maxX + 42, y: centerYValue - height * 1.7, width, height },
    { x: maxX + 42, y: centerYValue + height * 0.7, width, height },
    { x: centerX - width / 2, y: maxY + 34, width, height },
    { x: centerX - width / 2, y: maxY + height + 68, width, height },
    { x: fieldBounds.x + 30, y: fieldBounds.y + 20, width, height },
  ].map((candidate) => ({ ...candidate, x: Math.max(24, candidate.x), y: Math.max(24, candidate.y) }));
  const score = (candidate: CurriculumGraphRect) => allNodes.reduce((total, node) => total + (rectanglesOverlap(candidate, node, 18) ? 1000 : 0), 0)
    + occupiedLabels.reduce((total, label) => total + (rectanglesOverlap(candidate, label, 18) ? 800 : 0), 0)
    + Math.abs((candidate.x + width / 2) - centerX) * 0.04
    + Math.abs((candidate.y + height / 2) - centerYValue) * 0.02;
  const clear = (candidate: CurriculumGraphRect) => !allNodes.some((node) => rectanglesOverlap(candidate, node, 18))
    && !occupiedLabels.some((label) => rectanglesOverlap(candidate, label, 18));
  const orderedCandidates = [...candidates].sort((left, right) => score(left) - score(right));
  const preferred = orderedCandidates.find(clear);
  if (preferred) return preferred;
  for (let ring = 1; ring <= 8; ring += 1) {
    for (let horizontal = -ring; horizontal <= ring; horizontal += 1) {
      for (const vertical of [-ring, ring]) {
        const candidate = { x: Math.max(24, centerX - width / 2 + horizontal * (width + 28)), y: Math.max(24, centerYValue - height / 2 + vertical * (height + 28)), width, height };
        if (clear(candidate)) return candidate;
      }
    }
    for (let vertical = -ring + 1; vertical < ring; vertical += 1) {
      for (const horizontal of [-ring, ring]) {
        const candidate = { x: Math.max(24, centerX - width / 2 + horizontal * (width + 28)), y: Math.max(24, centerYValue - height / 2 + vertical * (height + 28)), width, height };
        if (clear(candidate)) return candidate;
      }
    }
  }
  return orderedCandidates[0];
}

function cleanPoints(points: CurriculumGraphPoint[]) {
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
}

function routeEdges(nodes: CurriculumGraphNode[], edges: CurriculumGraphEdge[], canvasHeight: number): CurriculumGraphEdge[] {
  const byCode = new Map(nodes.map((node) => [node.course.code, node]));
  const sourceUse = new Map<string, number>();
  return edges.map((edge) => {
    const source = byCode.get(edge.sourceCode);
    const target = byCode.get(edge.targetCode);
    if (!source || !target) return edge;
    const prominence = edge.prominence ?? Math.max(source.importanceScore, target.importanceScore);
    if (edge.kind === 'corequisite') {
      const left = source.x <= target.x ? source : target;
      const right = left === source ? target : source;
      const start = { x: left.x + left.width, y: centerY(left) };
      const end = { x: right.x, y: centerY(right) };
      const channel = Math.max(CANVAS_PADDING / 2, Math.min(start.y, end.y) - 42);
      return { ...edge, prominence, rankSpan: Math.abs(source.layoutRank - target.layoutRank), points: cleanPoints([start, { x: start.x + 28, y: start.y }, { x: start.x + 28, y: channel }, { x: end.x - 28, y: channel }, { x: end.x - 28, y: end.y }, end]) };
    }
    const start = { x: source.x + source.width, y: centerY(source) };
    const end = { x: target.x, y: centerY(target) };
    const gap = Math.max(80, end.x - start.x);
    const trunkX = start.x + Math.min(96, gap * 0.32);
    const approachX = Math.max(trunkX + 34, end.x - Math.min(72, gap * 0.25));
    const useIndex = sourceUse.get(source.course.code) ?? 0;
    sourceUse.set(source.course.code, useIndex + 1);
    let channelY = start.y * 0.48 + end.y * 0.52 + (useIndex % 3 - 1) * 12;
    const direction = channelY < canvasHeight / 2 ? -1 : 1;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const obstruction = nodes.some((node) => node !== source && node !== target
        && node.x < approachX && node.x + node.width > trunkX
        && channelY > node.y - 16 && channelY < node.y + node.height + 16);
      if (!obstruction) break;
      channelY += direction * 34;
      channelY = Math.max(42, Math.min(canvasHeight - 42, channelY));
    }
    const rankSpan = Math.max(1, target.layoutRank - source.layoutRank);
    const virtualPoints: CurriculumGraphPoint[] = [];
    if (rankSpan > 1) {
      for (let step = 1; step < rankSpan; step += 1) {
        virtualPoints.push({ x: trunkX + (approachX - trunkX) * (step / rankSpan), y: channelY, virtual: true });
      }
    }
    return {
      ...edge,
      prominence,
      rankSpan,
      points: cleanPoints([
        start,
        { x: trunkX, y: start.y },
        { x: trunkX, y: channelY },
        ...virtualPoints,
        { x: approachX, y: channelY },
        { x: approachX, y: end.y },
        end,
      ]),
    };
  });
}

export interface CurriculumLayoutResult {
  nodes: CurriculumGraphNode[];
  fields: CurriculumGraphField[];
  edges: CurriculumGraphEdge[];
  startingRegion: CurriculumGraphRect;
  width: number;
  height: number;
  crossingCountBefore: number;
  crossingCountAfter: number;
}

export function calculateCurriculumLayout(
  analysis: CurriculumGraphAnalysis,
  edges: CurriculumGraphEdge[],
  fieldDefinitions: CurriculumFieldDefinition[],
  termOrder: Map<string, number>,
  firstTermId?: string,
): CurriculumLayoutResult {
  const fieldPlacement = calculateFieldPlacement(analysis, edges, fieldDefinitions);
  const maxTermOrder = Math.max(1, ...termOrder.values());
  const maxDepth = Math.max(6, ...[...analysis.courses.values()].map((item) => item.metrics.prerequisiteDepth));
  const predecessors = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  edges.filter((edge) => edge.kind === 'prerequisite').forEach((edge) => {
    predecessors.set(edge.targetCode, [...(predecessors.get(edge.targetCode) ?? []), edge.sourceCode]);
    dependents.set(edge.sourceCode, [...(dependents.get(edge.sourceCode) ?? []), edge.targetCode]);
  });
  const nodes: CurriculumGraphNode[] = [];
  const byCode = new Map<string, CurriculumGraphNode>();
  const starterCodes = analysis.topologicalOrder.filter((code) => analysis.courses.get(code)?.course.originalTermId === firstTermId);
  const starterIndex = new Map(starterCodes.map((code, index) => [code, index]));
  analysis.topologicalOrder.forEach((code) => {
    const analyzed = analysis.courses.get(code);
    if (!analyzed) return;
    const size = analyzed.milestoneKind ? milestoneDimensions[analyzed.milestoneKind] : dimensions[analyzed.importance];
    const originalOrder = termOrder.get(analyzed.course.originalTermId) ?? 0;
    const temporalRank = (originalOrder / maxTermOrder) * maxDepth * 0.62;
    const progressionRank = analyzed.course.originalTermId === firstTermId ? 0 : Math.max(analyzed.metrics.prerequisiteDepth, temporalRank);
    let x = CANVAS_PADDING + progressionRank * RANK_SPACING + codeJitter(code) * 44;
    if (analyzed.course.originalTermId === firstTermId) {
      x = CANVAS_PADDING + ((starterIndex.get(code) ?? 0) % STARTER_COLUMNS) * (dimensions.major.width + STARTER_COLUMN_GAP);
    }
    if (analyzed.course.originalTermId !== firstTermId) x = Math.max(x, STARTING_REGION_EXIT);
    const parentNodes = (predecessors.get(code) ?? []).flatMap((parent) => byCode.get(parent) ? [byCode.get(parent) as CurriculumGraphNode] : []);
    if (parentNodes.length > 0) x = Math.max(x, ...parentNodes.map((parent) => parent.x + parent.width + HORIZONTAL_GAP));
    const layoutRank = Math.max(0, Math.round((x - CANVAS_PADDING) / RANK_SPACING));
    const node: CurriculumGraphNode = {
      course: analyzed.course,
      fieldId: analyzed.fieldId,
      metrics: analyzed.metrics,
      importanceScore: analyzed.importanceScore,
      importance: analyzed.importance,
      milestoneKind: analyzed.milestoneKind,
      difficult: false,
      rank: analyzed.metrics.prerequisiteDepth,
      layoutRank,
      x,
      y: 0,
      width: size.width,
      height: size.height,
    };
    nodes.push(node);
    byCode.set(code, node);
  });
  const centerline = [...fieldPlacement.centers.values()].reduce((sum, value) => sum + value, 0) / Math.max(1, fieldPlacement.centers.size);
  const starterTargets = new Map<string, number>();
  const starters = nodes
    .filter((node) => node.course.originalTermId === firstTermId)
    .sort((left, right) => (starterIndex.get(left.course.code) ?? 0) - (starterIndex.get(right.course.code) ?? 0));
  const starterRows = Math.ceil(starters.length / STARTER_COLUMNS);
  const rowHeights = Array.from({ length: starterRows }, (_, row) => Math.max(...starters.slice(row * STARTER_COLUMNS, row * STARTER_COLUMNS + STARTER_COLUMNS).map((node) => node.height)));
  const starterHeight = rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, starterRows - 1) * STARTER_ROW_GAP;
  let starterCursor = Math.max(CANVAS_PADDING, centerline - starterHeight / 2);
  rowHeights.forEach((height, row) => {
    starters.slice(row * STARTER_COLUMNS, row * STARTER_COLUMNS + STARTER_COLUMNS).forEach((node) => {
      starterTargets.set(node.course.code, starterCursor + height / 2);
    });
    starterCursor += height + STARTER_ROW_GAP;
  });
  const layers = new Map<number, CurriculumGraphNode[]>();
  nodes.forEach((node) => layers.set(node.layoutRank, [...(layers.get(node.layoutRank) ?? []), node]));
  const initialDesired = new Map<string, number>();
  nodes.forEach((node) => {
    if (starterTargets.has(node.course.code)) {
      initialDesired.set(node.course.code, starterTargets.get(node.course.code) as number);
      return;
    }
    const fieldCenter = fieldPlacement.centers.get(node.fieldId) ?? centerline;
    const branchOffset = (codeJitter(node.course.code) - 0.5) * 86;
    const fieldY = fieldCenter + branchOffset;
    initialDesired.set(node.course.code, centerline + (fieldY - centerline) * (1 - node.importanceScore * 0.42));
  });
  [...layers.keys()].sort((left, right) => left - right).forEach((rank) => packLayer(layers.get(rank) ?? [], initialDesired));
  const crossingCountBefore = crossingCount(nodes, edges);
  let bestCrossings = crossingCountBefore;
  let bestLength = verticalEdgeLength(nodes, edges);
  let bestY = new Map(nodes.map((node) => [node.course.code, node.y]));
  const orderedRanks = [...layers.keys()].sort((left, right) => left - right);

  for (let pass = 0; pass < LAYOUT_SWEEPS; pass += 1) {
    const forward = pass % 2 === 0;
    const ranks = forward ? orderedRanks : [...orderedRanks].reverse();
    ranks.forEach((rank) => {
      const layer = layers.get(rank) ?? [];
      const desired = new Map<string, number>();
      layer.forEach((node) => {
        if (starterTargets.has(node.course.code)) {
          desired.set(node.course.code, starterTargets.get(node.course.code) as number);
          return;
        }
        const relations = (forward ? predecessors.get(node.course.code) : dependents.get(node.course.code)) ?? [];
        const relatedNodes = relations.flatMap((code) => byCode.get(code) ? [byCode.get(code) as CurriculumGraphNode] : []);
        const relationY = relatedNodes.length > 0
          ? relatedNodes.reduce((sum, related) => sum + centerY(related), 0) / relatedNodes.length
          : fieldPlacement.centers.get(node.fieldId) ?? centerline;
        const fieldY = fieldPlacement.centers.get(node.fieldId) ?? centerline;
        const stability = node.importanceScore * 0.18;
        let targetY = relationY * 0.65 + fieldY * (0.35 - stability) + centerY(node) * stability;
        targetY = centerline + (targetY - centerline) * (1 - node.importanceScore * 0.4);
        desired.set(node.course.code, targetY);
      });
      packLayer(layer, desired);
    });
    const crossings = crossingCount(nodes, edges);
    const length = verticalEdgeLength(nodes, edges);
    if (crossings < bestCrossings || (crossings === bestCrossings && length < bestLength)) {
      bestCrossings = crossings;
      bestLength = length;
      bestY = new Map(nodes.map((node) => [node.course.code, node.y]));
    }
  }
  nodes.forEach((node) => { node.y = bestY.get(node.course.code) ?? node.y; });
  resolveCollisions(nodes);
  const minY = Math.min(...nodes.map((node) => node.y));
  if (minY < CANVAS_PADDING) nodes.forEach((node) => { node.y += CANVAS_PADDING - minY; });
  const provisionalHeight = Math.max(...nodes.map((node) => node.y + node.height)) + CANVAS_PADDING;
  const routedEdges = routeEdges(nodes, edges, provisionalHeight);
  const occupiedLabels: CurriculumGraphRect[] = [];
  const fields: CurriculumGraphField[] = fieldDefinitions.flatMap((definition) => {
    const members = nodes.filter((node) => node.fieldId === definition.id);
    if (members.length === 0) return [];
    // Raid 1 owns the starting presentation. Field mist/labels begin with the
    // later branch so they do not compete with the launch area.
    const branchMembers = members.filter((node) => node.course.originalTermId !== firstTermId);
    const bounds = boundsFor(branchMembers.length > 0 ? branchMembers : members, 78, 126);
    const labelBounds = placeFieldLabel(branchMembers.length > 0 ? branchMembers : members, bounds, nodes, occupiedLabels);
    occupiedLabels.push(labelBounds);
    return [{
      ...definition,
      centerY: fieldPlacement.centers.get(definition.id) ?? centerline,
      importance: fieldPlacement.importance.get(definition.id) ?? 0,
      bounds,
      labelBounds,
    }];
  });
  const startingRegion = starters.length > 0 ? boundsFor(starters, 34, 58) : { x: CANVAS_PADDING - 30, y: CANVAS_PADDING - 30, width: 250, height: 250 };
  const width = Math.max(...nodes.map((node) => node.x + node.width), ...fields.map((field) => field.bounds.x + field.bounds.width), ...fields.map((field) => field.labelBounds.x + field.labelBounds.width)) + CANVAS_PADDING;
  const height = Math.max(provisionalHeight, ...fields.map((field) => field.bounds.y + field.bounds.height), ...fields.map((field) => field.labelBounds.y + field.labelBounds.height)) + CANVAS_PADDING;
  return { nodes, fields, edges: routedEdges, startingRegion, width, height, crossingCountBefore, crossingCountAfter: crossingCount(nodes, edges) };
}

export function graphNodesOverlap(nodes: CurriculumGraphNode[]): boolean {
  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      const a = nodes[left];
      const b = nodes[right];
      if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) return true;
    }
  }
  return false;
}

export function countCurriculumEdgeCrossings(nodes: CurriculumGraphNode[], edges: CurriculumGraphEdge[]): number {
  return crossingCount(nodes, edges);
}
