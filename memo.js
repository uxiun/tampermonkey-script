function padSpacesAroundUrl(text) {
  // URLとして許可する半角文字のパターン
  const urlPattern = /https?:\/\/[\w/:%#\$&\?\(\)~\.=\+\-]+/g;

  // URLと、その「直前の1文字」および「直後の1文字」をまとめてマッチさせる
  // (.)? : 直前の任意の1文字（グループ1）
  // (https?://...) : URL本体（グループ2）
  // (.)? : 直後の任意の1文字（グループ3）
  const combinedRegex = new RegExp(`(.)?(${urlPattern.source})(.)?`, 'g');

  return text.replace(combinedRegex, (match, p1, p2, p3) => {
    let result = p2; // ベースとなるURL本体

    // --- 直前の判定 ---
    if (p1 !== undefined) {
      // 直前に文字があり、それが空白・改行以外ならスペースを付与
      if (!/[\s\n]/.test(p1)) {
        result = p1 + ' ' + result;
      } else {
        result = p1 + result;
      }
    }

    // --- 直後の判定 ---
    if (p3 !== undefined) {
      // 直後に文字があり、それが空白・改行以外ならスペースを付与
      if (!/[\s\n]/.test(p3)) {
        result = result + ' ' + p3;
      } else {
        result = result + p3;
      }
    }

    return result;
  });
}

// --- 動作テスト ---
const sampleText2 = `
■チケット販売
・先行抽選販売「プレリザーブ」
申込受付期間：6月17日（水）11：00 - 6月28日（日）23：59
抽選結果発表：6月29日（月）18：00以降
お申込みURL：https://w.pia.jp/t/aikatsu-anniversary-stars/
`;

console.log(padSpacesAroundUrl(sampleText2));
