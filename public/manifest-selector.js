// Dynamic manifest selector based on current path
(function() {
  const path = window.location.pathname;
  let manifestPath = '/manifest-timing.json'; // default
  
  if (path.startsWith('/track')) {
    manifestPath = '/manifest-gps.json';
  } else if (path.startsWith('/timing')) {
    manifestPath = '/manifest-timing.json';
  }
  
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = manifestPath;
  document.head.appendChild(link);
})();
