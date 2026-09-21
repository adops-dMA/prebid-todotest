/*!
 * TodoTest Ad-tag v1.1.0 — wrapper propio de Prebid + Google Ad Manager
 * --------------------------------------------------------------------
 * Base: adops-dMA/prebid-todotest@1.0.2/src/adtag.js
 *
 * Cambios sobre 1.0.x:
 *  1) GUARDAS: no pinta nada sin respuesta de CMP ni a usuarios sin publi.
 *     Espera a que Didomi resuelva en vez de abortar.
 *  2) FAILSAFE: si prebid.js no carga, GAM se sirve igual (antes: cero ads).
 *  3) BATCHING: una sola subasta y un solo request a GAM para los huecos
 *     que aparecen juntos, en vez de uno por slot.
 *  4) WebView: userSync off, storageControl relajado, ortb2 con contexto.
 *  5) Señalización: lee los <meta ad:site|ad:pagetype|ad:Technology> que ya
 *     existen en las 73 pantallas y los manda a GAM y a los bidders.
 *
 * DÓNDE VIVE: se carga desde GTM (GTM-MRHFH939) con un tag Custom HTML que
 * hace <script src="...">, NO pegando el cuerpo de este fichero. Ver notas
 * al final sobre resolvePrebidUrl().
 *
 * LO QUE NO TOCA: intersticial y App Open los sirve AdMob nativo (admob-plus).
 */
(function () {
  'use strict';

  if (window.__TTADS__) return;
  window.__TTADS__ = true;

  function commonBids() {
    return [
      // Criteo — red 9976. zoneId y networkId no se pueden usar juntos.
      { bidder: 'criteo', params: { zoneId: 114052 } },
      { bidder: 'smilewanted', params: { zoneId: 'todotest.com_hb' } }
    ];
  }

  /* ==================== CONFIG ==================== */

  var CONFIG = {
    gamNetworkCode: '21665835665',

    // Fallback. Normalmente NO se usa: resolvePrebidUrl() deduce la URL del
    // mismo tag desde el que se carga este adtag.js.
    prebidUrl: 'https://cdn.jsdelivr.net/gh/adops-dMA/prebid-todotest@1.1.0/prebid/prebid.js',

    prebidTimeout: 1600,      // WebView + red móvil
    failsafeMs: 3500,         // si prebid no vuelve, se pide a GAM igual
    batchMs: 150,             // ventana para agrupar huecos en una subasta
    consentWaitMs: 20000,     // cuánto esperamos a que Didomi resuelva

    currency: 'EUR',
    lazyLoad: true,
    lazyRootMargin: '300px',
    debug: false,

    // Si true, el tag SOLO se ejecuta dentro de la app Cordova.
    // Necesario si GTM-MRHFH939 es el mismo contenedor que usa la web:
    // la WebView sirve desde https://todotest.com, o sea el MISMO origen
    // que el sitio real, así que filtrar por hostname no vale para nada.
    // Ponlo a false el día que quieras usar este mismo adtag en web.
    onlyInApp: true,

    placements: {
      roba1:  { adUnitPath: '/21665835665/TT-Roba1', sizes: [[250,250],[300,250],[300,300],[300,600],[320,480]], bids: commonBids() },
      roba2:  { adUnitPath: '/21665835665/TT-Roba2', sizes: [[120,600],[160,300],[160,600],[300,100],[300,250],[300,300],[300,533],[300,600],[400,300]], bids: commonBids() },
      roba3:  { adUnitPath: '/21665835665/TT-roba3', sizes: [[250,250],[300,250],[300,300],[300,600],[320,480]], bids: commonBids() },
      roba4:  { adUnitPath: '/21665835665/TT-roba4', sizes: [[250,250],[300,250],[300,300],[300,600],[320,480]], bids: commonBids() },
      mtop:   { adUnitPath: '/21665835665/TT-mtop',  sizes: [[300,50],[300,100],[320,50],[320,100]], bids: commonBids() },
      sticky: { adUnitPath: '/21665835665/TT-sticky',sizes: [[300,50],[300,100],[320,50],[320,100]], bids: commonBids() },
      mega1:  { adUnitPath: '/21665835665/TT-mega1', sizes: [[728,90],[970,90],[970,250],[980,250],[300,250]], bids: commonBids() },
      'sticky-desktop': { adUnitPath: '/21665835665/TT-sticky-desktop', sizes: [[728,90],[970,90]], bids: commonBids() }
    },

    currentDivs: [
      { sel: '[id="div-roba1"]',  placement: 'roba1' },
      { sel: '[id="div-roba2"]',  placement: 'roba2' },
      { sel: '[id="div-roba3"]',  placement: 'roba3' },
      { sel: '[id="div-roba4"]',  placement: 'roba4' },
      { sel: '[id="div-mtop"]',   placement: 'mtop' },
      { sel: '[id="div-mega1"]',  placement: 'mega1' },
      { sel: '[id="div-sticky"]', placement: 'sticky' },
      { sel: '[id="div-sticky-desktop"]', placement: 'sticky-desktop' }
    ]
  };

  /* ================================================ */

  var googletag = window.googletag = window.googletag || { cmd: [] };
  var pbjs = window.pbjs = window.pbjs || { que: [] };
  var counter = 0, started = false, observer = null;
  var prebidOk = false, servicesUp = false;

  var SELF_SRC = (document.currentScript && document.currentScript.src) || '';

  function log() { if (CONFIG.debug) console.log.apply(console, ['[TTAds]'].concat([].slice.call(arguments))); }

  function resolvePrebidUrl() {
    var src = SELF_SRC;
    if (!src) {
      var m = [].slice.call(document.scripts).filter(function (s) {
        return /\/src\/adtag(\.min)?\.js/.test(s.src);
      }).pop();
      src = m ? m.src : '';
    }
    if (src && src.indexOf('/src/adtag') !== -1) {
      return src.replace(/\/src\/adtag(\.min)?\.js.*$/, '/prebid/prebid.js');
    }
    return CONFIG.prebidUrl;
  }

  function loadScript(src, onload, onerror) {
    var exists = [].some.call(document.scripts, function (s) { return s.src === src; });
    if (exists) { onload && onload(); return; }
    var s = document.createElement('script');
    s.async = true; s.src = src;
    s.onload = function () { onload && onload(); };
    s.onerror = function () { log('ERROR cargando', src); onerror && onerror(); };
    (document.head || document.documentElement).appendChild(s);
  }

  /* ==================== GUARDAS ====================
   * La app marca el usuario sin publicidad en localStorage 'publi' y el
   * estado del CMP en hasCMPResponse (didomi-helper.js lo persiste también
   * en localStorage). Didomi nativo puede tardar, así que esperamos en vez
   * de abortar.
   * ================================================= */

  // ¿Estamos dentro de la app Cordova?
  // window.cordova lo define cordova.js, que cargan TODAS las pantallas del
  // bundle, y en la web no existe jamás.
  //
  // NO se usa el meta ad:Technology como aval: GTM-MRHFH939 es un contenedor
  // COMPARTIDO con la web, y si alguna plantilla web arrastrase ese meta con
  // valor 'app' tendríamos publicidad de app sirviéndose en el sitio. Solo
  // señales que no pueden existir fuera del contenedor Cordova.
  function isCordovaApp() {
    if (typeof window.cordova !== 'undefined') return true;
    if (typeof window._cordovaNative !== 'undefined') return true;   // bridge Android
    return false;
  }

  function noPubli() {
    try { return window.localStorage.getItem('publi') === 'true'; } catch (e) { return false; }
  }

  function consentAnswered() {
    if (typeof window.hasCMPResponse === 'boolean') return window.hasCMPResponse;
    try { return window.localStorage.getItem('hasCMPResponse') === 'true'; } catch (e) { return false; }
  }

  function whenConsent(cb) {
    if (consentAnswered()) { cb(); return; }

    var done = false, poll = null, deadline = null;
    function fire() {
      if (done) return;
      done = true;
      if (poll) clearInterval(poll);
      if (deadline) clearTimeout(deadline);
      cb();
    }

    // Vía CMP: Didomi dispara estos eventos cuando el usuario responde.
    if (typeof window.__tcfapi === 'function') {
      try {
        window.__tcfapi('addEventListener', 2, function (tcData, ok) {
          if (!ok || !tcData) return;
          if (tcData.eventStatus === 'tcloaded' || tcData.eventStatus === 'useractioncomplete') {
            if (consentAnswered()) fire();
          }
        });
      } catch (e) {}
    }

    // Red de seguridad: la app escribe hasCMPResponse por su cuenta.
    poll = setInterval(function () { if (consentAnswered()) fire(); }, 250);

    // Si a los N segundos no hay respuesta, no pintamos. Silencio, no ads.
    deadline = setTimeout(function () {
      if (done) return;
      done = true;
      clearInterval(poll);
      log('sin respuesta de CMP tras', CONFIG.consentWaitMs, 'ms — no se cargan ads');
    }, CONFIG.consentWaitMs);
  }

  /* ==================== CONTEXTO ====================
   * Los <meta ad:*> ya están en 73 pantallas del bundle. Se usan tal cual.
   * ================================================== */

  function meta(name) {
    var el = document.querySelector('meta[name="' + name + '"]');
    return el ? (el.getAttribute('content') || '') : '';
  }

  var CTX = {
    site: meta('ad:site') || 'todotest',
    pagetype: meta('ad:pagetype') || 'otros',
    tech: meta('ad:Technology') || 'app'
  };

  /* ==================== SERVICIOS ==================== */

  function setupGPT() {
    if (servicesUp) return;
    servicesUp = true;
    googletag.cmd.push(function () {
      googletag.pubads().disableInitialLoad();
      googletag.pubads().collapseEmptyDivs(true);
      googletag.pubads().enableSingleRequest();
      googletag.pubads().setTargeting('surface', 'app_webview');
      googletag.pubads().setTargeting('tt_site', CTX.site);
      googletag.pubads().setTargeting('pagetype', CTX.pagetype);
      googletag.pubads().setTargeting('technology', CTX.tech);
      googletag.enableServices();
    });
  }

  function setupPrebid() {
    pbjs.que.push(function () {
      pbjs.setConfig({
        priceGranularity: 'medium',
        bidderTimeout: CONFIG.prebidTimeout,
        currency: { adServerCurrency: CONFIG.currency },

        // En WebView los syncs por iframe no persisten: solo latencia.
        userSync: { syncEnabled: false },

        // El build lleva storageControl compilado y por defecto va 'strict'.
        // El disclosure de SmileWanted viene vacío, así que en estricto le
        // bloquea el storage sin decir nada. 'relaxed' solo avisa.
        storageControl: { enforcement: 'relaxed' },

        consentManagement: {
          gdpr: { cmpApi: 'iab', timeout: 3000, defaultGdprScope: true }
        },

        ortb2: {
          site: {
            domain: 'todotest.com',
            ext: {
              data: {
                surface: 'app_webview',
                tt_site: CTX.site,
                pagetype: CTX.pagetype,
                technology: CTX.tech
              }
            }
          }
        }
      });
    });
  }

  /* ==================== SLOTS ==================== */

  function uniqueId(el, key) {
    var id = el.id;
    if (id) {
      var same = document.querySelectorAll('[id="' + id.replace(/"/g, '\\"') + '"]');
      if (same.length === 1) return id;
    }
    return (el.id = 'tt-' + key + '-' + (++counter));
  }

  var queue = [];         // [{code, placement}] pendientes de subasta
  var batchTimer = null;

  function enqueue(el, key) {
    var pl = CONFIG.placements[key];
    if (!pl) { log('placement desconocido:', key); return; }
    var code = uniqueId(el, key);
    queue.push({ code: code, pl: pl });
    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = setTimeout(runBatch, CONFIG.batchMs);
  }

  function runBatch() {
    batchTimer = null;
    if (!queue.length) return;
    var batch = queue.slice();
    queue.length = 0;

    googletag.cmd.push(function () {
      var slots = [], codes = [], units = [];

      for (var i = 0; i < batch.length; i++) {
        var it = batch[i];
        var slot = googletag.defineSlot(it.pl.adUnitPath, it.pl.sizes, it.code);
        if (!slot) { log('no se pudo definir', it.code); continue; }
        slot.addService(googletag.pubads());
        googletag.display(it.code);
        slots.push(slot);
        codes.push(it.code);
        units.push({
          code: it.code,
          mediaTypes: { banner: { sizes: it.pl.sizes } },
          bids: it.pl.bids
        });
      }
      if (!slots.length) return;

      deliverWithAuction(codes, units, slots);
    });
  }

  function deliverWithAuction(codes, units, slots) {
    var done = false;

    function deliver() {
      if (done) return;
      done = true;
      googletag.cmd.push(function () {
        if (prebidOk) { try { pbjs.setTargetingForGPTAsync(codes); } catch (e) {} }
        googletag.pubads().refresh(slots);
        log('pintado', codes.join(','));
      });
    }

    // Failsafe: pase lo que pase con Prebid, GAM se sirve.
    setTimeout(deliver, CONFIG.failsafeMs);

    if (!prebidOk) { deliver(); return; }

    pbjs.que.push(function () {
      try {
        pbjs.addAdUnits(units);
        pbjs.requestBids({
          adUnitCodes: codes,
          timeout: CONFIG.prebidTimeout,
          bidsBackHandler: deliver
        });
      } catch (e) { log('error en requestBids', e); deliver(); }
    });
  }

  function registerSlot(el, key) {
    if (!el || el.getAttribute('data-ad-done') === '1') return;
    key = key || el.getAttribute('data-ad');
    if (!key || !CONFIG.placements[key]) return;
    el.setAttribute('data-ad-done', '1');

    if (CONFIG.lazyLoad && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { io.unobserve(el); enqueue(el, key); }
        });
      }, { rootMargin: CONFIG.lazyRootMargin });
      io.observe(el);
    } else {
      enqueue(el, key);
    }
  }

  /* ==================== DESCUBRIMIENTO ==================== */

  function scan(root) {
    var scope = root || document;
    [].forEach.call(scope.querySelectorAll('[data-ad]:not([data-ad-done="1"])'),
      function (el) { registerSlot(el); });
    (CONFIG.currentDivs || []).forEach(function (rule) {
      [].forEach.call(scope.querySelectorAll(rule.sel), function (el) {
        if (el.getAttribute('data-ad-done') !== '1') registerSlot(el, rule.placement);
      });
    });
  }

  function watchDynamic() {
    if (observer || !window.MutationObserver) return;
    observer = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        [].forEach.call(m.addedNodes || [], function (n) {
          if (n.nodeType !== 1) return;
          if (n.matches) {
            if (n.matches('[data-ad]')) registerSlot(n);
            (CONFIG.currentDivs || []).forEach(function (rule) {
              if (n.matches(rule.sel) && n.getAttribute('data-ad-done') !== '1') {
                registerSlot(n, rule.placement);
              }
            });
          }
          if (n.querySelectorAll) scan(n);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ==================== ARRANQUE ==================== */

  function boot() {
    if (started) { scan(); return; }
    started = true;

    // GPT y Prebid en paralelo. GPT se configura en cuanto carga, sin
    // esperar a Prebid: así un fallo de Prebid no deja la página sin ads.
    loadScript('https://securepubads.g.doubleclick.net/tag/js/gpt.js');
    setupGPT();

    loadScript(
      resolvePrebidUrl(),
      function () { prebidOk = true; setupPrebid(); },
      function () { prebidOk = false; log('sin Prebid, solo GAM'); }
    );

    scan();
    watchDynamic();
  }

  function init() {
    if (CONFIG.onlyInApp && !isCordovaApp()) { log('no es la app Cordova, no se ejecuta'); return; }
    if (noPubli()) { log('usuario sin publicidad'); return; }
    whenConsent(boot);
  }

  window.TTAds = {
    init: init,
    scan: scan,
    registerSlot: registerSlot,
    config: CONFIG,
    ctx: CTX
  };

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
