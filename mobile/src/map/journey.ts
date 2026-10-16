// The trip map's data and layout, kept free of React Native so it can be unit-tested.
// Chapters and unit titles come from docs/curriculum/curriculum-plan.json (one source),
// ordered by each chapter's `number` (C16, the airport, is chapter 8).

export type PlanChapter = {
  id: string;
  number: number;
  title_he: string;
  units: { id: string; number: number; title_he: string }[];
};

export type JourneyChapter = {
  id: string;
  number: number;
  title: string;
  unitTitles: string[];
  open: boolean;
};

export function journeyFromPlan(chapters: readonly PlanChapter[], openChapterIds: readonly string[]): JourneyChapter[] {
  const open = new Set(openChapterIds);
  return [...chapters]
    .sort((a, b) => a.number - b.number)
    .map(chapter => ({
      id: chapter.id,
      number: chapter.number,
      title: chapter.title_he,
      unitTitles: [...chapter.units].sort((a, b) => a.number - b.number).map(unit => unit.title_he),
      open: open.has(chapter.id),
    }));
}

// Layout is computed for the real screen width, never by scaling a fixed-size canvas:
// in the app's right-to-left layout a narrower canvas sits at the right edge, and
// scaling it from the left pushed the map off the screen (found on Dor's iPhone).
// 390pt is the prototype's width and the default for tests.
export const MAP_WIDTH = 390;
const SIDE_MARGIN = 22;
export const POSTER = { width: 148, height: 196 };
export const STAMP = 76;
const POSTER_GAP = 250;
const STAMP_GAP = 120;
// Unit stamps zigzag right, centre, left under the open chapter's poster, as fractions
// of the width (the prototype's 300, 190 and 90 at 390pt).
const STAMP_X = [0.77, 0.49, 0.23];

export type PlacedPoster = { chapter: JourneyChapter; x: number; y: number; onRight: boolean };
export type PlacedStamp = { chapterId: string; index: number; title: string; x: number; y: number; current: boolean };
export type JourneyLayout = {
  posters: PlacedPoster[];
  stamps: PlacedStamp[];
  /** Route points: poster centres and stamp centres in travel order, then the finish. */
  route: [number, number][];
  /** How many route points belong to the open part (drawn as the active route). */
  openPoints: number;
  finishY: number;
  height: number;
};

export function layoutJourney(chapters: readonly JourneyChapter[], top = 130, width = MAP_WIDTH): JourneyLayout {
  const posters: PlacedPoster[] = [];
  const stamps: PlacedStamp[] = [];
  const route: [number, number][] = [];
  let openPoints = 0;
  let y = top;
  chapters.forEach((chapter, i) => {
    const onRight = i % 2 === 0;
    const x = onRight ? width - SIDE_MARGIN - POSTER.width : SIDE_MARGIN;
    posters.push({ chapter, x, y, onRight });
    route.push([x + POSTER.width / 2, y + POSTER.height / 2]);
    if (chapter.open) openPoints = route.length;
    y += POSTER_GAP;
    if (chapter.open) {
      chapter.unitTitles.forEach((title, u) => {
        const sy = y + u * STAMP_GAP;
        const sx = Math.round(width * STAMP_X[u % STAMP_X.length]);
        // Until saved progress drives this, the first unit of the first open chapter is current.
        stamps.push({ chapterId: chapter.id, index: u, title, x: sx, y: sy, current: stamps.length === 0 });
        route.push([sx, sy]);
      });
      openPoints = route.length;
      y += chapter.unitTitles.length * STAMP_GAP + 20;
    }
  });
  const finishY = y + 20;
  route.push([width / 2, finishY]);
  return { posters, stamps, route, openPoints, finishY, height: finishY + 140 };
}

// A smooth vertical S-curve through the points (cubic segments with vertical tangents).
export function routePath(points: readonly [number, number][]): string {
  return points.map(([x, y], i) => {
    if (i === 0) return `M${x} ${y}`;
    const [px, py] = points[i - 1];
    const my = (py + y) / 2;
    return `C${px} ${my} ${x} ${my} ${x} ${y}`;
  }).join('');
}
