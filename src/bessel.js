/**
 * Bessel function J_n(x) lookup tables for cymatic standing wave field.
 * Precomputes J_0..J_6 at construction time using the Taylor series, then
 * exposes them as Float32Array tables for tight per-pixel inner loops.
 */

// m-th positive zero of J_n, n=0..6, m=1..4. Used as alpha_{n,m}/R wavenumber
// so that the field vanishes on the disc boundary (clamped circular plate).
export const BESSEL_ZEROS = [
  [2.4048, 5.5201, 8.6537, 11.7915],
  [3.8317, 7.0156, 10.1735, 13.3237],
  [5.1356, 8.4172, 11.6198, 14.7960],
  [6.3802, 9.7610, 13.0152, 16.2235],
  [7.5883, 11.0647, 14.3725, 17.6160],
  [8.7715, 12.3386, 15.7002, 18.9801],
  [9.9361, 13.5893, 17.0038, 20.3208],
];

export const BESSEL_N_MAX = 6;
export const BESSEL_TABLE_SIZE = 512;
export const BESSEL_X_MAX = 21; // covers max zero ≈ 20.32 with headroom
export const BESSEL_TS = BESSEL_TABLE_SIZE / BESSEL_X_MAX;

function besselJSeries(n, x) {
  if (x === 0) return n === 0 ? 1 : 0;
  const half = x / 2;
  let nFact = 1;
  for (let i = 2; i <= n; i++) nFact *= i;
  let term = Math.pow(half, n) / nFact;
  let sum = term;
  const halfSq = half * half;
  for (let k = 1; k < 80; k++) {
    term *= -halfSq / (k * (n + k));
    sum += term;
    if (Math.abs(term) < 1e-15 * Math.abs(sum)) break;
  }
  return sum;
}

export const J_TABLE = [];
for (let n = 0; n <= BESSEL_N_MAX; n++) {
  const arr = new Float32Array(BESSEL_TABLE_SIZE + 1);
  for (let i = 0; i <= BESSEL_TABLE_SIZE; i++) {
    const x = (i / BESSEL_TABLE_SIZE) * BESSEL_X_MAX;
    arr[i] = besselJSeries(n, x);
  }
  J_TABLE.push(arr);
}

export function besselJ(n, x) {
  const ax = Math.abs(x);
  if (ax >= BESSEL_X_MAX || n < 0 || n > BESSEL_N_MAX) return 0;
  const idx = ax * BESSEL_TS;
  const i0 = idx | 0;
  const frac = idx - i0;
  const t = J_TABLE[n];
  return t[i0] + frac * (t[i0 + 1] - t[i0]);
}
