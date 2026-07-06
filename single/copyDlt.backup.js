// Map<hostnameRegex, 例外=消す param の配列>
const paramBlacklist = new Map();

// Map<hostnameRegex, 例外=残す param の配列>
const paramWhitelist = new Map([[/^www\.amazon\./, []]]);

const cleanParam = urlString => {
  const url = URL.parse(urlString);
  let url2 = url.origin + url.pathname;

  const params = new URLSearchParams();
  for (const [hostnameRegex, exceptionParams] of paramWhitelist) {
    if (hostnameRegex.test(url.hostname)) {
      for (const param of exceptionParams) {
        const value = url.searchParams.get(param);
        if (value) params.append(param, value);
      }
      break;
    }
  }
  if (params.size > 0) {
    url2 + "?";
    return decodeURIComponent(url2 + params.toString());
  } else {
    return decodeURIComponent(urlString);
  }
};

const hashBlacklist = [/:\/\/dlt\.kitetu\.com/];

const cleanHash = urlString => {
  const url = decodeURIComponent(urlString);
  if (hashBlacklist.find(rg => rg.test(url))) {
    return url.replace(/#.*$/, "");
  } else {
    return url;
  }
};

const modifiers = {
  cleanParamUrl: (title, url) => [title, cleanParam(url)],
  cleanHashUrl: (title, url) => [title, cleanHash(url)],

  // title 先頭の (1) のような通知の数を表す部分を消す
  removeNotificationNumber: (title, _) => [title.replace(/^\(\d+\)/, ""), _],
};

const modify =
  (...modifiers) =>
  (...titleUrls) =>
    titleUrls.map(({ title, url }) =>
      modifiers.reduce(
        ([title, url], modifier) => {
          console.log({ title, url });
          return modifier(title, url);
        },
        [title, url],
      ),
    );

function padSpacesAroundUrl(text) {
  // URLとして許可する半角文字のパターン
  const urlPattern = /https?:\/\/[\w/:%#\$&\?\(\)~\.=\+\-]+/g;

  // URLと、その「直前の1文字」および「直後の1文字」をまとめてマッチさせる
  // (.)? : 直前の任意の1文字（グループ1）
  // (https?://...) : URL本体（グループ2）
  // (.)? : 直後の任意の1文字（グループ3）
  const combinedRegex = new RegExp(`(.)?(${urlPattern.source})(.)?`, "g");

  return text.replace(combinedRegex, (match, p1, p2, p3) => {
    let result = p2; // ベースとなるURL本体

    // --- 直前の判定 ---
    if (p1 !== undefined) {
      // 直前に文字があり、それが空白・改行以外ならスペースを付与
      if (!/[\s\n]/.test(p1)) {
        result = p1 + " " + result;
      } else {
        result = p1 + result;
      }
    }

    // --- 直後の判定 ---
    if (p3 !== undefined) {
      // 直後に文字があり、それが空白・改行以外ならスペースを付与
      if (!/[\s\n]/.test(p3)) {
        result = result + " " + p3;
      } else {
        result = result + p3;
      }
    }

    return result;
  });
}

//

// 1. 今開いているページのURLとタイトルを取得
const tabsInfo = await ACtl.getTabInfo("#currentTab");

const [[title, url]] = modify(
  modifiers.cleanHashUrl,
  modifiers.cleanParamUrl,
  modifiers.removeNotificationNumber,
)(...Object.values(tabsInfo));

console.log(title, url);

const selectionLines = await ACtl.expand(`> <selection.lines>`, "#currentTab");
console.log({ selectionLines });

const dltLink = `[${title} ${url}]`;

if (selectionLines === "> ") {
  ACtl.setClipboard(dltLink);
} else {
  ACtl.setClipboard(`${padSpacesAroundUrl(selectionLines)}\n-- ${dltLink}`);
}
