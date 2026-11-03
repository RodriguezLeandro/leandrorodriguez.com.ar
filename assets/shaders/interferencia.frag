// Interferencia — superposición de ondas circulares.
//
// Dos fuentes emiten ondas continuas: una gira lenta alrededor del centro y la
// otra sigue al puntero. Donde las crestas coinciden la superficie se eleva;
// donde una cresta encuentra un valle, se cancelan. Cada click suelta una
// gota con su propio frente, que se expande y se apaga.
// La luz se calcula con la normal de la superficie, que sale de la derivada
// analítica de cada onda (sin muestrear vecinos).

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2  u_resolution;
uniform float u_time;
uniform vec2  u_mouse;
uniform vec3  u_drops[8];   // (x, y) normalizados y momento del click; z < 0 = libre

// Paleta del sitio
const vec3 BG   = vec3(0.051, 0.043, 0.071);  // #0d0b12
const vec3 WARM = vec3(0.878, 0.478, 0.373);  // #e07a5f
const vec3 SOFT = vec3(0.941, 0.651, 0.557);  // #f0a68e
const vec3 COOL = vec3(0.545, 0.545, 1.000);  // #8b8bff

const float K = 32.0;   // número de onda
const float W = 6.0;    // frecuencia angular
const float C = W / K;  // velocidad de propagación

// Onda circular: devuelve (altura, ∂h/∂x, ∂h/∂y)
vec3 wave(vec2 p, vec2 src, float age, float amp) {
  vec2 d = p - src;
  float r = length(d) + 1e-4;
  float phase = K * r - W * age;
  float env = amp / (1.0 + 2.0 * r);
  return vec3(env * sin(phase), env * K * cos(phase) * d / r);
}

vec2 toScene(vec2 n) {
  return (2.0 * n * u_resolution - u_resolution) / u_resolution.y;
}

void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - u_resolution) / u_resolution.y;
  float t = u_time;

  // Fuentes continuas
  vec2 a = 0.55 * vec2(-cos(t * 0.17), sin(t * 0.23) * 0.6);
  vec2 b = toScene(u_mouse);
  vec3 sum = wave(uv, a, t, 0.55) + wave(uv, b, t, 0.55);

  // Gotas: solo existe la parte de la onda que el frente ya alcanzó
  for (int i = 0; i < 8; i++) {
    vec3 drop = u_drops[i];
    if (drop.z < 0.0) continue;
    float age = t - drop.z;
    if (age < 0.0 || age > 6.0) continue;
    vec2 src = toScene(drop.xy);
    float front = C * age;
    float r = length(uv - src);
    float reach = smoothstep(front + 0.04, front - 0.25, r);
    sum += wave(uv, src, age, 1.1 * exp(-0.7 * age)) * reach;
  }

  float h = sum.x;
  vec3 n = normalize(vec3(-0.03 * sum.yz, 1.0));

  // Luz cálida desde arriba a la izquierda; cámara cenital
  vec3 l = normalize(vec3(-0.25, 0.3, 0.92));
  float dif = max(dot(n, l), 0.0);
  float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0);
  float fres = pow(1.0 - n.z, 1.5);

  vec3 col = mix(BG * 0.8, COOL * 0.42, smoothstep(-0.45, 0.45, h));
  col *= 0.35 + 0.75 * dif;
  col += WARM * smoothstep(0.3, 0.9, abs(h)) * 0.5;  // interferencia constructiva
  col += SOFT * spec * 0.9;
  col += COOL * fres * 0.4;

  // Viñeta
  col = mix(BG, col, 1.0 - smoothstep(0.7, 2.0, length(uv)));
  gl_FragColor = vec4(col, 1.0);
}
