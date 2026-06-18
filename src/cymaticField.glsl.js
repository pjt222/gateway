// Shared GLSL for the cymatic Bessel standing-wave field.
//
// Both the 3D nodal-shell shader (CymaticsCanvas3D) and the particle update +
// render shaders (CymaticsParticles3D) describe the SAME scalar field
// u(r,θ) = Σ ampᵢ·Jₙ(αᵢ·r)·[cos(nθ)·φx − sin(nθ)·φy], normalised by fieldNorm.
// Keeping the uniform contract and the field/lookup functions here means the
// math can't drift between visualizer modes.
//
// Contract: a shader that includes FIELD_FUNCS must also declare FIELD_UNIFORMS
// (the besselTex + 6-layer uniform block) and bind a Bessel lookup DataTexture
// identical to buildBesselTexture() (RedFormat, R = J_n(x) for n rows, x cols).

// viridis(t) — the same 5-stop polynomial approximation used across the app.
export const VIRIDIS_GLSL = /* glsl */`
vec3 viridis(float t) {
  const vec3 c0 = vec3(0.267, 0.005, 0.329);
  const vec3 c1 = vec3(0.230, 0.322, 0.546);
  const vec3 c2 = vec3(0.128, 0.567, 0.551);
  const vec3 c3 = vec3(0.365, 0.785, 0.388);
  const vec3 c4 = vec3(0.993, 0.906, 0.144);
  if (t < 0.25) return mix(c0, c1, t * 4.0);
  if (t < 0.50) return mix(c1, c2, (t - 0.25) * 4.0);
  if (t < 0.75) return mix(c2, c3, (t - 0.50) * 4.0);
  return mix(c3, c4, (t - 0.75) * 4.0);
}
`;

// Uniform block — must be declared by any shader that calls cymaticField().
export const FIELD_UNIFORMS = /* glsl */`
uniform sampler2D besselTex;
uniform float besselTexW;
uniform float besselNRows;
uniform float besselXMax;
uniform float layerN[6];
uniform float layerAlpha[6];
uniform float layerAmp[6];
uniform vec2  layerPhase[6];
uniform int   layerCount;
uniform float fieldNorm;
`;

// besselLookup + cymaticField. Depends on FIELD_UNIFORMS being declared above it.
export const FIELD_FUNCS = /* glsl */`
float besselLookup(float n, float x) {
  float xn = x / besselXMax;
  if (xn > 0.999) return 0.0;
  float pix = xn * (besselTexW - 1.0);
  float xi = floor(pix);
  float xf = pix - xi;
  float vCoord = (n + 0.5) / besselNRows;
  float u0 = (xi + 0.5) / besselTexW;
  float u1 = (xi + 1.5) / besselTexW;
  float b0 = texture2D(besselTex, vec2(u0, vCoord)).r;
  float b1 = texture2D(besselTex, vec2(u1, vCoord)).r;
  return b0 + xf * (b1 - b0);
}

// Signed, normalised standing-wave field at disc coord q (returns 0 outside |q|=1).
float cymaticField(vec2 q) {
  float r = length(q);
  if (r > 1.0) return 0.0;
  float th = atan(q.y, q.x);
  float u = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= layerCount) break;
    float n = layerN[i];
    float bv = besselLookup(n, layerAlpha[i] * r);
    float ang = cos(n * th) * layerPhase[i].x - sin(n * th) * layerPhase[i].y;
    u += layerAmp[i] * bv * ang;
  }
  return u * fieldNorm;
}
`;
