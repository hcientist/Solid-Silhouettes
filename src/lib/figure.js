/* The silhouette, drawn as a set of pattern pieces rather than one body.
   Pieces meet at seams, which is exactly where a garment changes hands:
   the head piece is the glasses, the torso piece is the shirt, the leg
   piece is the pants, the foot piece is the shoes.

   Proportions follow the seven-and-a-half head canon a pattern cutter
   would use. One head = 56 units; crown at 20, sole at 442. The drawing
   sits left of centre so the keyed letters have a column of their own. */

export const VIEW = { w: 240, h: 470 };

export const PIECES = {
  glasses: 'M 110 20 C 122 20 130 32 130 48 C 130 65 122 76 110 76 C 98 76 90 65 90 48 C 90 32 98 20 110 20 Z',

  shirt:
    'M 100 91 Q 110 99 120 91 L 162 103 Q 178 148 174 252 Q 165 258 156 252 ' +
    'Q 160 170 148 124 Q 143 156 140 190 Q 110 196 80 190 Q 77 156 72 124 ' +
    'Q 60 170 64 252 Q 55 258 46 252 Q 42 148 58 103 Z',

  // The top of the pants traces the same curve as the bottom of the shirt,
  // so the two pieces read as one waist seam rather than two edges.
  pants:
    'M 80 190 Q 110 196 140 190 Q 148 206 148 230 Q 142 330 134 418 L 118 418 ' +
    'Q 121 330 110 246 Q 99 330 102 418 L 86 418 Q 78 330 72 230 Q 72 206 80 190 Z',

  shoes:
    'M 86 420 L 102 420 L 103 432 Q 103 442 93 442 L 62 442 Q 54 442 55 435 ' +
    'Q 56 428 68 425 Q 80 422 86 420 Z ' +
    'M 134 420 L 118 420 L 117 432 Q 117 442 127 442 L 158 442 Q 166 442 165 435 ' +
    'Q 164 428 152 425 Q 140 422 134 420 Z'
};

/** The neck joins the head piece to the shirt. Not a piece of its own. */
export const NECK = 'M 101 71 L 100 92 M 119 71 L 120 92';

/** Chalked onto the face once there is a prescription on file. */
export const SPECTACLES =
  'M 92 49 a 8 6.5 0 1 0 16 0 a 8 6.5 0 1 0 -16 0 ' +
  'M 112 49 a 8 6.5 0 1 0 16 0 a 8 6.5 0 1 0 -16 0 ' +
  'M 108 47 L 112 47 M 92 47 L 85 45 M 128 47 L 135 45';

/* Markings a real pattern piece carries: a grainline arrow down the centre
   front, and notches where two pieces are meant to line up. */
export const GRAINLINE =
  'M 110 128 L 110 178 M 105 134 L 110 127 L 115 134 M 105 172 L 110 179 L 115 172';

export const NOTCHES = 'M 140 176 L 147 176 M 80 176 L 73 176';

export const FLOOR = 'M 28 446 L 192 446';

/** The whole figure as one line, for the nest and the empty state. */
export const OUTLINE = [PIECES.glasses, NECK, PIECES.shirt, PIECES.pants, PIECES.shoes].join(' ');

/* Where each keyed letter sits, and where its leader line starts on the body */
export const KEYS = {
  glasses: { at: [216, 48], from: [132, 48] },
  shirt: { at: [216, 142], from: [172, 142] },
  pants: { at: [216, 308], from: [145, 308] },
  shoes: { at: [216, 430], from: [167, 434] }
};

/* Sizes on a graded pattern are told apart by line style, not colour alone */
export const GRADE_DASHES = ['0', '9 5', '2 5', '14 4 2 4', '5 4', '1 4'];

/** The figure scales with the person. No height on file: assume adult-ish. */
export function scaleFor(heightCm, tallestCm) {
  const h = heightCm || 168;
  const t = tallestCm || 168;
  return Math.max(0.42, Math.min(1, h / t));
}

/** Grow from the floor, the way a person stands on it. */
export function standOn(scale) {
  const floorY = 444;
  return `translate(110 ${floorY}) scale(${scale}) translate(-110 ${-floorY})`;
}
