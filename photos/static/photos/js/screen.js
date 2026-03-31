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

  // 必須要素が存在しない場合は処理しない
  if (!container || !grid) return;

  // APIエンドポイント
  const apiUrl = container.dataset.apiUrl || "";

  // 新規投稿ポーリング間隔
  const POLL_MS = 1000;

  // ========================================
  // ピックアップ表示設定
  // ========================================
  const PICKUP_FIRST_DELAY_MS = 5 * 1000;  // 初回表示までの待機時間
  const PICKUP_EVERY_MS = 60 * 1000;       // ピックアップ表示間隔
  const PICKUP_SHOW_MS = 8 * 1000;         // 表示時間

  // ========================================
  // 状態管理用データ
  // ========================================

  // すでに表示済みの投稿ID
  const knownIds = new Set();

  // スクリーン表示に使う投稿データ
  let basePhotoData = [];

  // 新着投稿を優先してピックアップするためのキュー
  const pickupQueue = [];

  let pickupStarted = false;
  let pickupIntervalId = null; // 現状 clearInterval は未使用
  let pickupHideTimer = null;
  let pickupVisible = false;
  let lastPickupId = null;

  // ========================================
  // 写真0件時の表示切り替え
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
  // 画像URLの正規化
  // 相対パスの場合は /media/ を補完する
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

    const img = document.createElement("img");
    img.className = "screen-photo-image";
    img.alt = `photo by ${name}`;
    img.decoding = "async";
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

    for (let i = 0; i < 5; i++) {
      const col = document.createElement("div");
      col.className = "screen-column";
      grid.appendChild(col);
    }

    columns = Array.from(grid.querySelectorAll(".screen-column"));
  }

  // ========================================
  // 初期データ読み込み
  // サーバー側で埋め込まれた投稿情報を取り込む
  // ========================================
  if (initialDataBox) {
    const dataEls = initialDataBox.querySelectorAll(".screen-photo-card-data");

    dataEls.forEach((el) => {
      const p = {
        id: el.dataset.id,
        image_url: el.dataset.image,
        name: el.dataset.name,
        like_count: el.dataset.likes,
        comment: el.dataset.comment,
      };

      basePhotoData.push(p);
      knownIds.add(String(p.id));
    });
  }

  hideNoPhoto();

  // ========================================
  // 一番高さが低い列を取得
  // ========================================
  function pickShortestColumn() {
    let minH = Infinity;
    let target = columns[0];

    for (const col of columns) {
      const h = col.scrollHeight;
      if (h < minH) {
        minH = h;
        target = col;
      }
    }

    return target;
  }

  // ========================================
  // 写真を最短列に追加
  // ========================================
  function appendPhotoToShortestColumn(photoData, isNew = false) {
    const card = createCardElement(photoData);

    if (isNew) card.classList.add("is-new");

    pickShortestColumn().appendChild(card);
    hideNoPhoto();
  }

  // ========================================
  // 配列シャッフル
  // ========================================
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // ========================================
  // 表示用デッキ追加
  // 既存投稿をシャッフルして流し続ける
  // ========================================
  function appendDeck() {
    if (basePhotoData.length === 0) return;

    const deck = [...basePhotoData];
    shuffle(deck);

    for (const p of deck) {
      appendPhotoToShortestColumn(p, false);
    }
  }

  // ========================================
  // 自動スクロール処理
  // ========================================
  let started = false;
  const MIN_HEIGHT_MULTIPLIER = 3;
  const SPEED = 0.6;
  let lastTs = null;

  function hasAnyCards() {
    return columns.some((c) => c.children.length > 0);
  }

  function startScrollIfNeeded() {
    if (started) return;
    if (basePhotoData.length === 0) return;

    if (!hasAnyCards()) appendDeck();

    let guard = 0;
    while (grid.offsetHeight < container.clientHeight * MIN_HEIGHT_MULTIPLIER && guard < 10) {
      appendDeck();
      guard++;
    }

    started = true;

    function step(ts) {
      if (lastTs === null) lastTs = ts;

      const delta = ts - lastTs;
      lastTs = ts;

      const move = SPEED * (delta / (1000 / 60));
      container.scrollTop += move;

      const bottomPos = container.scrollTop + container.clientHeight;
      const gridHeight = grid.offsetHeight;
      const THRESHOLD = container.clientHeight * 3;

      if (gridHeight - bottomPos < THRESHOLD) appendDeck();

      requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  // ========================================
  // ピックアップ表示制御
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
  }

  function openPickup(p) {
    if (!canPickup()) return;

    const imgUrl = normalizeImageUrl(p);
    const likeCount = Number(p.like_count ?? 0);
    const comment = String(p.comment ?? "");
    const name = String(p.name ?? "");

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

    // 新着優先
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
  // after パラメータで差分のみ取得
  // ========================================
  let lastId = 0;

  for (const id of knownIds) {
    const n = Number(id);
    if (!Number.isNaN(n)) lastId = Math.max(lastId, n);
  }

  async function pollOnce() {
    if (!apiUrl) return;

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
          if (!Number.isNaN(n)) lastId = Math.max(lastId, n);

          const idStr = String(p.id);
          if (knownIds.has(idStr)) continue;
          knownIds.add(idStr);

          basePhotoData.push(p);
          pickupQueue.push(p);

          // 画面にも即追加
          appendPhotoToShortestColumn(p, true);
        }

        if (!started) startScrollIfNeeded();
        startPickupLoopIfNeeded();
      }
    } catch (e) {
      console.warn(e);
    }
  }

  // ========================================
  // いいね数の定期更新
  // 既存カードの表示中いいね数のみ更新する
  // ========================================
  const LIKE_REFRESH_MS = 3000;

  async function refreshLikesOnce() {
    if (!apiUrl) return;

    try {
      const res = await fetch(apiUrl, { cache: "no-store" });
      const ct = (res.headers.get("content-type") || "").toLowerCase();

      if (!res.ok) return;
      if (!ct.includes("application/json")) return;

      const data = await res.json();
      const photos = Array.isArray(data) ? data : (data.photos || []);

      for (const p of photos) {
        const idStr = String(p.id);
        const likeCount = Number(p.like_count ?? 0);

        const selector = `article[data-photo-id="${CSS.escape(idStr)}"]`;
        const articles = document.querySelectorAll(selector);

        if (!articles || articles.length === 0) continue;

        for (const article of articles) {
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

        // NOTE:
        // ピックアップ表示側のいいね更新処理は、
        // 現在のHTML構造と要素指定が一致しているか要確認
        const pickup = document.querySelector(
          `.pickup-overlay[data-photo-id="${CSS.escape(idStr)}"]`
        );

        if (pickup) {
          const pCount = pickup.querySelector(".pickup-like-count");
          if (pCount) pCount.textContent = String(likeCount);

          const pHeart = pickup.querySelector(".pickup-heart");
          if (pHeart) {
            pHeart.textContent = likeCount > 0 ? "♥" : "♡";
            pHeart.className = `pickup-heart ${
              likeCount > 0 ? "screen-heart--liked" : "screen-heart--no-like"
            }`;
          }
        }
      }
    } catch (e) {
      console.warn(e);
    }
  }

  // ========================================
  // 初回起動処理
  // ========================================

  // いいね数は即1回取得し、その後定期更新
  refreshLikesOnce();
  setInterval(refreshLikesOnce, LIKE_REFRESH_MS);

  // 新規投稿ポーリングを継続実行
  (function loop() {
    pollOnce().finally(() => setTimeout(loop, POLL_MS));
  })();

  // 初期データがある場合は描画開始
  if (basePhotoData.length > 0) {
    appendDeck();
    startScrollIfNeeded();
    startPickupLoopIfNeeded();
  }
});