/**
 * Inline <head> bootstrap for MES PWA installability.
 *
 * Must run before the entry.client module graph loads: on Android Chrome with
 * an already-active service worker, `beforeinstallprompt` can fire during HTML
 * parse — before React / entry.client hydrates. Capturing only in entry.client
 * therefore misses the event and every Install tap falls through to the help
 * sheet.
 *
 * Also registers `/serviceWorker.js` with scope `/` so `/login` and `/shop`
 * both become controlled as early as possible.
 *
 * Injected from `root.tsx` with the document CSP nonce.
 */
export const PWA_BOOTSTRAP_INLINE_SCRIPT = `(function(){try{var w=window;var KEY="carbon-mes-pwa-installed";w.__carbonMesPwa=w.__carbonMesPwa||{deferred:null,capturing:false};if(!w.__carbonMesPwa.capturing){w.__carbonMesPwa.capturing=true;w.addEventListener("beforeinstallprompt",function(e){e.preventDefault();w.__carbonMesPwa.deferred=e;try{w.localStorage.removeItem(KEY)}catch(_){}});}if("serviceWorker"in navigator){navigator.serviceWorker.register("/serviceWorker.js",{scope:"/",updateViaCache:"none"}).catch(function(){})}}catch(_){}})();`;

export const PWA_BOOTSTRAP_WINDOW_KEY = "__carbonMesPwa" as const;
