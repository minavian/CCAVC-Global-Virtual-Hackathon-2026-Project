// The reader's sizes (metres; its centre at the origin, its top facing +z). Kept apart from
// reader-model.js, which needs three.js, so the close-up's plan (cinema.js) and the drag
// still work if the 3D never loads.
export const SIZE = .092;          // 92 mm square
export const HEIGHT = .015;        // 15 mm thin
export const TOP = HEIGHT / 2;     // the top surface, measured from the centre
export const COIL_Z = TOP - .0024; // the coil sits just under the glass
export const COIL_HALF = .036;     // the coil's outer turn, half its width
export const COIL_RADIUS = .016;   // the outer turn's corner radius
export const CHIP = Object.freeze({ x: .016, y: -.018, z: -TOP + .0049 }); // the reader's chip
