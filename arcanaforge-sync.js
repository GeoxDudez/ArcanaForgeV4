/* =====================================================================
   ArcanaForge — Campaign Sync engine (v1)
   Shared by every tool. Load order on any page that syncs:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="supabase-config.js"></script>
     <script src="arcanaforge-sync.js"></script>
   Exposes window.AFSync.
   Solo mode is untouched: if no campaign is linked (or Supabase isn't
   configured), tools keep using localStorage exactly as before.
   ===================================================================== */
(function () {
  const LINK_KEY = 'af_campaign_link';
  let client = null;
  let channels = [];

  function configured() {
    const c = window.ARCANAFORGE_SUPABASE || {};
    return c.SUPABASE_URL && c.SUPABASE_ANON_KEY &&
           !String(c.SUPABASE_URL).startsWith('PASTE_') &&
           !String(c.SUPABASE_ANON_KEY).startsWith('PASTE_');
  }

  function db() {
    if (!configured()) return null;
    if (!client) {
      const c = window.ARCANAFORGE_SUPABASE;
      client = window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY);
    }
    return client;
  }

  /* Every device gets a persistent anonymous identity (stored by Supabase in
     this browser). No email, no password — clearing site data resets it. */
  async function ensureAuth() {
    const s = db();
    if (!s) throw new Error('Supabase is not configured yet.');
    const { data: { session } } = await s.auth.getSession();
    if (session) return session.user;
    const { data, error } = await s.auth.signInAnonymously();
    if (error) throw error;
    return data.user;
  }

  function link()        { try { return JSON.parse(localStorage.getItem(LINK_KEY)) || null; } catch { return null; } }
  function saveLink(l)   { localStorage.setItem(LINK_KEY, JSON.stringify(l)); }
  function clearLink()   { localStorage.removeItem(LINK_KEY); }
  function isLinked()    { return configured() && !!link(); }
  function isGM()        { const l = link(); return !!l && l.role === 'gm'; }

  async function createCampaign(name, displayName) {
    await ensureAuth();
    const { data, error } = await db().rpc('create_campaign',
      { campaign_name: name, display_name: displayName });
    if (error) throw error;
    const l = { ...data, display_name: displayName };
    saveLink(l);
    return l;
  }

  async function joinCampaign(code, displayName) {
    await ensureAuth();
    const { data, error } = await db().rpc('join_campaign',
      { code: code, display_name: displayName });
    if (error) throw error;
    const l = { ...data, display_name: displayName };
    saveLink(l);
    return l;
  }

  async function leaveCampaign() {
    const l = link();
    if (l) {
      try {
        const user = await ensureAuth();
        await db().from('campaign_members').delete()
          .eq('campaign_id', l.campaign_id).eq('user_id', user.id);
      } catch (e) { /* leaving locally even if the network call fails */ }
    }
    unsubscribeAll();
    clearLink();
  }

  async function members() {
    const l = link();
    if (!l) return [];
    await ensureAuth();
    const { data, error } = await db().from('campaign_members')
      .select('user_id, display_name, role, joined_at')
      .eq('campaign_id', l.campaign_id).order('joined_at');
    if (error) throw error;
    return data;
  }

  /* ---------- table helpers (used by the tools) ---------- */
  async function fetchAll(table, orderBy) {
    const l = link();
    await ensureAuth();
    let q = db().from(table).select('*').eq('campaign_id', l.campaign_id);
    if (orderBy) q = q.order(orderBy);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  async function insert(table, row) {
    const l = link();
    const user = await ensureAuth();
    const payload = { ...row, campaign_id: l.campaign_id };
    if (table === 'campaign_notes')   payload.author_id = user.id;
    if (table === 'character_sheets') payload.owner_id  = user.id;
    const { data, error } = await db().from(table).insert(payload).select().single();
    if (error) throw error;
    return data;
  }

  async function update(table, id, patch) {
    await ensureAuth();
    const { data, error } = await db().from(table).update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  async function remove(table, id) {
    await ensureAuth();
    const { error } = await db().from(table).delete().eq('id', id);
    if (error) throw error;
  }


  async function fetchRecent(table, limit) {
    const l = link();
    await ensureAuth();
    const { data, error } = await db().from(table).select('*')
      .eq('campaign_id', l.campaign_id)
      .order('created_at', { ascending: false }).limit(limit || 40);
    if (error) throw error;
    return data;
  }

  /* ---------- whole-document sync (shared_docs table) ---------- */
  async function getDoc(docKey) {
    const l = link();
    await ensureAuth();
    const { data, error } = await db().from('shared_docs').select('*')
      .eq('campaign_id', l.campaign_id).eq('doc_key', docKey).maybeSingle();
    if (error) throw error;
    return data; // null if the doc doesn't exist yet
  }

  async function putDoc(docKey, content, clientId) {
    const l = link();
    await ensureAuth();
    const { error } = await db().from('shared_docs').upsert(
      { campaign_id: l.campaign_id, doc_key: docKey, content, client_id: clientId || null },
      { onConflict: 'campaign_id,doc_key' });
    if (error) throw error;
  }

  function onDoc(docKey, cb) {
    return onChange('shared_docs', payload => {
      const row = payload.new;
      if (row && row.doc_key === docKey) cb(row);
    });
  }

  /* Live updates: cb(payload) fires on any insert/update/delete visible to
     this user — RLS filtering means players never receive DM notes. */
  function onChange(table, cb) {
    const l = link();
    if (!l) return () => {};
    const ch = db().channel('af-' + table + '-' + l.campaign_id)
      .on('postgres_changes',
          { event: '*', schema: 'public', table, filter: 'campaign_id=eq.' + l.campaign_id },
          cb)
      .subscribe();
    channels.push(ch);
    return () => { db().removeChannel(ch); channels = channels.filter(c => c !== ch); };
  }

  function unsubscribeAll() {
    if (client) channels.forEach(ch => client.removeChannel(ch));
    channels = [];
  }

  window.AFSync = {
    configured, isLinked, isGM, link, ensureAuth,
    createCampaign, joinCampaign, leaveCampaign, members,
    fetchAll, fetchRecent, insert, update, remove, onChange,
    getDoc, putDoc, onDoc
  };
})();
