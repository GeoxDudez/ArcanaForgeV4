/* =====================================================================
   ArcanaForge — Codex Quick Search (Ctrl+K / Cmd+K on every tool)
   Searches all Codex entries from anywhere. Self-contained: builds its
   own overlay and styles on first use; reads the same shared Codex
   store every tool uses. Include with one script tag; no setup.
   ===================================================================== */
(function(){
  if (window.__afQuickSearch) return;   // double-include guard
  window.__afQuickSearch = true;

  var LIB=null, INDEX=null, open=false, results=[], sel=0, mode='list', detail=null;

  /* ---------- codex bridge (shared store) ---------- */
  function idbGet(){ return new Promise(function(res){ try{
    var rq=indexedDB.open('the-table-codex'); rq.onerror=function(){res(null);};
    rq.onsuccess=function(){ var db=rq.result;
      if(!db.objectStoreNames.contains('data')){ db.close(); return res(null); }
      var g=db.transaction('data').objectStore('data').get('codex_db_v1');
      g.onsuccess=function(){ db.close(); res(g.result||null); };
      g.onerror=function(){ db.close(); res(null); };
    };
  }catch(e){ res(null); } }); }

  async function loadLib(){
    if (LIB) return LIB;
    var v = await idbGet();
    if (!(v && Array.isArray(v.collections))){
      var keys=['codex_db_v1','codex-shared-cache-v1'];
      for (var i=0;i<keys.length;i++){
        try{ var r=JSON.parse(localStorage.getItem(keys[i]));
             if (r && Array.isArray(r.collections)){ v=r; break; } }catch(e){}
      }
    }
    LIB = (v && Array.isArray(v.collections)) ? v : null;
    return LIB;
  }

  function entryName(e){ return (e&&typeof e==='object') ? (e.name||e.title||e.label||'') : String(e); }

  function buildIndex(){
    INDEX=[];
    if(!LIB) return;
    LIB.collections.forEach(function(c){
      (c.entries||[]).forEach(function(e){
        var nm=entryName(e); if(!nm) return;
        INDEX.push({ n:nm, nl:nm.toLowerCase(), list:c.name||'', domain:c.domain||'', e:e });
      });
    });
  }

  function search(q){
    q=q.toLowerCase().trim();
    if(!q || !INDEX) return [];
    var starts=[], within=[], deep=[];
    for(var i=0;i<INDEX.length;i++){
      var it=INDEX[i];
      if(it.nl.indexOf(q)===0) starts.push(it);
      else if(it.nl.indexOf(q)>-1) within.push(it);
      else if(deep.length<20 && typeof it.e==='object'){
        try{ if(JSON.stringify(it.e).toLowerCase().indexOf(q)>-1) deep.push(it); }catch(e){}
      }
      if(starts.length>=50) break;
    }
    return starts.concat(within).concat(deep).slice(0,50);
  }

  var esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };

  /* ---------- overlay ---------- */
  var root=null, input=null, listEl=null, detEl=null, footEl=null;
  function build(){
    if(root) return;
    var css=document.createElement('style');
    css.textContent =
".afqs-bg{position:fixed;inset:0;z-index:9000;background:rgba(6,8,12,.72);backdrop-filter:blur(4px);display:none;align-items:flex-start;justify-content:center;padding:9vh 16px 16px}" +
".afqs-bg.open{display:flex}" +
".afqs{width:640px;max-width:100%;max-height:78vh;display:flex;flex-direction:column;background:linear-gradient(180deg,#181b24,#12141c);border:1px solid #9c7d3c;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.65);overflow:hidden;font-family:'Spline Sans','Segoe UI',system-ui,sans-serif;color:#ece9e1}" +
".afqs-head{display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid #2c313e}" +
".afqs-head .ic{color:#e3b352;font-size:1rem}" +
".afqs-head input{flex:1;background:transparent;border:0;outline:none;color:#ece9e1;font-size:1.02rem;font-family:inherit}" +
".afqs-head .k{font-size:.68rem;color:#646b78;border:1px solid #2c313e;border-radius:6px;padding:2px 7px}" +
".afqs-list{overflow:auto;flex:1}" +
".afqs-row{display:flex;align-items:baseline;gap:10px;padding:10px 16px;cursor:pointer;border-bottom:1px solid #1c202a}" +
".afqs-row.on{background:rgba(227,179,82,.09)}" +
".afqs-row .nm{font-weight:600;font-size:.95rem;color:#ece9e1}" +
".afqs-row.on .nm{color:#f0cd80}" +
".afqs-row .path{margin-left:auto;font-size:.72rem;color:#646b78;letter-spacing:.05em;white-space:nowrap}" +
".afqs-empty{padding:34px 16px;text-align:center;color:#646b78;font-size:.88rem;font-style:italic}" +
".afqs-det{overflow:auto;flex:1;padding:16px 18px}" +
".afqs-det h3{font-family:'Cinzel',Georgia,serif;font-size:1.15rem;letter-spacing:.05em;color:#e3b352;margin:0 0 2px}" +
".afqs-det .crumb{font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:#9c7d3c;margin-bottom:13px}" +
".afqs-det .fld{margin-bottom:10px}" +
".afqs-det .fld .k{font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:#646b78;font-weight:700}" +
".afqs-det .fld .v{font-size:.92rem;white-space:pre-wrap;color:#c9c5ba}" +
".afqs-foot{display:flex;gap:14px;align-items:center;padding:9px 16px;border-top:1px solid #2c313e;font-size:.7rem;color:#646b78}" +
".afqs-foot b{color:#9aa0ad;font-weight:600}" +
".afqs-foot .cp{margin-left:auto;background:none;border:1px solid #2c313e;border-radius:7px;color:#9aa0ad;padding:4px 11px;cursor:pointer;font-size:.72rem;font-family:inherit}" +
".afqs-foot .cp:hover{color:#e3b352;border-color:#9c7d3c}";
    document.head.appendChild(css);

    root=document.createElement('div');
    root.className='afqs-bg';
    root.innerHTML =
      '<div class="afqs" role="dialog" aria-label="Codex quick search">' +
        '<div class="afqs-head"><span class="ic">🔍</span>' +
        '<input placeholder="Search the Codex…" spellcheck="false">' +
        '<span class="k">esc</span></div>' +
        '<div class="afqs-list"></div>' +
        '<div class="afqs-det" style="display:none"></div>' +
        '<div class="afqs-foot"><span><b>↑↓</b> move</span><span><b>enter</b> open</span><span><b>esc</b> back</span>' +
        '<button class="cp" style="display:none">Copy name</button></div>' +
      '</div>';
    document.body.appendChild(root);
    input=root.querySelector('input');
    listEl=root.querySelector('.afqs-list');
    detEl=root.querySelector('.afqs-det');
    footEl=root.querySelector('.cp');

    root.addEventListener('mousedown', function(e){ if(e.target===root) close(); });
    input.addEventListener('input', function(){ mode='list'; results=search(input.value); sel=0; render(); });
    listEl.addEventListener('click', function(e){
      var r=e.target.closest('[data-i]'); if(!r) return;
      sel=+r.dataset.i; openDetail();
    });
    footEl.addEventListener('click', function(){
      if(detail){ navigator.clipboard.writeText(detail.n); footEl.textContent='Copied!'; setTimeout(function(){footEl.textContent='Copy name';},1200); }
    });
  }

  function render(){
    detEl.style.display='none'; listEl.style.display='';
    footEl.style.display='none';
    if(!LIB){ listEl.innerHTML='<div class="afqs-empty">No Codex found on this device yet — open The Codex once, or link a campaign and open Character Sheets to pull your GM\u2019s.</div>'; return; }
    if(!input.value.trim()){ listEl.innerHTML='<div class="afqs-empty">'+INDEX.length.toLocaleString()+' entries at your fingertips. Start typing.</div>'; return; }
    if(!results.length){ listEl.innerHTML='<div class="afqs-empty">Nothing in the Codex matches that.</div>'; return; }
    listEl.innerHTML=results.map(function(r,i){
      return '<div class="afqs-row'+(i===sel?' on':'')+'" data-i="'+i+'">'+
        '<span class="nm">'+esc(r.n)+'</span>'+
        '<span class="path">'+esc(r.domain)+(r.domain&&r.list?' › ':'')+esc(r.list)+'</span></div>';
    }).join('');
    var on=listEl.querySelector('.afqs-row.on');
    if(on) on.scrollIntoView({block:'nearest'});
  }

  function openDetail(){
    detail=results[sel]; if(!detail) return;
    mode='detail';
    listEl.style.display='none'; detEl.style.display='';
    footEl.style.display='';
    var e=detail.e, rows='';
    if(e && typeof e==='object'){
      Object.keys(e).forEach(function(k){
        if(k==='name'||k==='id') return;
        var v=e[k];
        if(v==null||v==='') return;
        if(Array.isArray(v)) v=v.map(function(x){ return typeof x==='object'?entryName(x):x; }).join(', ');
        else if(typeof v==='object'){ try{ v=JSON.stringify(v,null,1).replace(/[{}"]/g,'').trim(); }catch(err){ return; } }
        rows+='<div class="fld"><div class="k">'+esc(k)+'</div><div class="v">'+esc(v)+'</div></div>';
      });
    }
    if(!rows) rows='<div class="fld"><div class="v" style="color:#646b78;font-style:italic">A name and nothing more — this entry has no extra details.</div></div>';
    detEl.innerHTML='<h3>'+esc(detail.n)+'</h3><div class="crumb">'+esc(detail.domain)+(detail.domain&&detail.list?' › ':'')+esc(detail.list)+'</div>'+rows;
    detEl.scrollTop=0;
  }

  async function openSearch(){
    build();
    open=true; root.classList.add('open');
    input.value=''; results=[]; sel=0; mode='list'; detail=null;
    if(!INDEX){ listEl.innerHTML='<div class="afqs-empty">Consulting the library…</div>'; await loadLib(); buildIndex(); }
    render();
    input.focus();
  }
  function close(){ open=false; root.classList.remove('open'); }

  document.addEventListener('keydown', function(e){
    if((e.ctrlKey||e.metaKey) && (e.key==='k'||e.key==='K')){
      e.preventDefault();
      if(open) close(); else openSearch();
      return;
    }
    if(!open) return;
    if(e.key==='Escape'){ e.preventDefault(); if(mode==='detail'){ mode='list'; render(); input.focus(); } else close(); }
    else if(mode==='list' && e.key==='ArrowDown'){ e.preventDefault(); if(results.length){ sel=Math.min(sel+1,results.length-1); render(); } }
    else if(mode==='list' && e.key==='ArrowUp'){ e.preventDefault(); if(results.length){ sel=Math.max(sel-1,0); render(); } }
    else if(mode==='list' && e.key==='Enter'){ e.preventDefault(); if(results.length) openDetail(); }
  }, true);
})();
