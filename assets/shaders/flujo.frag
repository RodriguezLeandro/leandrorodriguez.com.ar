// Flujo — ruido fractal deformado sobre sí mismo (domain warping).
//
// Un fBm (suma de octavas de ruido) se evalúa sobre coordenadas que ya fueron
// desplazadas por otro fBm, y esas a su vez por otro: q → r → f. El resultado
// se parece a tinta disolviéndose en agua. El puntero hace girar el espacio
// a su alrededor y desvía la corriente.

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2  u_resolution;  // tamaño del canvas en píxeles
uniform float u_time;        // segundos
uniform vec2  u_mouse;       // puntero normalizado (0..1), origen abajo a la izquierda
uniform float u_intensity;   // 1.0 en el laboratorio; menos como fondo del inicio

// Paleta del sitio
const vec3 BG   = vec3(0.051, 0.043, 0.071);  // #0d0b12
const vec3 WARM = vec3(0.878, 0.478, 0.373);  // #e07a5f
const vec3 SOFT = vec3(0.941, 0.651, 0.557);  // #f0a68e
const vec3 COOL = vec3(0.545, 0.545, 1.000);  // #8b8bff

// Hash sin funciones trigonométricas: más estable en GPUs móviles
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Ruido de valor: interpola valores aleatorios de una grilla con una curva suave
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// fBm: cada octava duplica la frecuencia y reduce la amplitud a la mitad.
// Rotar entre octavas evita que se noten los ejes de la grilla.
const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = ROT * p * 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - u_resolution) / u_resolution.y;
  vec2 m  = (2.0 * u_mouse * u_resolution - u_resolution) / u_resolution.y;
  float t = u_time * 0.07;

  // Remolino alrededor del puntero: el ángulo de giro decae con la distancia
  vec2 d = uv - m;
  float swirl = 1.8 * exp(-2.2 * dot(d, d));
  float s = sin(swirl);
  float c = cos(swirl);
  vec2 p = (m + mat2(c, s, -s, c) * d) * 1.35;

  // Domain warping en dos niveles
  vec2 q = vec2(fbm(p + t),
                fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + 1.4 * t),
                fbm(p + 4.0 * q + vec2(8.3, 2.8) - 1.1 * t));
  float f = fbm(p + 4.0 * r);

  // Frío en los valles, cálido en las crestas
  vec3 col = mix(BG, COOL * 0.45, clamp(length(q) * length(q) * 1.1, 0.0, 1.0));
  col = mix(col, WARM, smoothstep(0.35, 0.85, f) * 0.85);
  col = mix(col, SOFT, smoothstep(0.55, 1.0, r.x * f) * 0.5);
  col *= 0.25 + 1.1 * f * f + 0.25 * r.y;

  // Viñeta suave
  col *= 1.0 - 0.28 * dot(uv * 0.55, uv * 0.55);

  col = mix(BG, col, u_intensity);
  gl_FragColor = vec4(col, 1.0);
}
