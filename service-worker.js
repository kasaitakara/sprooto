const CACHE_NAME = "sprooto-v037";

const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/main.js"
];

/*
 * install
 * 最低限のapp shellを先に保存する。
 */
self.addEventListener(
  "install",
  event => {
    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then(cache =>
          cache.addAll(APP_SHELL)
        )
    );

    self.skipWaiting();
  }
);

/*
 * activate
 * 古いsprooto cacheを削除する。
 */
self.addEventListener(
  "activate",
  event => {
    event.waitUntil(
      caches
        .keys()
        .then(cacheNames =>
          Promise.all(
            cacheNames
              .filter(
                name =>
                  name.startsWith(
                    "sprooto-"
                  ) &&
                  name !== CACHE_NAME
              )
              .map(
                name =>
                  caches.delete(name)
              )
          )
        )
        .then(() =>
          self.clients.claim()
        )
    );
  }
);

/*
 * fetch
 *
 * online:
 *   networkから最新ファイルを取得してcache更新
 *
 * offline:
 *   保存済みcacheから返す
 *
 * main.jsからimportされる
 * sequencer.js / audio.js / ui.js / storage.js等も
 * 初回アクセス時に自動でcacheされる。
 */
self.addEventListener(
  "fetch",
  event => {
    const request = event.request;

    if (
      request.method !== "GET"
    ) {
      return;
    }

    const url =
      new URL(request.url);

    /*
     * sprooto自身のファイルだけを対象にする。
     */
    if (
      url.origin !==
      self.location.origin
    ) {
      return;
    }

    event.respondWith(
      fetch(request)
        .then(response => {
          if (
            !response ||
            response.status !== 200
          ) {
            return response;
          }

          const copy =
            response.clone();

          caches
            .open(CACHE_NAME)
            .then(cache =>
              cache.put(
                request,
                copy
              )
            );

          return response;
        })
        .catch(async () => {
          const cached =
            await caches.match(
              request
            );

          if (cached) {
            return cached;
          }

          /*
           * navigation要求なら
           * index.htmlへfallback。
           */
          if (
            request.mode ===
            "navigate"
          ) {
            return caches.match(
              "./index.html"
            );
          }

          throw new Error(
            "offline resource unavailable"
          );
        })
    );
  }
);