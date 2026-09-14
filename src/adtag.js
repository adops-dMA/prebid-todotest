/*!
 * TodoTest Ad-tag — wrapper propio de Prebid + Google Ad Manager
 * -------------------------------------------------------------
 * Qué hace:
 *   1) Encuentra los divs de anuncio (marcados con data-ad="<placement>")
 *   2) Les pone un id ÚNICO (arregla el problema de ids duplicados)
 *   3) Define el slot de GAM
 *   4) Lanza la subasta de Prebid respetando el consentimiento (TCF/__tcfapi de Didomi)
 *   5) Pinta (refresh de GAM) — con lazy-load y captura de slots dinámicos (MutationObserver)
 *
 * Uso en la app: el div del hueco solo tiene que llevar el atributo data-ad.
 *   Antes:  <div id="div-roba1" class="roba"></div>   (id fijo, se duplicaba)
 *   Ahora:  <div class="roba" data-ad="roba"></div>   (el wrapper le pone id único)
 */
(function () {
  'use strict';

  // SSPs comunes a todas las posiciones. Devuelve un array NUEVO cada vez
  // (Prebid anota los objetos bid durante la subasta; no conviene compartirlos).
  function commonBids() {
    return [
      // Criteo — red 9976. OJO: según prebid.org, zoneId (deprecado) y networkId
      // NO se pueden usar juntos. Usamos zoneId (el que os dieron, igual en todas).
      // Si Criteo os pide el modo por network, cambia por: { networkId: 9976 }
      { bidder: 'criteo',      params: { zoneId: 114052 } },
      // SmileWanted — zoneId (string)
      { bidder: 'smilewanted', params: { zoneId: 'todotest.com_hb' } }
    ];
  }

  /* ==================== CONFIG — RELLENAR ==================== */
  var CONFIG = {
    // Network code de vuestra cuenta de GAM
    gamNetworkCode: '21665835665',

    // URL del build de Prebid. Se deduce SOLA del propio repo/tag desde el que se
    // carga este adtag.js (ver resolvePrebidUrl). Esto de abajo es solo un fallback.
    prebidUrl: 'https://cdn.jsdelivr.net/gh/adops-dMA/prebid-todotest@1.0.1/prebid/prebid.js',

    prebidTimeout: 1500,     // ms que espera la subasta antes de pedir a GAM
    currency: 'EUR',
    lazyLoad: true,          // pedir el anuncio cuando el hueco está cerca de verse
    lazyRootMargin: '300px',
    debug: false,            // pon true para ver logs [TTAds] en consola

    // Un "placement" por cada hueco. La app marca cada div con data-ad="<clave>".
    // Ad units REALES de TodoTest (red 21665835665, de PRIMER NIVEL).
    // Solo las de la APP: robas (web+móvil) + mtop y sticky (solo móvil).
    // OJO con las mayúsculas del code: Roba1/Roba2 (R), roba3/roba4 (r) — así, exacto.
    // (Web-only fuera: mega, sticky-desktop, skyleft, skyright. Rewarded lo lleva AdMob.)
    placements: {
      roba1:  { adUnitPath: '/21665835665/TT-Roba1', sizes: [[250,250],[300,250],[300,300],[300,600],[320,480]], bids: commonBids() },
      roba2:  { adUnitPath: '/21665835665/TT-Roba2', sizes: [[120,600],[160,300],[160,600],[300,100],[300,250],[300,300],[300,533],[300,600],[400,300]], bids: commonBids() },
      roba3:  { adUnitPath: '/21665835665/TT-roba3', sizes: [[250,250],[300,250],[300,300],[300,600],[320,480]], bids: commonBids() },
      roba4:  { adUnitPath: '/21665835665/TT-roba4', sizes: [[250,250],[300,250],[300,300],[300,600],[320,480]], bids: commonBids() },
      mtop:   { adUnitPath: '/21665835665/TT-mtop',   sizes: [[300,50],[300,100],[320,50],[320,100]], bids: commonBids() },
      sticky: { adUnitPath: '/21665835665/TT-sticky', sizes: [[300,50],[300,100],[320,50],[320,100]], bids: commonBids() }
    }
  };
  /* ========================================================== */

  var googletag = window.googletag = window.googletag || { cmd: [] };
  var pbjs = window.pbjs = window.pbjs || { que: [] };
  var counter = 0, started = false, observer = null;

  // Captura la URL de ESTE script al ejecutarse, para cargar el prebid.js del
  // MISMO repo/tag automáticamente (así no hay que tocar versiones a mano).
  var SELF_SRC = (document.currentScript && document.currentScript.src) || '';
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
    return CONFIG.prebidUrl; // fallback
  }

  function log() { if (CONFIG.debug) console.log.apply(console, ['[TTAds]'].concat([].slice.call(arguments))); }

  function loadScript(src, cb) {
    var exists = [].some.call(document.scripts, function (s) { return s.src === src; });
    if (exists) { cb && cb(); return; }
    var s = document.createElement('script');
    s.async = true; s.src = src;
    s.onload = function () { cb && cb(); };
    s.onerror = function () { log('ERROR cargando', src); };
    (document.head || document.documentElement).appendChild(s);
  }

  function setupServices() {
    googletag.cmd.push(function () {
      googletag.pubads().disableInitialLoad();   // no pedir a GAM hasta tener la puja
      googletag.pubads().collapseEmptyDivs(true);
      googletag.enableServices();
    });
    pbjs.que.push(function () {
      pbjs.setConfig({
        priceGranularity: 'medium',
        currency: { adServerCurrency: CONFIG.currency },
        // Lee el consentimiento del WebView (el __tcfapi que inyecta Didomi ya funciona)
        consentManagement: { gdpr: { cmpApi: 'iab', timeout: 3000, defaultGdprScope: true } }
      });
    });
  }

  function requestSlot(el, key) {
    var pl = CONFIG.placements[key];
    if (!pl) { log('placement desconocido:', key); return; }
    var code = el.id || (el.id = 'tt-' + key + '-' + (++counter)); // id único garantizado

    googletag.cmd.push(function () {
      var slot = googletag.defineSlot(pl.adUnitPath, pl.sizes, code);
      if (!slot) { log('no se pudo definir el slot', code); return; }
      slot.addService(googletag.pubads());

      pbjs.que.push(function () {
        pbjs.addAdUnits([{ code: code, mediaTypes: { banner: { sizes: pl.sizes } }, bids: pl.bids }]);
        pbjs.requestBids({
          adUnitCodes: [code],
          timeout: CONFIG.prebidTimeout,
          bidsBackHandler: function () {
            pbjs.setTargetingForGPTAsync([code]);
            googletag.cmd.push(function () {
              googletag.display(code);
              googletag.pubads().refresh([slot]);
              log('pintado', code, pl.adUnitPath);
            });
          }
        });
      });
    });
  }

  function registerSlot(el, key) {
    if (!el || el.getAttribute('data-ad-done') === '1') return;   // evita doble registro
    key = key || el.getAttribute('data-ad');
    if (!key || !CONFIG.placements[key]) return;
    el.setAttribute('data-ad-done', '1');

    if (CONFIG.lazyLoad && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { io.unobserve(el); requestSlot(el, key); }
        });
      }, { rootMargin: CONFIG.lazyRootMargin });
      io.observe(el);
    } else {
      requestSlot(el, key);
    }
  }

  // Escanea el DOM en busca de huecos aún no registrados
  function scan(root) {
    (root || document).querySelectorAll('[data-ad]:not([data-ad-done="1"])')
      .forEach(function (el) { registerSlot(el); });
  }

  // Captura huecos que se inyectan DESPUÉS (los tests los meten sobre la marcha)
  function watchDynamic() {
    if (observer || !window.MutationObserver) return;
    observer = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        [].forEach.call(m.addedNodes || [], function (n) {
          if (n.nodeType !== 1) return;
          if (n.matches && n.matches('[data-ad]')) registerSlot(n);
          if (n.querySelectorAll) scan(n);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    if (started) { scan(); return; }
    started = true;
    loadScript('https://securepubads.g.doubleclick.net/tag/js/gpt.js');
    loadScript(resolvePrebidUrl(), function () {
      setupServices();
      scan();
      watchDynamic();
    });
  }

  // API pública por si la app quiere llamar a mano (opcional):
  //   TTAds.registerSlot(elemento, 'roba')   ó   TTAds.scan()
  window.TTAds = { init: init, scan: scan, registerSlot: registerSlot, config: CONFIG };

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
