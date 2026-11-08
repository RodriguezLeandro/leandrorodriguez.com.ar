# leandrorodriguez.com.ar

Sitio personal de **Leandro Rodríguez** — código, escenario y movimiento.
Web estática (HTML + CSS + JS, sin build ni dependencias). Accesible, responsive y optimizada para SEO.

## Estructura

```
.
├── index.html            # Página principal con todas las secciones
├── clases/index.html     # Clases particulares de programación e IA (/clases/)
├── assets/
│   ├── css/styles.css     # Estilos
│   ├── js/main.js         # Menú móvil, revelado al scroll, header
│   ├── js/shaders.js      # Motor WebGL: fondo del inicio y laboratorio de Proyectos
│   ├── shaders/           # Piezas GLSL (flujo, dos-cuerpos, interferencia)
│   ├── img/               # Fotos y pósters
│   └── video/             # Videos de la Bitácora
├── robots.txt
├── sitemap.xml
└── README.md
```

## Cómo verlo localmente

Serví la carpeta (los shaders se cargan con `fetch`, así que abrir `index.html` como archivo no alcanza):

```bash
python -m http.server 8000
```

Luego entrá a http://localhost:8000

## Cómo publicarlo

Al ser 100% estático, se puede hostear gratis en **Netlify**, **Vercel**, **GitHub Pages** o **Cloudflare Pages**:
subís esta carpeta y apuntás el dominio `leandrorodriguez.com.ar` (registrado en NIC.ar) al hosting.

## Contenido: hechos vs. pendientes

Todo el texto usa **solo datos confirmados** del contexto maestro. Lo que falta o debe verificarse
está marcado en los comentarios del HTML con `[VERIFICAR]` y `[FALTA INFORMACIÓN]`.

### Datos ya confirmados (desde el CV)
- [x] **Correo**: leandrorodriguez@dc.uba.ar
- [x] **LinkedIn**: linkedin.com/in/leandro-rodriguez
- [x] **GitHub**: github.com/rodriguezleandro
- [x] **Retrato** del hero (Puerto Madero)
- [x] **Tecnología**: stack, trayectoria, formación e idiomas (desde el CV)

### Datos que aún faltan
- [ ] Enlaces de **Threads y Facebook** (si se quieren sumar)
- [ ] **¿Publicar teléfono?** El CV incluye un número — NO se publicó por defecto. Confirmar si se agrega.
- [ ] **¿Publicar el CV en PDF para descarga?** Contiene el teléfono; requiere confirmación.
- [ ] `og-cover.jpg` (1200×630) dedicada para compartir en redes (hoy usa el retrato)
- [ ] **Actuación**: detalles de Juglares, obras y personajes (sin inventar) + fotos
- [ ] **Bachata**: fecha de inicio, academias/profesores, nombre y estado exacto del instructorado, videos
- [x] **Proyectos**: laboratorio de shaders + ShootBossBunnyes, challenge de Mercado Libre y este sitio
- [ ] **Proyectos**: sumar VR, contenido o actuación cuando haya proyectos reales con enlace

> Nota de precisión (según el contexto maestro): no se te presenta como instructor de bachata mientras
> curses el instructorado, ni se afirma que dejaste la programación o que vivís de la bachata.
