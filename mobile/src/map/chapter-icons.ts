// One stroke icon per chapter topic (24x24, drawn with round caps), keyed by chapter id.
// Each entry is a list of SVG path strings so the map can draw any of them the same way.

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const roundedBox = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;

export const chapterIcons: Record<string, string[]> = {
  C01: ['M4 5h16v10H9l-5 4V5z'], // first conversation: speech bubble
  C02: [circle(9, 8, 3.5), 'M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5', 'M16 4.8a3.5 3.5 0 0 1 0 6.4', 'M18 14.8c1.8.7 3 2.4 3.5 5.2'],
  C03: ['M12 3v18', 'M5 6h11l3 2.5L16 11H5z', 'M19 13H8l-3 2.5L8 18h11z'],
  C04: ['M7 3v8a2 2 0 0 0 4 0V3', 'M9 11v10', 'M17 3c-2 1.5-3 4-3 7h3v11'],
  C05: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6', 'M9 12h6'],
  C06: ['M3 18V7', 'M3 14h18v4', 'M21 14v-3a3 3 0 0 0-3-3h-7v6', circle(7, 10.5, 1.8)],
  C07: [roundedBox(5, 3, 14, 15, 3), 'M5 11h14', 'M8 18v2', 'M16 18v2'],
  C16: ['M10.5 13.5 3 11l1.5-1.5 7 .5 5-5c1-1 2.5-1 3 0s0 2-1 3l-5 5 .5 7-1.5 1.5-2.5-7.5z'],
  C08: ['M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z', 'M14 8v2', 'M14 12v2', 'M14 16v1'],
  C09: ['M5 8h14l-1 13H6z', 'M9 8a3 3 0 0 1 6 0'],
  C10: ['M2.5 9a14 14 0 0 1 19 0', 'M5.5 12.5a9.5 9.5 0 0 1 13 0', 'M8.7 16a5 5 0 0 1 6.6 0', circle(12, 19.5, 1)],
  C11: ['M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z'],
  C12: ['M3 20 10 8l4 6 2-3 5 9z', 'M10 8V3l4 1.5L10 6'],
  C13: [roundedBox(3.5, 5, 17, 15, 2.5), 'M3.5 10h17', 'M8 3v4', 'M16 3v4'],
  C14: ['M12 20s-8-4.7-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.3 12 20 12 20z', 'M7 12h3l1.5-2.5 2 4L15 12h2'],
  C15: [circle(11, 11, 6.5), 'm20 20-4.3-4.3'],
};
