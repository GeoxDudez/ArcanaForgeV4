/* =====================================================================
   ArcanaForge — update banner
   Shows "a new version is ready" when the service worker installs an
   update, so nobody plays a session on stale files again.
   ===================================================================== */
(function(){
  if (!('serviceWorker' in navigator)) return;
  if (window.__afUpdateBanner) return;
  window.__afUpdateBanner = true;

  var hadController = !!navigator.serviceWorker.controller;
  var shown = false;

  function show(){
    if (shown || !document.body) return;
    shown = true;
    var b = document.createElement('div');
    b.id = 'afUpdateBanner';
    b.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9500;' +
      'display:flex;gap:14px;align-items:center;max-width:92vw;' +
      'background:linear-gradient(180deg,#181b24,#12141c);border:1px solid #9c7d3c;border-radius:12px;' +
      'padding:12px 14px 12px 18px;box-shadow:0 14px 40px rgba(0,0,0,.6);' +
      "font-family:'Spline Sans','Segoe UI',system-ui,sans-serif;font-size:.9rem;color:#ece9e1;";
    b.innerHTML =
      '<span>⚒ A new version of ArcanaForge is ready.</span>' +
      '<button id="afUpdGo" style="border:0;border-radius:9px;padding:8px 18px;font-weight:600;cursor:pointer;' +
        'background:linear-gradient(180deg,#e3b352,#c9a24b);color:#1a1405;font-family:inherit;white-space:nowrap">Refresh</button>' +
      '<button id="afUpdX" aria-label="Dismiss" style="background:none;border:0;color:#646b78;font-size:16px;cursor:pointer;line-height:1">✕</button>';
    document.body.appendChild(b);
    document.getElementById('afUpdGo').onclick = function(){ location.reload(); };
    document.getElementById('afUpdX').onclick  = function(){ b.remove(); };
  }

  /* a new worker took control (this tab, or an update triggered elsewhere) */
  navigator.serviceWorker.addEventListener('controllerchange', function(){
    if (hadController) show();
    hadController = true;
  });

  /* an update is downloading right now, or already sitting installed */
  navigator.serviceWorker.getRegistration().then(function(reg){
    if (!reg) return;
    if (reg.waiting && navigator.serviceWorker.controller) show();
    reg.addEventListener('updatefound', function(){
      var nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', function(){
        if ((nw.state === 'installed' || nw.state === 'activated') &&
            navigator.serviceWorker.controller) show();
      });
    });
  }).catch(function(){});
})();
