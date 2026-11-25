/* =====================================================================
   Gaby Hub Dev — connexion Supabase, mesure des visites et des parties,
   consentement (bandeau), multijoueur temps réel.
   Si config.js n'est pas rempli, le site marche quand même (sans suivi).
   ===================================================================== */
(function () {
  const cfg = window.GH_CONFIG || {};
  const configured = !!(cfg.SUPABASE_URL && !/XXXX/.test(cfg.SUPABASE_URL) && cfg.SUPABASE_ANON_KEY && !/COLLE_ICI/.test(cfg.SUPABASE_ANON_KEY));
  let sb = null;
  try { if (configured && window.supabase) sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY); } catch (e) { sb = null; }

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

  let visitorId = ls.get('gh-vid');
  if (!visitorId) { visitorId = uuid(); ls.set('gh-vid', visitorId); }
  const visitId = uuid();
  const t0 = Date.now();
  let lastPage = (location.hash || '#accueil').slice(1) || 'accueil';
  let visitStarted = false;

  const consent = () => ls.get('gh-consent') === 'yes';
  const canTrack = () => !!sb && consent();

  async function rpc(name, args) {
    if (!sb) return { error: { message: 'Supabase non configuré' } };
    try { return await sb.rpc(name, args); } catch (e) { return { error: e }; }
  }

  function visitArgs(page) {
    return { p_id: visitId, p_visitor: visitorId, p_page: page, p_referrer: (document.referrer || '').slice(0, 300),
             p_ua: navigator.userAgent.slice(0, 300), p_lang: navigator.language || '', p_screen: screen.width + 'x' + screen.height };
  }
  function startVisit() { if (!canTrack() || visitStarted) return; visitStarted = true; rpc('track_visit', visitArgs(lastPage)); }
  function page(p) { lastPage = p; if (visitStarted) rpc('track_visit', visitArgs(p)); }

  /* ---- Parties jouées ---- */
  let cur = null;
  function sendGame(ended) {
    if (!cur || !canTrack()) return;
    rpc('track_game', { p_id: cur.id, p_visit: visitId, p_visitor: visitorId, p_game: cur.game, p_mode: cur.mode || null,
      p_duration: Math.round((Date.now() - cur.t) / 1000), p_score: Math.round(cur.score || 0), p_ended: !!ended });
  }
  const game = {
    start(name, mode) { game.end(); cur = { id: uuid(), game: name, mode: mode || '', t: Date.now(), score: 0 }; sendGame(false); },
    score(s) { if (cur) cur.score = s; },
    end(s) { if (!cur) return; if (typeof s === 'number') cur.score = s; sendGame(true); cur = null; }
  };

  /* ---- Battement toutes les 30 s (temps passé sur le site et en jeu) ---- */
  setInterval(() => {
    if (!canTrack() || document.hidden) return;
    if (visitStarted) rpc('track_heartbeat', { p_id: visitId, p_duration: Math.round((Date.now() - t0) / 1000) });
    if (cur) sendGame(false);
  }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && canTrack()) {
      if (visitStarted) rpc('track_heartbeat', { p_id: visitId, p_duration: Math.round((Date.now() - t0) / 1000) });
      if (cur) sendGame(false);
    }
  });

  /* ---- Bandeau de consentement ---- */
  function banner() {
    if (!sb || ls.get('gh-consent')) { startVisit(); return; }
    const b = document.createElement('div');
    b.id = 'gh-consent';
    b.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:500;max-width:640px;margin:0 auto;background:rgba(13,10,43,.96);border:1px solid rgba(139,92,255,.6);border-radius:16px;padding:16px 18px;font:13px/1.55 "JetBrains Mono",monospace;color:#e9e7ff;box-shadow:0 0 30px rgba(139,92,255,.35)';
    b.innerHTML = '🍪 <b>Statistiques</b> — j\'aimerais mesurer les visites et le temps de jeu sur ce site (pas de pub, pas de revente, aucune adresse IP enregistrée). <a href="mentions-legales.html" style="color:#22f0ff">En savoir plus</a>' +
      '<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap"><button data-c="yes" style="font:700 13px JetBrains Mono,monospace;padding:9px 16px;border-radius:10px;border:2px solid #8b5cff;background:rgba(139,92,255,.3);color:#fff">Accepter</button><button data-c="no" style="font:700 13px JetBrains Mono,monospace;padding:9px 16px;border-radius:10px;border:1px solid #555;background:transparent;color:#9b97c9">Refuser</button></div>';
    b.addEventListener('click', e => { const c = e.target.closest('[data-c]'); if (!c) return; ls.set('gh-consent', c.dataset.c); b.remove(); startVisit(); });
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', banner); else banner();

  /* ---- Multijoueur temps réel (Supabase Realtime) ----
     Un salon = un canal. Présence = qui est dans le salon (pseudo, créateur, phase).
     Broadcast = événements de jeu ('st' état du serpent, 'start' lancement, 'ctl' contrôle). */
  async function joinRoom(name, state) {
    if (!sb) throw { code: 'non_configure' };
    const myId = uuid();
    const handlers = {}, syncFns = [];
    const ch = sb.channel(name, { config: { broadcast: { self: false }, presence: { key: myId } } });
    ['st', 'start', 'ctl'].forEach(ev => ch.on('broadcast', { event: ev }, ({ payload }) => {
      (handlers[ev] || []).forEach(f => { try { f(payload); } catch (e) {} });
    }));
    ch.on('presence', { event: 'sync' }, () => syncFns.forEach(f => { try { f(); } catch (e) {} }));
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject({ code: 'timeout' }), 10000);
      ch.subscribe(async status => {
        if (status === 'SUBSCRIBED') { clearTimeout(to); try { await ch.track(state || {}); } catch (e) {} resolve(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(to); reject({ code: status }); }
      });
    });
    return {
      myId,
      members() {
        const st = ch.presenceState();
        return Object.keys(st).map(k => Object.assign({}, (st[k] && st[k][0]) || {}, { id: k }));
      },
      track(s) { return ch.track(s); },
      on(ev, f) { (handlers[ev] = handlers[ev] || []).push(f); },
      onSync(f) { syncFns.push(f); },
      send(ev, payload) { return ch.send({ type: 'broadcast', event: ev, payload: Object.assign({}, payload, { id: myId }) }); },
      leave() { return sb.removeChannel(ch); }
    };
  }

  /* ---- GabyCodeHub : code d'accès envoyé automatiquement par email ---- */
  const hub = {
    async session() { if (!sb) return null; try { const { data } = await sb.auth.getSession(); return data.session; } catch (e) { return null; } },
    async sendCode(email, pseudo, gameName, captchaToken) {
      if (!sb) return { error: { message: 'Le site n\'est pas encore relié à Supabase.' } };
      const { error } = await sb.auth.signInWithOtp({ email, options: Object.assign({ shouldCreateUser: true, data: { pseudo } }, captchaToken ? { captchaToken } : {}) });
      rpc('request_access', { p_email: email, p_pseudo: pseudo, p_game: gameName, p_status: error ? 'erreur' : 'envoye' });
      return { error };
    },
    async verify(email, token) {
      if (!sb) return { error: { message: 'Le site n\'est pas encore relié à Supabase.' } };
      const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
      if (!error && visitStarted) page(lastPage);
      return { data, error };
    },
    logView(gameName) { if (sb) rpc('log_code_view', { p_game: gameName }); },
    async signOut() { if (sb) await sb.auth.signOut(); }
  };

  /* ---- Anti-robot (Cloudflare Turnstile) ---- */
  const tsKey = (cfg.TURNSTILE_SITE_KEY || '').trim();
  let tsLoad = null;
  function loadTurnstile() {
    if (!tsKey) return Promise.resolve(null);
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!tsLoad) tsLoad = new Promise(res => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true; s.onload = () => res(window.turnstile || null); s.onerror = () => res(null);
      document.head.appendChild(s);
    });
    return tsLoad;
  }
  const captcha = {
    enabled: !!tsKey,
    async mount(el) {
      if (!tsKey || !el) return null;
      if (el._cap) return el._cap;
      const ts = await loadTurnstile(); if (!ts) return null;
      const cap = { token: null };
      cap.id = ts.render(el, { sitekey: tsKey, theme: 'dark', callback: t => { cap.token = t; }, 'expired-callback': () => { cap.token = null; }, 'error-callback': () => { cap.token = null; } });
      cap.reset = () => { cap.token = null; try { ts.reset(cap.id); } catch (e) {} };
      el._cap = cap; return cap;
    }
  };

  window.GH = {
    captcha,
    ready: !!sb, sb, page, game, joinRoom, hub,
    contact: (name, email, message) => rpc('send_contact', { p_name: name, p_email: email, p_message: message })
  };
})();
