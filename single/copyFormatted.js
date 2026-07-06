// Map<hostnameRegex, 例外=消す param の配列>
const paramBlacklist = new Map();

// Map<hostnameRegex, 例外=残す param の配列>
const paramWhitelist = new Map([[/^www\.amazon\./, []]]);

const cleanParam = (urlString) => {
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

const cleanHash = (urlString) => {
	const url = decodeURIComponent(urlString);
	if (hashBlacklist.find((rg) => rg.test(url))) {
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

const modify = (tabsInfo, ...modifiers) =>
	Object.values(tabsInfo).map(({ title, url }) =>
		modifiers.reduce(
			([title, url], modifier) => {
				console.log({ title, url });
				return modifier(title, url);
			},
			[title, url],
		),
	);
//

// 1. 今開いているページのURLとタイトルを取得
const tabsInfo = await ACtl.getTabInfo("#currentTab");

// const [[title, rawUrl]] = Object.values(tabsInfo).map(({ title, url }) => [
// 	title.replace(/^\(\d+\)/, ""),
// 	cleanUrl(url),
// ]);

const [[title, url]] = modify(
	tabsInfo,
	modifiers.cleanHashUrl,
	modifiers.cleanParamUrl,
	modifiers.removeNotificationNumber,
);

console.log(title, url);

// 2. メモアプリ用の「HTML形式（リッチテキスト）」のリンクを作成
const htmlLink = `<a href="${url}">${title}</a>`;

ACtl.setClipboard(url);

// 3. AutoControlの専用APIを使い、プレーンテキストとHTMLを「同時保存」する
ACtl.setClipboard({
	html: htmlLink, // 対応メモアプリに貼った場合はタイトル付きリンクになる
});
