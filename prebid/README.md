# Build de Prebid.js

Este wrapper carga VUESTRO build de Prebid (no el completo). Genera uno con solo
los módulos que usáis y ponlo aquí como `prebid.js`.

## Módulos que necesitáis ahora
- `consentManagement`      (GDPR/TCF — imprescindible, lee el __tcfapi de Didomi)
- `currency`
- `criteoBidAdapter`       (Criteo)
- `smilewantedBidAdapter`  (SmileWanted)
- (`gptPreAuction` recomendado, y `dfpAdServerVideo` solo si haréis vídeo)

## Opción A — desde la web (rápido)
https://docs.prebid.org/download.html → marca esos módulos → descarga → renómbralo a `prebid.js` aquí.

## Opción B — por línea de comandos
```bash
git clone https://github.com/prebid/Prebid.js.git
cd Prebid.js && npm ci
npx gulp build --modules=consentManagement,currency,criteoBidAdapter,smilewantedBidAdapter,gptPreAuction
# copia build/dist/prebid.js -> este repo como prebid/prebid.js
```

Después, en `src/adtag.js`, `CONFIG.prebidUrl` debe apuntar a este fichero vía jsDelivr:
`https://cdn.jsdelivr.net/gh/USUARIO/todotest-adtag@v1.0.0/prebid/prebid.js`
