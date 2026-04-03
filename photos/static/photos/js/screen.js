window.addEventListener("load", () => {
  const container = document.querySelector(".screen-main");
  const grid = document.querySelector(".screen-photo-grid");
  const initialDataBox = document.getElementById("initialData");
  const noPhotoEl = document.getElementById("screenNoPhoto");

  const pickupOverlay = document.getElementById("pickupOverlay");
  const pickupCard = document.getElementById("pickupCard");
  const pickupImage = document.getElementById("pickupImage");
  const pickupName = document.getElementById("pickupName");
  const pickupHeart = document.getElementById("pickupHeart");
  const pickupLikeCount = document.getElementById("pickupLikeCount");
  const pickupMessage = document.getElementById("pickupMessage");

  if (!container || !grid) return;

  const apiUrl = container.dataset.apiUrl || "";

  // ========================================
  // 設定
  // ========================================
  const COLUMN_COUNT = 5;
  const MIN_ITEMS_PER_COLUMN = 8;
  const POLL_MS = 4000;
  const LIKE_REFRESH_MS = 10000;

  const PICKUP_FIRST_DELAY_MS = 5000;
  const PICKUP_EVERY_MS = 60000;
  const PICKUP_SHOW_MS = 8000;

  // 1秒あたり何px流すか
  //スクロール速度
  const BASE_PX_PER_SEC = 24;

  // ========================================
  // 状態
  // ========================================
  const knownIds = new Set();
  let basePhotoData = [];
  let lastId = 0;

  const pickupQueue = [];
  let pickupStarted = false;
  let pickupIntervalId = null;
  let pickupHideTimer = null;
  let pickupVisible = false;
  let lastPickupId = null;

  let pollRunning = false;
  let likeRefreshRunning = false;

  // ========================================
  // 0件表示切り替え
  // ========================================
  function hideNoPhoto() {
    if (!noPhotoEl) return;
    if (basePhotoData.length > 0) {
      noPhotoEl.classList.add("is-hidden");
    } else {
      noPhotoEl.classList.remove("is-hidden");
    }
  }

  // ========================================
  // 初期データ読み込み
  // ========================================
  if (initialDataBox) {
    const dataEls = initialDataBox.querySelectorAll(".screen-photo-card-data");

    dataEls.forEach((el) => {
      const p = {
        id: el.dataset.id,
        image_url: el.dataset.image,
        name: el.dataset.name,
        like_count: Number(el.dataset.likes ?? 0),
        comment: el.dataset.comment ?? "",
      };

      basePhotoData.push(p);
      knownIds.add(String(p.id));

      const n = Number(p.id);
      if (!Number.isNaN(n)) {
        lastId = Math.max(lastId, n);
      }
    });
  }

  hideNoPhoto();

  // ========================================
  // ユーティリティ
  // ========================================
  function normalizeImageUrl(p) {
    let imgUrl = p.image_url || p.image || "";
    if (imgUrl && !imgUrl.startsWith("/") && !imgUrl.startsWith("http")) {
      imgUrl = "/media/" + imgUrl;
    }
    return imgUrl;
  }

  function shuffle(arr) {
    const copied = [...arr];
    for (let i = copied.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copied[i], copied[j]] = [copied[j], copied[i]];
    }
    return copied;
  }

  function createCardElement(p) {
    const idStr = String(p.id ?? "");
    const name = String(p.name ?? "");
    const comment = String(p.comment ?? "");
    const likeCount = Number(p.like_count ?? 0);

    const article = document.createElement("article");
    article.className = `screen-photo-card ${comment ? "has-message" : "no-message"}`;
    article.setAttribute("data-photo-id", idStr);
    article.dataset.likes = String(likeCount);

    const img = document.createElement("img");
    img.className = "screen-photo-image";
    img.alt = `photo by ${name}`;
    img.decoding = "async";
    img.loading = "lazy";
    img.src = normalizeImageUrl(p);

    const meta = document.createElement("div");
    meta.className = "screen-photo-meta";

    const nameSpan = document.createElement("span");
    nameSpan.className = "screen-name";
    nameSpan.textContent = name;

    const likeWrap = document.createElement("div");
    likeWrap.className = "screen-like-display";

    const heart = document.createElement("span");
    heart.className = `screen-heart ${likeCount > 0 ? "screen-heart--liked" : "screen-heart--no-like"}`;
    heart.textContent = likeCount > 0 ? "♥" : "♡";

    const count = document.createElement("span");
    count.className = "screen-like-count";
    count.textContent = String(likeCount);

    likeWrap.append(heart, count);
    meta.append(nameSpan, likeWrap);

    article.append(img, meta);

    if (comment) {
      const msg = document.createElement("p");
      msg.className = "screen-message";
      msg.textContent = comment;
      article.appendChild(msg);
    }

    return article;
  }

  function duplicateCards(items) {
    return items.map((p) => createCardElement(p));
  }

  function splitIntoColumns(items, columnCount) {
    const cols = Array.from({ length: columnCount }, () => []);

    items.forEach((item, index) => {
      cols[index % columnCount].push(item);
    });

    return cols;
  }

  function normalizeColumnItems(items, minCount) {
    if (items.length === 0) return [];

    const result = [];
    let i = 0;

    while (result.length < minCount) {
      result.push(items[i % items.length]);
      i += 1;
    }

    return result;
  }

  function buildColumnFeed(allPhotos) {
    if (allPhotos.length === 0) return Array.from({ length: COLUMN_COUNT }, () => []);

    const shuffled = shuffle(allPhotos);
    const distributed = splitIntoColumns(shuffled, COLUMN_COUNT);

    return distributed.map((colItems) => normalizeColumnItems(colItems, MIN_ITEMS_PER_COLUMN));
  }

  // ========================================
  // 列描画
  // ========================================
  function renderColumns() {
    const columns = Array.from(grid.querySelectorAll(".screen-column"));

    if (columns.length === 0) return;

    columns.forEach((col) => {
      col.innerHTML = "";
    });

    if (basePhotoData.length === 0) {
      hideNoPhoto();
      return;
    }

    const columnFeeds = buildColumnFeed(basePhotoData);

    columns.forEach((col, index) => {
      const feed = columnFeeds[index];
      if (!feed || feed.length === 0) return;

      const track = document.createElement("div");
      track.className = "screen-column-track";

      const groupA = document.createElement("div");
      groupA.className = "screen-column-group";

      const groupB = document.createElement("div");
      groupB.className = "screen-column-group";

      duplicateCards(feed).forEach((card) => groupA.appendChild(card));
      duplicateCards(feed).forEach((card) => groupB.appendChild(card));

      track.append(groupA, groupB);
      col.appendChild(track);

      requestAnimationFrame(() => {
        const distance = groupA.offsetHeight;
        if (distance <= 0) return;

        const pxPerSec = BASE_PX_PER_SEC + index * 1.5;
        const duration = Math.max(distance / pxPerSec, 18);

        track.style.setProperty("--loop-distance", `${distance}px`);
        track.style.setProperty("--loop-duration", `${duration}s`);
        track.style.animationDelay = `${-index * 2}s`;
      });
    });

    hideNoPhoto();
  }

  // ========================================
  // ピックアップ表示
  // ========================================
  function canPickup() {
    return (
      pickupOverlay &&
      pickupImage &&
      pickupName &&
      pickupHeart &&
      pickupLikeCount &&
      pickupMessage &&
      basePhotoData.length > 0
    );
  }

  function closePickup() {
    if (!pickupOverlay) return;
    pickupOverlay.classList.remove("is-show");
    pickupVisible = false;
    pickupOverlay.removeAttribute("data-photo-id");
  }

  function openPickup(p) {
    if (!canPickup()) return;

    const imgUrl = normalizeImageUrl(p);
    const likeCount = Number(p.like_count ?? 0);
    const comment = String(p.comment ?? "");
    const name = String(p.name ?? "");

    pickupOverlay.setAttribute("data-photo-id", String(p.id ?? ""));
    pickupImage.src = imgUrl;
    pickupImage.alt = "pickup";
    pickupName.textContent = name;

    pickupHeart.textContent = likeCount > 0 ? "♥" : "♡";
    pickupHeart.className = `screen-heart ${likeCount > 0 ? "screen-heart--liked" : "screen-heart--no-like"}`;
    pickupLikeCount.textContent = String(likeCount);

    if (comment.trim()) {
      pickupMessage.textContent = comment;
      pickupMessage.classList.remove("is-hidden");
      pickupCard.classList.remove("no-message");
      pickupCard.classList.add("has-message");
    } else {
      pickupMessage.textContent = "";
      pickupMessage.classList.add("is-hidden");
      pickupCard.classList.add("no-message");
      pickupCard.classList.remove("has-message");
    }

    pickupOverlay.classList.add("is-show");
    pickupVisible = true;

    clearTimeout(pickupHideTimer);
    pickupHideTimer = setTimeout(closePickup, PICKUP_SHOW_MS);
  }

  function pickRandomFromBase() {
    if (basePhotoData.length === 0) return null;
    if (basePhotoData.length === 1) return basePhotoData[0];

    let p = null;
    let tries = 0;

    while (tries < 10) {
      p = basePhotoData[Math.floor(Math.random() * basePhotoData.length)];
      if (String(p.id) !== String(lastPickupId)) break;
      tries += 1;
    }

    return p;
  }

  function runPickup() {
    if (!canPickup()) return;
    if (pickupVisible) return;

    let p = null;

    while (pickupQueue.length > 0) {
      const candidate = pickupQueue.shift();
      if (candidate) {
        p = candidate;
        break;
      }
    }

    if (!p) p = pickRandomFromBase();
    if (!p) return;

    lastPickupId = p.id ?? null;
    openPickup(p);
  }

  function startPickupLoopIfNeeded() {
    if (pickupStarted) return;
    if (!canPickup()) return;

    pickupStarted = true;

    setTimeout(() => {
      runPickup();
      pickupIntervalId = setInterval(runPickup, PICKUP_EVERY_MS);
    }, PICKUP_FIRST_DELAY_MS);
  }

  // ========================================
  // 新規投稿ポーリング
  // 新着が来たら列を再構築
  // ========================================
  async function pollOnce() {
    if (!apiUrl || pollRunning) return;
    pollRunning = true;

    const url = `${apiUrl}?after=${lastId}`;

    try {
      const res = await fetch(url, { cache: "no-store" });
      const ct = (res.headers.get("content-type") || "").toLowerCase();

      if (!res.ok) return;
      if (!ct.includes("application/json")) return;

      const data = await res.json();
      const photos = Array.isArray(data) ? data : (data.photos || []);

      if (photos.length > 0) {
        for (const p of photos) {
          const n = Number(p.id);
          if (!Number.isNaN(n)) {
            lastId = Math.max(lastId, n);
          }

          const idStr = String(p.id);
          if (knownIds.has(idStr)) continue;

          knownIds.add(idStr);
          p.like_count = Number(p.like_count ?? 0);

          basePhotoData.push(p);
          pickupQueue.push(p);
        }

        renderColumns();
        startPickupLoopIfNeeded();
      }
    } catch (e) {
      console.warn(e);
    } finally {
      pollRunning = false;
    }
  }

  // ========================================
  // いいね更新
  // 表示中カード + ピックアップのみ更新
  // ========================================
  async function refreshLikesOnce() {
    if (!apiUrl || likeRefreshRunning) return;
    likeRefreshRunning = true;

    try {
      const res = await fetch(apiUrl, { cache: "no-store" });
      const ct = (res.headers.get("content-type") || "").toLowerCase();

      if (!res.ok) return;
      if (!ct.includes("application/json")) return;

      const data = await res.json();
      const photos = Array.isArray(data) ? data : (data.photos || []);
      const photoMap = new Map();

      for (const p of photos) {
        photoMap.set(String(p.id), Number(p.like_count ?? 0));
      }

      const visibleArticles = document.querySelectorAll("article[data-photo-id]");

      for (const article of visibleArticles) {
        const idStr = article.getAttribute("data-photo-id") || "";
        if (!photoMap.has(idStr)) continue;

        const likeCount = photoMap.get(idStr) ?? 0;
        article.dataset.likes = String(likeCount);

        const countEl = article.querySelector(".screen-like-count");
        if (countEl) countEl.textContent = String(likeCount);

        const heartEl = article.querySelector(".screen-heart");
        if (heartEl) {
          heartEl.textContent = likeCount > 0 ? "♥" : "♡";
          heartEl.className = `screen-heart ${
            likeCount > 0 ? "screen-heart--liked" : "screen-heart--no-like"
          }`;
        }
      }

      const pickupId = pickupOverlay?.getAttribute("data-photo-id");
      if (pickupId && photoMap.has(pickupId)) {
        const likeCount = photoMap.get(pickupId) ?? 0;
        pickupLikeCount.textContent = String(likeCount);
        pickupHeart.textContent = likeCount > 0 ? "♥" : "♡";
        pickupHeart.className = `screen-heart ${
          likeCount > 0 ? "screen-heart--liked" : "screen-heart--no-like"
        }`;
      }

      for (const p of basePhotoData) {
        const idStr = String(p.id);
        if (photoMap.has(idStr)) {
          p.like_count = photoMap.get(idStr) ?? 0;
        }
      }
    } catch (e) {
      console.warn(e);
    } finally {
      likeRefreshRunning = false;
    }
  }

  function startLikeRefreshLoop() {
    refreshLikesOnce();

    (function loop() {
      setTimeout(async () => {
        await refreshLikesOnce();
        loop();
      }, LIKE_REFRESH_MS);
    })();
  }

  function startPollLoop() {
    (function loop() {
      setTimeout(async () => {
        await pollOnce();
        loop();
      }, POLL_MS);
    })();
  }

  // ========================================
  // 初回起動
  // ========================================
  if (basePhotoData.length > 0) {
    renderColumns();
    startPickupLoopIfNeeded();
  }

  startLikeRefreshLoop();
  startPollLoop();
});
