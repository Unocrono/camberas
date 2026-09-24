/*
 * Widget de inscripción de Camberas para la web de la carrera (sin iframe).
 *
 * El organizador pega en su web:
 *
 *   <div data-camberas-carrera="desafio-sarrio"></div>
 *   <script src="https://camberas.com/widget.js" async></script>
 *
 * y aquí se pinta la carrera con sus recorridos, el precio vigente, las
 * plazas libres y el botón para inscribirse en Camberas. Los datos se piden
 * al cargar la página (función widget_carrera, clave anónima pública), así
 * que precio y plazas están siempre al día.
 *
 * - Sin iframe: se pinta dentro de un Shadow DOM, así los estilos de la web
 *   del organizador no lo descolocan y los nuestros no le tocan nada.
 * - Nada de lo que llega de la base de datos entra como HTML: todo va por
 *   textContent.
 * - Opciones en el propio div: data-tema="oscuro" (por defecto claro).
 * - Varios widgets en la misma página funcionan; cargar el script dos veces
 *   no duplica nada.
 * - Si la carrera no existe o está oculta, no se pinta nada. Si falla la red,
 *   queda solo el botón a la carrera.
 *
 * El mismo script pinta también el VUELO 3D de un recorrido:
 *
 *   <div data-camberas-vuelo="ID-DEL-RECORRIDO"></div>
 *
 * (ver montarVuelo). El panel admin (Inscripciones › Widgets para la web)
 * genera los dos códigos y los previsualiza con este mismo script.
 */
(function () {
  "use strict";

  // Cargado otra vez (webs que traen secciones por AJAX y vuelven a ejecutar
  // el script): no se redefine nada, solo se montan los div nuevos
  if (window.CamberasWidget && window.CamberasWidget.version) {
    if (typeof window.CamberasWidget.montarTodos === "function") window.CamberasWidget.montarTodos();
    return;
  }

  var SUPABASE_URL = "https://rsahtxjpisnldxnsmupk.supabase.co";
  // Clave anónima pública: la misma que lleva la web en el navegador
  var ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYWh0eGpwaXNubGR4bnNtdXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2Mjg5MDAsImV4cCI6MjA3OTIwNDkwMH0.MwUTZs3BxPMsy0YtEgM92o4U3xw2SrMmpZ-GFNC03dE";

  // Web de Camberas: la del propio script si viene de Camberas (así la vista
  // previa del panel, en la vista previa de Lovable, usa su propio sitio); si
  // alguien se copia el script a su servidor, camberas.com
  var WEB = "https://camberas.com";
  try {
    var propio = document.currentScript && document.currentScript.src;
    if (propio) {
      var origen = new URL(propio).origin;
      if (/^https:\/\/([a-z0-9-]+\.)*(camberas\.com|lovable\.app|lovableproject\.com)$/i.test(origen) ||
          /^http:\/\/localhost(:\d+)?$/i.test(origen)) {
        WEB = origen;
      }
    }
  } catch (e) { /* sin URL: camberas.com */ }

  // Paleta Camberas (docs/paleta-camberas.md)
  var VERDE = "#235940";
  var NARANJA = "#EC7C2B";
  var CREMA = "#FAF6EC";

  var ESTILOS =
    ":host{all:initial;display:block;width:100%;max-width:520px}" +
    "*{box-sizing:border-box}" +
    ".cw{font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;" +
    "background:" + CREMA + ";color:#1f2937;border:1px solid #e5dfcf;border-radius:14px;overflow:hidden;line-height:1.4}" +
    ".cw.oscuro{background:#172720;color:" + CREMA + ";border-color:#2c4538}" +
    ".cab{display:flex;gap:14px;align-items:center;padding:18px 18px 14px}" +
    ".logo{width:56px;height:56px;border-radius:10px;object-fit:contain;background:#fff;flex:none}" +
    ".nom{margin:0;font-size:20px;font-weight:700;color:" + VERDE + ";letter-spacing:.2px}" +
    ".oscuro .nom{color:" + CREMA + "}" +
    ".sub{margin:2px 0 0;font-size:14px;opacity:.8}" +
    ".lista{list-style:none;margin:0;padding:0 18px}" +
    ".rec{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid #e5dfcf}" +
    ".oscuro .rec{border-color:#2c4538}" +
    ".rn{font-weight:600;font-size:16px}" +
    ".rd{font-size:13px;opacity:.75;margin-top:1px}" +
    ".der{text-align:right;flex:none}" +
    ".pr{font-weight:700;font-size:18px;color:" + VERDE + "}" +
    ".oscuro .pr{color:" + CREMA + "}" +
    ".pl{font-size:12px;margin-top:2px;opacity:.8}" +
    ".pl.ult{color:" + NARANJA + ";opacity:1;font-weight:600}" +
    ".pl.no{opacity:.6}" +
    ".pie{padding:14px 18px 18px}" +
    ".plazo{font-size:13px;opacity:.8;margin:0 0 10px;text-align:center}" +
    ".btn{display:block;text-align:center;text-decoration:none;font-weight:700;font-size:16px;" +
    "padding:13px 16px;border-radius:10px;background:" + NARANJA + ";color:#fff}" +
    ".btn:hover{filter:brightness(1.05)}" +
    ".btn.sec{background:transparent;color:" + VERDE + ";border:2px solid " + VERDE + "}" +
    ".oscuro .btn.sec{color:" + CREMA + ";border-color:" + CREMA + "}" +
    ".marca{display:block;text-align:center;font-size:11px;margin-top:10px;opacity:.6;color:inherit;text-decoration:none}" +
    ".cargando{padding:18px;font-size:14px;opacity:.7}";

  /** Crea un elemento con clase y texto (nunca HTML) */
  function el(tag, clase, texto) {
    var n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = String(texto);
    return n;
  }

  function fechaLarga(iso) {
    var d = new Date(String(iso).slice(0, 10) + "T12:00:00");
    if (isNaN(d.getTime())) return "";
    var t = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // Apertura y cierre: el panel guarda la hora tal cual la teclea el
  // organizador (25/11 23:59 se guarda como 23:59 UTC) y la enseña así. Se
  // lee en UTC para decir el mismo día que escribió, no el día siguiente.
  function diaMes(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", timeZone: "UTC" });
  }

  function euros(n) {
    var v = Number(n);
    if (!isFinite(v)) return "";
    if (v === 0) return "Gratis";
    var entero = Math.round(v) === v;
    return v.toLocaleString("es-ES", {
      minimumFractionDigits: entero ? 0 : 2,
      maximumFractionDigits: 2,
      useGrouping: true,
    }) + " €";
  }

  function numero(n) {
    return Number(n).toLocaleString("es-ES", { maximumFractionDigits: 1, useGrouping: true });
  }

  function enlace(slug) {
    return WEB + "/" + encodeURIComponent(slug) +
      "?utm_source=widget&utm_medium=web-carrera&utm_campaign=" + encodeURIComponent(slug);
  }

  /** Texto de plazas de un recorrido y si hay que llamar la atención */
  function textoPlazas(r) {
    if (r.estado === "proxima") return { t: r.abre ? "Abre el " + diaMes(r.abre) : "Próximamente", c: "pl" };
    if (r.estado === "cerrada") return { t: "Inscripción cerrada", c: "pl no" };
    if (r.estado === "completa") return { t: "Completo", c: "pl no" };
    if (r.plazas == null || r.libres == null) return { t: "Plazas disponibles", c: "pl" };
    var libres = Math.max(0, Number(r.libres));
    var umbral = Math.max(10, Math.round(Number(r.plazas) * 0.1));
    if (libres <= umbral) return { t: libres === 1 ? "¡Última plaza!" : "¡Últimas " + libres + " plazas!", c: "pl ult" };
    return { t: numero(libres) + " plazas libres", c: "pl" };
  }

  function pintar(raiz, datos, tema) {
    raiz.textContent = "";
    var estilo = el("style");
    estilo.textContent = ESTILOS;
    raiz.appendChild(estilo);

    var caja = el("div", "cw" + (tema === "oscuro" ? " oscuro" : ""));
    caja.setAttribute("role", "region");
    caja.setAttribute("aria-label", "Inscripciones " + datos.nombre);

    var cab = el("div", "cab");
    if (datos.logo) {
      var img = el("img", "logo");
      img.src = datos.logo;
      img.alt = "";
      img.loading = "lazy";
      img.onerror = function () { img.remove(); };
      cab.appendChild(img);
    }
    var tit = el("div");
    tit.appendChild(el("h3", "nom", datos.nombre));
    var sub = [fechaLarga(datos.fecha), datos.lugar].filter(Boolean).join(" · ");
    if (sub) tit.appendChild(el("p", "sub", sub));
    cab.appendChild(tit);
    caja.appendChild(cab);

    var recorridos = Array.isArray(datos.recorridos) ? datos.recorridos : [];
    if (recorridos.length) {
      var ul = el("ul", "lista");
      recorridos.forEach(function (r) {
        var li = el("li", "rec");
        var izq = el("div");
        izq.appendChild(el("div", "rn", r.nombre));
        var det = [];
        if (r.km != null) det.push(numero(r.km) + " km");
        if (r.desnivel) det.push(numero(r.desnivel) + " m D+");
        if (det.length) izq.appendChild(el("div", "rd", det.join(" · ")));
        li.appendChild(izq);

        var der = el("div", "der");
        if (r.precio != null) der.appendChild(el("div", "pr", euros(r.precio)));
        var p = textoPlazas(r);
        der.appendChild(el("div", p.c, p.t));
        li.appendChild(der);
        ul.appendChild(li);
      });
      caja.appendChild(ul);
    }

    var pie = el("div", "pie");
    var abiertas = recorridos.filter(function (r) { return r.estado === "abierta"; });
    if (abiertas.length) {
      var cierres = abiertas.map(function (r) { return r.cierra; }).filter(Boolean).sort();
      if (cierres.length) pie.appendChild(el("p", "plazo", "Inscripciones abiertas hasta el " + diaMes(cierres[cierres.length - 1])));
    }
    var btn = el("a", abiertas.length ? "btn" : "btn sec", abiertas.length ? "Inscríbete" : "Ver la carrera");
    btn.href = enlace(datos.slug || datos.id);
    btn.target = "_blank";
    btn.rel = "noopener";
    pie.appendChild(btn);
    var marca = el("a", "marca", "Inscripciones con Camberas");
    marca.href = WEB + "/?utm_source=widget";
    marca.target = "_blank";
    marca.rel = "noopener";
    pie.appendChild(marca);
    caja.appendChild(pie);

    raiz.appendChild(caja);
  }

  /** Sin datos (red caída): al menos el botón a la carrera */
  function pintarSoloBoton(raiz, slug, tema) {
    raiz.textContent = "";
    var estilo = el("style");
    estilo.textContent = ESTILOS;
    raiz.appendChild(estilo);
    var caja = el("div", "cw" + (tema === "oscuro" ? " oscuro" : ""));
    var pie = el("div", "pie");
    var btn = el("a", "btn", "Inscríbete en Camberas");
    btn.href = enlace(slug);
    btn.target = "_blank";
    btn.rel = "noopener";
    pie.appendChild(btn);
    caja.appendChild(pie);
    raiz.appendChild(caja);
  }

  function montar(nodo) {
    if (!nodo || !nodo.getAttribute) return;
    var carrera = (nodo.getAttribute("data-camberas-carrera") || "").trim();
    if (!carrera) return;
    var tema = (nodo.getAttribute("data-tema") || "claro").trim().toLowerCase();
    // Clave de lo que hay pintado: volver a montar el mismo div con los
    // mismos datos no hace nada; con otros (la vista previa del panel), repinta
    var firma = carrera + "|" + tema;
    if (nodo.__camberasFirma === firma) return;

    var raiz = nodo.shadowRoot || nodo.attachShadow({ mode: "open" });
    nodo.__camberasFirma = firma;
    raiz.textContent = "";
    var estilo = el("style");
    estilo.textContent = ESTILOS;
    raiz.appendChild(estilo);
    raiz.appendChild(el("div", "cw cargando" + (tema === "oscuro" ? " oscuro" : ""), "Cargando inscripciones…"));

    fetch(SUPABASE_URL + "/rest/v1/rpc/widget_carrera", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: "Bearer " + ANON_KEY,
      },
      body: JSON.stringify({ p_carrera: carrera }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (datos) {
        if (nodo.__camberasFirma !== firma) return; // cambió mientras cargaba
        if (!datos || !datos.id) {
          console.warn("[Camberas] No hay ninguna carrera visible con «" + carrera + "»");
          raiz.textContent = "";
          return;
        }
        pintar(raiz, datos, tema);
      })
      .catch(function (e) {
        if (nodo.__camberasFirma !== firma) return;
        console.warn("[Camberas] No se pudieron cargar los datos del widget:", e);
        pintarSoloBoton(raiz, carrera, tema);
      });
  }

  /*
   * Vuelo 3D sobre el recorrido: <div data-camberas-vuelo="ID-DEL-RECORRIDO">.
   * El mapa 3D es un motor pesado (Mapbox GL + el GPX): corre en su propia
   * página de Camberas, /vuelo/:id, que aquí se abre dentro del div. Así la
   * web del organizador no carga nada de eso hasta que el visitante llega a
   * esa zona (loading="lazy"), y el vuelo es el mismo que el de la ficha.
   * Opcional: data-alto="500" (píxeles) si se quiere un alto fijo.
   */
  function montarVuelo(nodo) {
    var id = (nodo.getAttribute("data-camberas-vuelo") || "").trim();
    if (!id) return;
    var alto = parseInt(nodo.getAttribute("data-alto") || "", 10);
    var firma = "vuelo|" + id + "|" + (alto || "");
    if (nodo.__camberasFirma === firma) return;

    var raiz = nodo.shadowRoot || nodo.attachShadow({ mode: "open" });
    nodo.__camberasFirma = firma;
    raiz.textContent = "";
    var estilo = el("style");
    estilo.textContent =
      ":host{all:initial;display:block;width:100%}" +
      "iframe{display:block;width:100%;border:0;border-radius:12px;background:#10201a;" +
      (alto > 0 ? "height:" + alto + "px}" : "aspect-ratio:16/10;min-height:320px;max-height:85vh}");
    raiz.appendChild(estilo);

    var marco = document.createElement("iframe");
    marco.src = WEB + "/vuelo/" + encodeURIComponent(id);
    marco.title = "Vuelo 3D sobre el recorrido";
    marco.loading = "lazy";
    marco.setAttribute("allow", "fullscreen");
    marco.setAttribute("allowfullscreen", "");
    raiz.appendChild(marco);
  }

  function montarTodos() {
    var nodos = document.querySelectorAll("[data-camberas-carrera], [data-camberas-vuelo]");
    for (var i = 0; i < nodos.length; i++) {
      // Un div raro (que no admite Shadow DOM) no deja sin pintar a los demás
      try {
        if (nodos[i].hasAttribute("data-camberas-vuelo")) montarVuelo(nodos[i]);
        else montar(nodos[i]);
      } catch (e) {
        console.warn("[Camberas] No se pudo pintar un widget:", e);
      }
    }
  }

  window.CamberasWidget = { version: 2, montar: montar, montarVuelo: montarVuelo, montarTodos: montarTodos };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", montarTodos);
  } else {
    montarTodos();
  }
})();
