// ========================================
// ファイル選択UIの表示更新
// upload.html の input[type="file"] に対応
// ========================================
document.addEventListener("DOMContentLoaded", () => {

  // ページ内のファイル入力欄をすべて取得
  document.querySelectorAll('input[type="file"]').forEach((input) => {

    const id = input.id;

    // 選択ファイル名を表示する要素
    const nameEl = document.getElementById(`fileName-${id}`);

    // 選択状態の見た目を切り替える要素
    const uiEl = document.getElementById(`fileUi-${id}`);

    // 表示先が存在しない場合は何もしない
    if (!nameEl) return;

    // ファイル選択状態に応じて表示を更新
    const render = () => {

      // ファイルが未選択なら初期文言を表示
      const name = input.files?.[0]?.name ?? "選択されていません";
      nameEl.textContent = name;

      // ファイル選択済みならスタイル用クラスを付与
      if (uiEl) {
        if (input.files && input.files.length > 0) {
          uiEl.classList.add("is-selected");
        } else {
          uiEl.classList.remove("is-selected");
        }
      }
    };

    // ファイル選択時に表示更新
    input.addEventListener("change", render);

    // 初期表示時にも反映
    render();
  });
});