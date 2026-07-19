// Selector de manifest PWA según la ruta: cada "app" (cronometraje,
// organizador) se instala con su propio icono y pantalla de inicio.
(function () {
  var path = window.location.pathname;
  var manifest = null;

  if (path.indexOf("/timing") === 0) {
    manifest = "/manifest-timing.json";
  } else if (path === "/org" || path.indexOf("/org/") === 0) {
    manifest = "/manifest-organizer.json";
  }

  if (manifest) {
    var link = document.createElement("link");
    link.rel = "manifest";
    link.href = manifest;
    document.head.appendChild(link);
  }
})();
