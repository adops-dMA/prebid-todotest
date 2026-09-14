# todotest-adtag

Wrapper propio de **Prebid + Google Ad Manager** para TodoTest, servido por **jsDelivr** y cargado desde **Google Tag Manager**. Sustituye a Pubstack.

Qué hace: encuentra los divs de anuncio, les pone id único, define el slot de GAM, lanza la subasta de Prebid **respetando el consentimiento** (TCF/`__tcfapi` de Didomi, que ya funciona) y pinta. Captura además los huecos que se inyectan **sobre la marcha** en los tests (MutationObserver) y hace **lazy-load**.

## Estructura
```
src/adtag.js        → el wrapper (aquí está toda la lógica y la CONFIG a rellenar)
prebid/prebid.js    → VUESTRO build de Prebid (ver prebid/README.md) — lo añadís vosotros
prebid/README.md    → cómo generar el build de Prebid con vuestros adapters
```

## Puesta en marcha (resumen)
1. **Rellenar la CONFIG** en `src/adtag.js`: `gamNetworkCode`, `placements[].adUnitPath`, `placements[].bids` (vuestros SSPs) y `prebidUrl`.
2. **Generar el build de Prebid** (ver `prebid/README.md`) y ponerlo en `prebid/prebid.js`.
3. **Subir a GitHub** (repo público) y crear una **release con tag** (`v1.0.0`).
4. **URL de jsDelivr**:
   `https://cdn.jsdelivr.net/gh/USUARIO/todotest-adtag@v1.0.0/src/adtag.js`
5. **GTM** → etiqueta HTML personalizada:
   ```html
   <script async src="https://cdn.jsdelivr.net/gh/USUARIO/todotest-adtag@v1.0.0/src/adtag.js"></script>
   ```
   Activador: Inicialización / All Pages. Publicar el contenedor.
6. **Verificar** en la app (chrome://inspect) con `TTAds.config.debug = true`.

## Cambios mínimos en la app (Cordova)
En `Ads_addFormat`, que el div lleve `data-ad` en vez de un id fijo:
```html
<!-- antes -->  <div id="div-roba1" class="roba"></div>
<!-- ahora -->  <div class="roba" data-ad="roba"></div>
```
El wrapper le pondrá un id único y lo gestionará solo (aunque se inyecte tarde). Placements disponibles: `roba`, `mega`, `sticky` (añade los que necesites en la CONFIG).

## ⚠️ Importante: la otra mitad está en GAM
Prebid solo pone las claves de puja (`hb_pb`, `hb_adid`…). Para que **rellene**, en GAM tienen que existir los **line items de Prebid** + la **creatividad universal**. Sin eso, la subasta se hace pero no se pinta. Es trabajo de ad-ops, aparte de este código.

## Actualizar
Cambias código → `git push` → nueva release `v1.0.1` → cambias el número de versión en el `<script>` de GTM → publicar. Usa siempre tag de versión (`@v1.0.0`), **nunca `@latest`/`@main`** en producción (caché de jsDelivr).
