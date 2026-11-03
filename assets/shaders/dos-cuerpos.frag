// Dos cuerpos — una escena 3D hecha solo de matemática.
//
// No hay mallas ni polígonos: cada figura es una función de distancia con
// signo (SDF) armada con cápsulas y esferas, y la imagen se obtiene con
// ray marching. Las dos figuras bailan, en posición cerrada, el paso básico
// de bachata a 130 BPM: tres pasos hacia un lado y un tap, y vuelta.
// Iluminación: un reflector cálido con sombras suaves, contraluz frío,
// oclusión ambiental y un haz de luz volumétrico aproximado.

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2  u_resolution;
uniform float u_time;
uniform vec2  u_mouse;

// Paleta del sitio
const vec3 BG   = vec3(0.051, 0.043, 0.071);  // #0d0b12
const vec3 WARM = vec3(0.878, 0.478, 0.373);  // #e07a5f
const vec3 COOL = vec3(0.545, 0.545, 1.000);  // #8b8bff
const vec3 SKIN = vec3(0.953, 0.937, 0.914);  // #f3efe9

const float PI   = 3.14159265;
const float BPM  = 130.0;
const float STEP = 0.36;   // largo de cada paso
const float FEET = 0.11;   // media separación entre los pies
const float GAP  = 0.36;   // distancia de cada figura al centro de la pareja
const vec3  SPOT = vec3(0.0, 4.6, 0.5);

// Estado de la coreografía: depende solo del tiempo, se calcula una vez por píxel
float gHipX, gDip, gTap, gSide;
vec2  gFootA, gFootB;  // (x, altura) de cada pie

// ---------- Primitivas ----------

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Unión suave: funde dos superficies dentro de un radio k
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

// ---------- Coreografía ----------

float ease(float u) { return smoothstep(0.0, 1.0, clamp(u, 0.0, 1.0)); }
float bump(float u) { return sin(PI * clamp(u, 0.0, 1.0)); }

// Cuenta de 8: 1-2-3 pasos y 4 tap hacia un lado; 5-6-7 y 8 tap de vuelta.
// Se calcula el medio ciclo "hacia +x" y se espeja para la vuelta.
void choreography(float t) {
  float c = mod(t * BPM / 60.0, 8.0);
  float k = mod(c, 4.0);
  gSide = c < 4.0 ? 1.0 : -1.0;

  // Pie que guía: sale en el 1 y en el 3. Pie que sigue: cierra en el 2 y en el 4 (tap).
  float lead  = -STEP + FEET + STEP * (ease(k) + ease(k - 2.0));
  float trail = -STEP - FEET + STEP * (ease(k - 1.0) + ease(k - 3.0));
  gFootA = vec2(gSide * lead,  0.07 * (bump(k) + bump(k - 2.0)));
  gFootB = vec2(gSide * trail, 0.07 * bump(k - 1.0) + 0.04 * bump(k - 3.0));

  gHipX = 0.5 * (gFootA.x + gFootB.x);
  gTap  = bump(k - 3.0);
  gDip  = 0.035 * (bump(k) + bump(k - 1.0) + bump(k - 2.0));
}

// ---------- Escena ----------

float dancer(vec3 p, float z) {
  vec3 hip   = vec3(gHipX + gSide * 0.05 * gTap, 0.86 - gDip, z);
  vec3 chest = vec3(gHipX - gSide * 0.02 * gTap, 1.30 - gDip, z);
  float d = sdCapsule(p, hip, chest, 0.19);
  d = smin(d, length(p - chest - vec3(0.0, 0.33, 0.0)) - 0.14, 0.08);  // cabeza

  vec3 footA = vec3(gFootA.x, 0.06 + gFootA.y, z);
  vec3 footB = vec3(gFootB.x, 0.06 + gFootB.y, z);
  vec3 hipA  = hip + vec3(clamp(footA.x - hip.x, -0.07, 0.07), -0.05, 0.0);
  vec3 hipB  = hip + vec3(clamp(footB.x - hip.x, -0.07, 0.07), -0.05, 0.0);
  float legs = min(sdCapsule(p, hipA, footA, 0.065), sdCapsule(p, hipB, footB, 0.065));
  return smin(d, legs, 0.10);
}

float figuresExact(vec3 p) {
  float d = min(dancer(p, -GAP), dancer(p, GAP));

  // Marco: abrazo de un lado y manos tomadas del otro
  float y = 1.24 - gDip;
  vec3 hand = vec3(gHipX + 0.46, y - 0.08, 0.0);
  float arms = sdCapsule(p, vec3(gHipX - 0.17, y, -GAP), vec3(gHipX - 0.17, y + 0.02, GAP), 0.05);
  arms = min(arms, sdCapsule(p, vec3(gHipX + 0.17, y, -GAP), hand, 0.05));
  arms = min(arms, sdCapsule(p, vec3(gHipX + 0.17, y,  GAP), hand, 0.05));

  // La conexión se ensancha en cada tap
  return smin(d, arms, 0.12 + 0.06 * gTap);
}

// Para marchar rayos: lejos de la pareja alcanza con la distancia a una caja
// envolvente (una cota inferior), mucho más barata que evaluar las figuras
float figures(vec3 p) {
  float bound = sdBox(p - vec3(gHipX, 0.92, 0.0), vec3(0.85, 0.95, 0.70));
  if (bound > 0.25) return bound;
  return figuresExact(p);
}

// La oclusión necesita distancias reales, no cotas
float scene(vec3 p) { return min(p.y, figuresExact(p)); }

vec3 normalAt(vec3 p) {
  const vec2 e = vec2(0.0015, -0.0015);
  return normalize(e.xyy * figures(p + e.xyy) + e.yyx * figures(p + e.yyx) +
                   e.yxy * figures(p + e.yxy) + e.xxx * figures(p + e.xxx));
}

// Sombra suave: cuánto se acercó el rayo a la superficie en el camino a la luz
float softShadow(vec3 ro, vec3 rd, float maxT) {
  float res = 1.0;
  float t = 0.02;
  for (int i = 0; i < 28; i++) {
    float h = figures(ro + rd * t);
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.02, 0.25);
    if (res < 0.002 || t > maxT) break;
  }
  return clamp(res, 0.0, 1.0);
}

// Oclusión ambiental: muestrea la distancia a lo largo de la normal
float occlusion(vec3 p, vec3 n) {
  float occ = 0.0;
  float w = 1.0;
  for (int i = 1; i <= 5; i++) {
    float h = 0.02 + 0.08 * float(i);
    occ += (h - scene(p + n * h)) * w;
    w *= 0.7;
  }
  return clamp(1.0 - 2.0 * occ, 0.0, 1.0);
}

// Cono del reflector: 1 dentro del haz, 0 fuera
float spotMask(vec3 p) {
  vec3 axis = normalize(vec3(0.0, 0.0, 0.0) - SPOT);
  return smoothstep(0.915, 0.955, dot(normalize(p - SPOT), axis));
}

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 toLinear(vec3 c) { return c * c; }

void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - u_resolution) / u_resolution.y;
  choreography(u_time);

  // Cámara orbital controlada por el puntero
  float ang = 0.85 + (u_mouse.x - 0.5) * 3.0;
  float h   = 1.3 + (u_mouse.y - 0.5) * 1.6;
  vec3 ta = vec3(gHipX * 0.4, 0.82, 0.0);
  vec3 ro = ta + vec3(3.6 * sin(ang), h - 0.82, 3.6 * cos(ang));
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

  vec3 warmLight = toLinear(mix(SKIN, WARM, 0.35));
  vec3 cool = toLinear(COOL);
  vec3 bg = toLinear(BG);

  // El piso (y = 0) se interseca de forma analítica; solo se marchan las figuras
  float tFloor = rd.y < 0.0 ? -ro.y / rd.y : 1e3;
  float t = 0.0;
  bool hit = false;
  for (int i = 0; i < 96; i++) {
    float d = figures(ro + rd * t);
    if (d < 0.0008 * t) { hit = true; break; }
    t += d;
    if (t > tFloor || t > 14.0) break;
  }

  vec3 col = bg * (1.0 + 0.6 * uv.y);
  float tEnd = 14.0;

  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = normalAt(p);
    vec3 l = normalize(SPOT - p);
    float ao = occlusion(p, n);
    float dif = max(dot(n, l), 0.0) * spotMask(p) * softShadow(p + n * 0.01, l, 6.0);
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    float back = max(dot(n, normalize(vec3(-0.6, 0.35, -0.8))), 0.0);

    vec3 albedo = toLinear(SKIN) * 0.8;
    col = albedo * (dif * warmLight * 1.8 + ao * (cool * 0.05 + 0.015));
    col += cool * (0.35 * rim + 0.25 * back) * ao;
    col += toLinear(WARM) * 0.12 * gTap * ao;  // el tap se siente
    tEnd = t;
  } else if (tFloor < 14.0) {
    vec3 p = ro + rd * tFloor;
    vec3 l = normalize(SPOT - p);
    float light = spotMask(p) * softShadow(p + vec3(0.0, 0.01, 0.0), l, 6.0);
    float ao = occlusion(p, vec3(0.0, 1.0, 0.0));

    // Grilla tenue fuera del haz: el escenario también es código
    vec2 g = abs(fract(p.xz * 2.0 + 0.5) - 0.5) * 0.5;
    float line = 1.0 - smoothstep(0.0, 0.004 + 0.0025 * tFloor, min(g.x, g.y));
    line *= exp(-0.22 * tFloor);

    col = bg * 1.6 + warmLight * 0.4 * light;
    col += cool * 0.10 * line * (1.0 - light);
    col *= ao;
    tEnd = tFloor;
  }

  // Niebla hacia el fondo
  col = mix(col, bg, 1.0 - exp(-0.004 * tEnd * tEnd));

  // Haz volumétrico: se acumula la luz del cono a lo largo del rayo
  float vol = 0.0;
  float maxT = min(tEnd, 9.0);
  float dt = maxT / 16.0;
  float jitter = hash(gl_FragCoord.xy);
  for (int i = 0; i < 16; i++) {
    vec3 q = ro + rd * (dt * (float(i) + jitter));
    vol += spotMask(q) * smoothstep(4.8, 0.0, q.y);
  }
  col += warmLight * vol * dt * 0.035;

  gl_FragColor = vec4(sqrt(clamp(col, 0.0, 1.0)), 1.0);
}
