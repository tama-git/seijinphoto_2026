// ========================================
// CSRFトークン取得（Django用）
// ========================================
function getCookie(name) {
  if (!document.cookie) return null;

  const cookies = document.cookie.split(';').map(c => c.trim());

  for (let c of cookies) {
    if (c.startsWith(name + '=')) {
      return decodeURIComponent(c.slice(name.length + 1));
    }
  }

  return null;
}

// DjangoのPOST用CSRFトークン
const csrftoken = getCookie('csrftoken');


// ========================================
// いいね機能（home.html用）
// ========================================
function setupFeedLikes() {

  // ページ全体でクリックイベントを監視
  document.addEventListener('click', (e) => {

    // .like-btn をクリックした場合のみ処理
    const btn = e.target.closest('.like-btn');
    if (!btn) return;

    // モーダルなど他イベントへの影響を防ぐ
    e.preventDefault();
    e.stopPropagation();

    const photoId = btn.dataset.photoId;
    if (!photoId) return;

    // サーバーへいいねトグル送信
    fetch(`/like/${photoId}/`, {
      method: 'POST',
      headers: {
        'X-CSRFToken': csrftoken,
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then((data) => {

        // エラー時は何もしない
        if (data.error) return;

        // いいね状態をトグル更新
        btn.classList.toggle('liked', !!data.liked);
        btn.setAttribute('aria-pressed', data.liked ? 'true' : 'false');

        // いいね数を更新
        const countEl = btn.querySelector('.like-count');
        if (countEl) countEl.textContent = data.like_count;
      })
      .catch((err) => console.error('like error', err));
  });
}


// ========================================
// モーダル機能
// exploreGrid と photo-modal を持つ画面用の処理
// 対象要素が存在しない場合は何もしない
// ========================================
function setupExploreModal() {

  const grid = document.getElementById('exploreGrid');
  const overlay = document.getElementById('photo-modal');

  // 対象要素が無ければ処理しない
  if (!grid || !overlay) return;

  const modalImage = overlay.querySelector('.photo-modal-image');
  const closeButton = overlay.querySelector('.photo-modal-close');

  const modalName = document.getElementById('modalName');
  const modalComment = document.getElementById('modalComment');
  const modalLikeBtn = document.getElementById('modalLikeBtn');
  const modalLikeCount = document.getElementById('modalLikeCount');
  const modalDownloadBtn = document.getElementById('modalDownloadBtn');

  let currentItem = null;
  let currentPhotoId = null;

  // モーダル表示
  const open = (item) => {
    currentItem = item;
    currentPhotoId = item.dataset.photoId;

    modalImage.src = item.dataset.imageUrl;
    modalImage.alt = item.dataset.name ? `photo by ${item.dataset.name}` : 'photo';

    modalName.textContent = item.dataset.name || '名無しさん';
    modalComment.textContent = item.dataset.comment || '';

    const liked = item.dataset.liked === '1';
    const count = Number(item.dataset.likeCount || 0);

    modalLikeBtn.classList.toggle('liked', liked);
    modalLikeCount.textContent = count;

    modalDownloadBtn.href = item.dataset.imageUrl;

    overlay.classList.add('is-active');
    overlay.setAttribute('aria-hidden', 'false');

    // 背景スクロール禁止
    document.body.style.overflow = 'hidden';
  };

  // モーダル閉じる
  const close = () => {
    overlay.classList.remove('is-active');
    overlay.setAttribute('aria-hidden', 'true');
    modalImage.src = '';
    document.body.style.overflow = '';
    currentItem = null;
    currentPhotoId = null;
  };

  // カードクリックで開く
  grid.addEventListener('click', (e) => {
    const item = e.target.closest('.explore-item');
    if (!item) return;
    open(item);
  });

  // 閉じる処理
  closeButton.addEventListener('click', close);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  // モーダル内いいね
  modalLikeBtn.addEventListener('click', () => {
    if (!currentPhotoId) return;

    fetch(`/like/${currentPhotoId}/`, {
      method: 'POST',
      headers: {
        'X-CSRFToken': csrftoken,
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) return;

        modalLikeBtn.classList.toggle('liked', !!data.liked);
        modalLikeCount.textContent = data.like_count;

        // 元カードのデータも同期
        if (currentItem) {
          currentItem.dataset.liked = data.liked ? '1' : '0';
          currentItem.dataset.likeCount = String(data.like_count);
        }
      });
  });
}


// ========================================
// ヘッダーの自動表示・非表示
// ========================================
function setupHeaderScroll() {

  const headerBar = document.querySelector('.user-header-bar');
  if (!headerBar) return;

  let lastY = window.scrollY;
  const threshold = 80;

  window.addEventListener('scroll', () => {
    const y = window.scrollY;

    // 上部では常に表示
    if (y <= threshold) {
      headerBar.classList.remove('user-header-bar--hidden');
      lastY = y;
      return;
    }

    // 下スクロール → 非表示
    if (y > lastY + 5) {
      headerBar.classList.add('user-header-bar--hidden');
    }
    // 上スクロール → 表示
    else if (y < lastY - 5) {
      headerBar.classList.remove('user-header-bar--hidden');
    }

    lastY = y;
  }, { passive: true });
}


// ========================================
// 初期化処理
// ========================================
document.addEventListener('DOMContentLoaded', () => {

  // いいね機能
  setupFeedLikes();

  // モーダル（存在する場合のみ動作）
  setupExploreModal();

  // ヘッダー制御
  setupHeaderScroll();
});