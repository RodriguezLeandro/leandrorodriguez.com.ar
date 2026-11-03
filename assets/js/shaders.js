/* Laboratorio de shaders — WebGL puro, sin dependencias.
   Un mismo motor dibuja el fondo del inicio y las piezas de la sección Proyectos. */
(function () {
  "use strict";

  var VERTEX_SRC =
    "attribute vec2 a_position;\n" +
    "void main() { gl_Position = vec4(a_position, 0.0, 1.0); }";

  var MAX_DROPS = 8;
  var reducedMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Las fuentes .frag se piden una sola vez y se comparten entre el motor y el visor de código */
  var sourceCache = {};
  var loadSource = function (url) {
    if (!sourceCache[url]) {
      sourceCache[url] = fetch(url).then(function (res) {
        if (!res.ok) throw new Error(url + " → HTTP " + res.status);
        return res.text();
      });
    }
    return sourceCache[url];
  };

  var compileShader = function (gl, type, src) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(log);
    }
    return shader;
  };

  var linkProgram = function (gl, fragSrc) {
    var program = gl.createProgram();
    gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC));
    gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragSrc));
    gl.bindAttribLocation(program, 0, "a_position");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    // Un uniform que el shader no usa devuelve null y gl.uniform* lo ignora
    return {
      program: program,
      resolution: gl.getUniformLocation(program, "u_resolution"),
      time: gl.getUniformLocation(program, "u_time"),
      mouse: gl.getUniformLocation(program, "u_mouse"),
      intensity: gl.getUniformLocation(program, "u_intensity"),
      drops: gl.getUniformLocation(program, "u_drops")
    };
  };

  /* ------------------------------------------------------------
     Renderer: un canvas, un contexto WebGL y un programa activo.
     - Solo dibuja cuando el canvas está en pantalla y la pestaña visible.
     - Escala adaptativa: si los cuadros tardan, baja la resolución.
     ------------------------------------------------------------ */
  var createRenderer = function (canvas, options) {
    var opts = options || {};
    var gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false }) ||
             canvas.getContext("experimental-webgl");
    if (!gl) return null;

    var maxDpr = opts.maxDpr || 1.5;
    var scale = opts.scale || 1;
    var minScale = opts.minScale || 0.5;
    var adaptive = !!opts.adaptive;
    var intensity = opts.intensity == null ? 1 : opts.intensity;

    var active = null;        // programa en uso
    var currentUrl = null;
    var programs = {};
    var time = 0;
    var playing = !reducedMotion;
    var onScreen = false;
    var rafId = 0;
    var last = 0;
    var mouse = (opts.mouse || [0.5, 0.5]).slice();
    var target = mouse.slice();
    var drops = new Float32Array(MAX_DROPS * 3);
    var nextDrop = 0;
    var frames = 0, statTime = 0, slowFrames = 0, fastFrames = 0;
    var baseline = 0;         // intervalo natural entre cuadros (pantalla o límite del navegador)
    var lost = false;

    var resetDrops = function () {
      for (var i = 0; i < MAX_DROPS; i++) drops[i * 3 + 2] = -1;
    };
    resetDrops();

    var setupGeometry = function () {
      // Un triángulo que cubre toda la pantalla (más simple que dos)
      var buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    };
    setupGeometry();

    var resize = function () {
      var dpr = Math.min(window.devicePixelRatio || 1, maxDpr) * scale;
      var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    var draw = function () {
      if (!active || lost) return;
      resize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(active.program);
      gl.uniform2f(active.resolution, canvas.width, canvas.height);
      gl.uniform1f(active.time, time);
      gl.uniform2f(active.mouse, mouse[0], mouse[1]);
      gl.uniform1f(active.intensity, intensity);
      if (active.drops) gl.uniform3fv(active.drops, drops);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    // Mide el ritmo de requestAnimationFrame sin dibujar: así un navegador que limita
    // a 30 cuadros por segundo no se confunde con una GPU lenta
    var calibrate = function () {
      var samples = [];
      var prev = 0;
      var tick = function (now) {
        if (prev) samples.push(now - prev);
        prev = now;
        if (samples.length < 12) requestAnimationFrame(tick);
        else baseline = samples.sort(function (a, b) { return a - b; })[6];
      };
      requestAnimationFrame(tick);
    };
    if (adaptive) calibrate();

    var adapt = function (dt) {
      if (!adaptive || !baseline) return;
      if (dt > Math.max(baseline * 1.4, 1000 / 50)) { slowFrames++; fastFrames = 0; }
      else if (dt < baseline * 1.15) { fastFrames++; slowFrames = 0; }
      if (slowFrames > 20 && scale > minScale) {
        scale = Math.max(minScale, scale * 0.8);
        slowFrames = 0;
      } else if (fastFrames > 120 && scale < 1) {
        scale = Math.min(1, scale * 1.15);
        fastFrames = 0;
      }
    };

    var frame = function (now) {
      rafId = 0;
      var dt = last ? Math.min(now - last, 100) : 16;
      last = now;

      if (playing) time += dt / 1000;

      // El puntero se suaviza para que la cámara y el flujo no salten
      var k = 1 - Math.exp(-dt / 140);
      var dx = target[0] - mouse[0], dy = target[1] - mouse[1];
      mouse[0] += dx * k;
      mouse[1] += dy * k;
      var settling = Math.abs(dx) + Math.abs(dy) > 0.0005;

      draw();

      if (playing) {
        adapt(dt);
        frames++;
        statTime += dt;
        if (statTime >= 500 && opts.onStats) {
          opts.onStats({ fps: Math.round(frames * 1000 / statTime), width: canvas.width, height: canvas.height });
          frames = 0;
          statTime = 0;
        }
      }
      if (playing || settling) schedule();
      else last = 0;
    };

    var schedule = function () {
      if (!rafId && onScreen && !document.hidden && active && !lost) {
        rafId = requestAnimationFrame(frame);
      }
    };

    // Pedir un cuadro nuevo aunque esté en pausa (resize, puntero, cambio de pieza)
    var invalidate = schedule;

    /* Visibilidad: no gastar GPU fuera de pantalla */
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        if (onScreen) { last = 0; invalidate(); }
      }).observe(canvas);
    } else {
      onScreen = true;
    }
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) { last = 0; invalidate(); }
    });
    if ("ResizeObserver" in window) {
      new ResizeObserver(invalidate).observe(canvas);
    } else {
      window.addEventListener("resize", invalidate);
    }

    /* Pérdida de contexto (GPU reiniciada, demasiadas pestañas): recompilar al volver */
    canvas.addEventListener("webglcontextlost", function (e) {
      e.preventDefault();
      lost = true;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    });
    canvas.addEventListener("webglcontextrestored", function () {
      lost = false;
      programs = {};
      active = null;
      setupGeometry();
      if (currentUrl) api.load(currentUrl);
    });

    var api = {
      load: function (url) {
        currentUrl = url;
        return loadSource(url).then(function (src) {
          if (url !== currentUrl) return;   // el usuario ya eligió otra pieza
          if (!programs[url]) programs[url] = linkProgram(gl, src);
          active = programs[url];
          resetDrops();
          scale = opts.scale || 1;
          last = 0;
          invalidate();
        });
      },
      setPointer: function (x, y) {
        target[0] = x;
        target[1] = y;
        invalidate();
      },
      addDrop: function (x, y) {
        drops[nextDrop * 3] = x;
        drops[nextDrop * 3 + 1] = y;
        drops[nextDrop * 3 + 2] = time;
        nextDrop = (nextDrop + 1) % MAX_DROPS;
        invalidate();
      },
      setPlaying: function (value) {
        playing = value;
        last = 0;
        invalidate();
      },
      isPlaying: function () { return playing; }
    };
    return api;
  };

  /* Coordenadas del puntero normalizadas al elemento (0..1, origen abajo a la izquierda) */
  var pointerPos = function (e, el) {
    var rect = el.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height))
    ];
  };

  /* ============================================================
     Fondo del inicio
     ============================================================ */
  var hero = document.querySelector(".hero");
  var heroCanvas = document.querySelector(".hero-canvas");
  if (hero && heroCanvas) {
    var heroGl = createRenderer(heroCanvas, {
      scale: 0.5, maxDpr: 1, intensity: 0.5, mouse: [0.78, 0.62]
    });
    if (heroGl) {
      heroGl.load(heroCanvas.getAttribute("data-shader")).then(function () {
        hero.classList.add("has-shader");
      }).catch(function (err) {
        console.warn("Fondo del inicio sin shader:", err);
      });
      hero.addEventListener("pointermove", function (e) {
        if (e.pointerType !== "mouse") return;
        var p = pointerPos(e, hero);
        heroGl.setPointer(p[0], p[1]);
      });
    }
  }

  /* ============================================================
     Laboratorio (sección Proyectos)
     ============================================================ */
  var lab = document.querySelector(".lab");
  if (!lab) return;

  var labCanvas = lab.querySelector(".lab-canvas");
  var tabs = Array.prototype.slice.call(lab.querySelectorAll(".lab-tab"));
  var playBtn = lab.querySelector(".lab-play");
  var hud = lab.querySelector("[data-hud]");
  var codeEl = lab.querySelector("[data-code]");
  var codeName = lab.querySelector("[data-code-name]");
  var codeLink = lab.querySelector("[data-code-link]");
  var errorEl = lab.querySelector(".lab-error");
  var labGl = null;
  var started = false;

  /* Resaltado de sintaxis GLSL mínimo: comentarios, preprocesador, números, tipos, palabras clave y funciones */
  var GLSL_TOKENS = new RegExp([
    "(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)",
    "(#[^\\n]*)",
    "\\b(\\d+\\.?\\d*(?:e[+-]?\\d+)?)\\b",
    "\\b(void|bool|int|float|vec[234]|mat[234])\\b",
    "\\b(uniform|attribute|varying|const|precision|highp|mediump|lowp|if|else|for|return|break|continue)\\b",
    "\\b(gl_\\w+|abs|clamp|cos|cross|dot|exp|floor|fract|length|max|min|mix|mod|normalize|pow|reflect|sin|smoothstep|sqrt)\\b"
  ].join("|"), "g");
  var TOKEN_CLASSES = ["", "gl-comment", "gl-pre", "gl-num", "gl-type", "gl-key", "gl-fn"];

  var escapeHtml = function (s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };

  var highlight = function (src) {
    var out = "";
    var lastIndex = 0;
    var m;
    GLSL_TOKENS.lastIndex = 0;
    while ((m = GLSL_TOKENS.exec(src))) {
      var group = 1;
      while (!m[group]) group++;
      out += escapeHtml(src.slice(lastIndex, m.index)) +
        '<span class="' + TOKEN_CLASSES[group] + '">' + escapeHtml(m[0]) + "</span>";
      lastIndex = GLSL_TOKENS.lastIndex;
    }
    return out + escapeHtml(src.slice(lastIndex));
  };

  var showCode = function (url) {
    var file = url.split("/").pop();
    if (codeName) codeName.textContent = file;
    if (codeLink) codeLink.href = codeLink.getAttribute("data-base") + url;
    loadSource(url).then(function (src) {
      codeEl.innerHTML = highlight(src);
    }).catch(function () {
      codeEl.textContent = "No se pudo cargar " + file + ".";
    });
  };

  var showError = function (msg) {
    if (!errorEl) return;
    errorEl.hidden = !msg;
    errorEl.textContent = msg || "";
  };

  var select = function (tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();

    var url = tab.getAttribute("data-shader");
    labCanvas.setAttribute("aria-label", tab.getAttribute("data-label"));
    showCode(url);
    if (labGl) {
      var m = (tab.getAttribute("data-mouse") || "0.5,0.5").split(",");
      labGl.setPointer(parseFloat(m[0]), parseFloat(m[1]));
      showError("");
      labGl.load(url).catch(function (err) {
        console.error(err);
        showError("Esta pieza no pudo compilarse en tu dispositivo.");
      });
    }
  };

  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () { select(tab, false); });
    tab.addEventListener("keydown", function (e) {
      var dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      select(tabs[(i + dir + tabs.length) % tabs.length], true);
    });
  });

  var updatePlayButton = function () {
    var on = labGl.isPlaying();
    playBtn.textContent = on ? "Pausar" : "Reproducir";
    playBtn.setAttribute("aria-pressed", String(!on));
  };

  /* El laboratorio se inicializa recién cuando el visitante se acerca a la sección */
  var start = function () {
    if (started) return;
    started = true;
    labGl = createRenderer(labCanvas, {
      adaptive: true,
      onStats: function (s) {
        if (hud) hud.textContent = s.fps + " fps · " + s.width + "×" + s.height;
      }
    });
    if (!labGl) {
      lab.classList.add("no-webgl");
      return;
    }

    labCanvas.addEventListener("pointermove", function (e) {
      var p = pointerPos(e, labCanvas);
      labGl.setPointer(p[0], p[1]);
    });
    labCanvas.addEventListener("pointerdown", function (e) {
      var p = pointerPos(e, labCanvas);
      labGl.setPointer(p[0], p[1]);
      labGl.addDrop(p[0], p[1]);
    });
    playBtn.addEventListener("click", function () {
      labGl.setPlaying(!labGl.isPlaying());
      updatePlayButton();
    });
    updatePlayButton();

    var current = tabs.filter(function (t) { return t.getAttribute("aria-selected") === "true"; })[0] || tabs[0];
    select(current, false);
  };

  // El visor de código funciona aunque no haya WebGL
  var first = tabs.filter(function (t) { return t.getAttribute("aria-selected") === "true"; })[0] || tabs[0];
  showCode(first.getAttribute("data-shader"));

  if ("IntersectionObserver" in window) {
    var labObserver = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        labObserver.disconnect();
        start();
      }
    }, { rootMargin: "300px 0px" });
    labObserver.observe(lab);
  } else {
    start();
  }
})();
