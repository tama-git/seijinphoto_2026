window.addEventListener("load", () => {
  // ========================================
  // 画面内の主要要素を取得
  // ========================================
  const container = document.querySelector(".screen-main");
  const grid = document.querySelector(".screen-photo-grid");
  const initialDataBox = document.getElementById("initialData");
  const noPhotoEl = document.getElementById("screenNoPhoto");

  // ピックアップ表示用要素
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
  const POLL_MS = 2000;
  const LIKE_REFRESH_MS = 10000;
  const PICKUP_FIRST_DELAY_MS = 5000;
  const PICKUP_EVERY_MS = 60000;
  const PICKUP_SHOW_MS = 8000;

  const SPEED = 0.6;
  const COLUMN_COUNT = 5;

  // 各列で最低限保持したい枚数
  const MIN_CARDS_PER_COLUMN = 6;

  // 上端からどれだけ見えなくなったら削除するか
  const REMOVE_MARGIN = 250;

  // ========================================
  // 状態管理
  // ========================================
  const knownIds = new Set();
  let basePhotoData = [];
  const pickupQueue = [];

  let pickupStarted = false;
  let pickupIntervalId = null;
  let pickupHideTimer = null;
  let pickupVisible = false;
  let lastPickupId = null;

  let lastId = 0;
  let pollRunning = false;
  let likeRefreshRunning = false;

  let started = false;
  let lastTs = null;

  // デッキ用
  let shuffledDeck = [];
  let deckCursor = 0;

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
  // 画像URL正規化
  // ========================================
  function normalizeImageUrl(p) {
    let imgUrl = p.image_url || p.image || "";
    if (imgUrl && !imgUrl.startsWith("/") && !imgUrl.startsWith("http")) {
      imgUrl = "/media/" + imgUrl;
    }
    return imgUrl;
  }

  // ========================================
  // 写真カードDOM生成
  // ========================================
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

  // ========================================
  // レーン（5列）準備
  // ========================================
  let columns = Array.from(grid.querySelectorAll(".screen-column"));

  if (columns.length === 0) {
    grid.innerHTML = "";

    for (let i = 0; i < COLUMN_COUNT; i++) {
      const col = document.createElement("div");
      col.className = "screen-column";
      col.dataset.columnIndex = String(i);
      grid.appendChild(col);
    }

    columns = Array.from(grid.querySelectorAll(".screen-column"));
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
        comment: el.dataset.comment,
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
  // デッキ生成
  // ========================================
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function rebuildDeck() {
    shuffledDeck = [...basePhotoData];
    shuffle(shuffledDeck);
    deckCursor = 0;
  }

  function getNextDeckItem() {
    if (basePhotoData.length === 0) return null;

    if (shuffledDeck.length === 0 || deckCursor >= shuffledDeck.length) {
      rebuildDeck();
    }

    const item = shuffledDeck[deckCursor];
    deckCursor += 1;
    return item;
  }

  // ========================================
  // 指定列に追加
  // ========================================
  function appendPhotoToColumn(column, photoData, isNew = false) {
    if (!column || !photoData) return;

    const card = createCardElement(photoData);
    if (isNew) {
      card.classList.add("is-new");
    }

    column.appendChild(card);
    hideNoPhoto();
  }

  // ========================================
  // 初期埋め
  // 各列に順番に必要枚数だけ入れる
  // ========================================
  function fillInitialColumns() {
    if (basePhotoData.length === 0) return;

    rebuildDeck();

    for (const col of columns) {
      while (col.children.length < MIN_CARDS_PER_COLUMN) {
        const p = getNextDeckItem();
        if (!p) break;
        appendPhotoToColumn(col, p, false);
      }
    }
  }

  // ========================================
  // 列ごとに順次削除・順次補充
  // ========================================
  function cleanupAndRefillColumns() {
    const containerTop = container.scrollTop;

    for (const col of columns) {
      let removedCount = 0;

      while (col.firstElementChild) {
        const first = col.firstElementChild;
        const cardBottom = first.offsetTop + first.offsetHeight;

        if (cardBottom < containerTop - REMOVE_MARGIN) {
          first.remove();
          removedCount += 1;
        } else {
          break;
        }
      }

      while (removedCount > 0) {
        const p = getNextDeckItem();
        if (!p) break;
        appendPhotoToColumn(col, p, false);
        removedCount -= 1;
      }

      while (col.children.length < MIN_CARDS_PER_COLUMN) {
        const p = getNextDeckItem();
        if (!p) break;
        appendPhotoToColumn(col, p, false);
      }
    }
  }

  // ========================================
  // 自動スクロール
  // ========================================
  function hasAnyCards() {
    return columns.some((c) => c.children.length > 0);
  }

  function startScrollIfNeeded() {
    if (started) return;
    if (basePhotoData.length === 0) return;

    if (!hasAnyCards()) {
      fillInitialColumns();
    }

    started = true;

    function step(ts) {
      if (lastTs === null) lastTs = ts;

      const delta = ts - lastTs;
      lastTs = ts;

      const move = SPEED * (delta / (1000 / 60));
      container.scrollTop += move;

      cleanupAndRefillColumns();

      requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
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
      tries++;
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
  // 新着は一旦一番短い列ではなく、最も子要素数が少ない列へ
  // ========================================
  function pickColumnForNewPost() {
    let target = columns[0];
    let minCount = Infinity;

    for (const col of columns) {
      const count = col.children.length;
      if (count < minCount) {
        minCount = count;
        target = col;
      }
    }

    return target;
  }

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

          appendPhotoToColumn(pickColumnForNewPost(), p, true);
        }

        rebuildDeck();

        if (!started) startScrollIfNeeded();
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
    fillInitialColumns();
    startScrollIfNeeded();
    startPickupLoopIfNeeded();
  }

  startLikeRefreshLoop();
  startPollLoop();
});
