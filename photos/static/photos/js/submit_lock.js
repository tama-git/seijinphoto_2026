// ========================================
// 投稿フォームの二重送信防止
// upload.html のフォーム送信時に使用
// ========================================
document.addEventListener("DOMContentLoaded", () => {

  // 投稿フォームと送信ボタンを取得
  const form = document.getElementById("upload-form");
  const btn = document.getElementById("submit-btn");

  // 対象要素が存在しない場合は処理しない
  if (!form || !btn) return;

  // 送信済み判定フラグ
  let locked = false;

  form.addEventListener("submit", (e) => {

    // すでに送信済みなら再送信を防止
    if (locked) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    locked = true;

    // 送信ボタンを無効化して見た目も変更
    btn.disabled = true;
    btn.classList.add("is-disabled");
    btn.textContent = "送信中…";
  });
});