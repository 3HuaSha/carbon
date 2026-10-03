/**
 * Inline <head> bootstrap for MES PWA installability.
 *
 * Injected near the top of <head> (before CSS/module links) so Android Chrome
 * registers the SW and captures `beforeinstallprompt` during HTML parse —
 * before the entry.client bundle downloads. Capturing only in entry.client
 * misses BIP when an already-active SW fires it early; Install then always
 * opens the help sheet.
 *
 * Registers `/serviceWorker.js` with scope `/` so `/login` and `/shop` both
 * become controlled as early as possible.
 *
 * Injected from `root.tsx` with the document CSP nonce.
 */
export const PWA_BOOTSTRAP_INLINE_SCRIPT = `(function(){try{var w=window;var KEY="carbon-mes-pwa-installed";w.__carbonMesPwa=w.__carbonMesPwa||{deferred:null,capturing:false};if(!w.__carbonMesPwa.capturing){w.__carbonMesPwa.capturing=true;w.addEventListener("beforeinstallprompt",function(e){e.preventDefault();w.__carbonMesPwa.deferred=e;try{w.localStorage.removeItem(KEY)}catch(_){}});}if("serviceWorker"in navigator){navigator.serviceWorker.register("/serviceWorker.js",{scope:"/",updateViaCache:"none"}).catch(function(){})}}catch(_){}})();`;

export const PWA_BOOTSTRAP_WINDOW_KEY = "__carbonMesPwa" as const;
