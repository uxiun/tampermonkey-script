// 開いているツイートをデライトに転記（して、元々が非Active ならそのタブを閉じたい） AutoControl script
// EXTERNAL_DEPENDENCY: 外部依存

const tweetUrlRegex =
	/https?:\/\/(?:x|twitter)\.com\/(?<user>[a-zA-Z0-9_]+)\/status\/(?<tweetId>\d+)/;
const tweetTitleRegex = /(\(\d+\)\s)?(?<name>.+)\s.+“(?<content>.+)”/;

/** by Gemini
 * TweetのURLから投稿時刻のDateオブジェクトを取得する
 * @param {string} tweetUrl - ツイートのURL
 * @returns {Date | null} - 投稿時刻のDateオブジェクト、または無効なURLの場合はnull
 */
function getTimestampFromTweetUrl(tweetId) {
	// TwitterのIDは非常に大きな数値なので、BigIntとして扱う必要がある
	const idBigInt = BigInt(tweetId);

	// 1. IDを22ビット右にシフトしてタイムスタンプ部分を取り出す
	const timestampMs = idBigInt >> 22n;

	// 2. Twitterの基準時刻（epoch）を足す
	const twitterEpoch = 1288834974657n;
	const unixTimestamp = timestampMs + twitterEpoch;

	// 3. ミリ秒の数値をDateオブジェクトに変換して返す
	return new Date(Number(unixTimestamp));
}

const zerofill = (n, keta = 2) => {
	const m = n.toString();
	const k = keta - m.length;
	return k > 0 ? "0".repeat(k) + m : m;
};

function formatDateTime(date) {
	const days = "日月火水木金土".split("");
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const d = date.getDate();
	const hour = date.getHours();
	const min = date.getMinutes();
	const day = days[date.getDay()];
	const dateString = `${year}-${zerofill(month)}-${zerofill(d)}`;
	const timeString = `${zerofill(hour)}:${zerofill(min)}`;
	return {
		full: `${dateString} ${day} ${timeString}`,
		date: dateString,
		time: timeString,
	};
}

// EXTERNAL_DEPENDENCY: AutoControl GUI
// filter by URL Domain "x.com"
const tabsInfo = await ACtl.getTabInfo("x.com");
console.log("tabsInfo", tabsInfo);

// なぜか重複してデライトのタブが開かれてしまうのを防ぐ Map<tweetUrl, {knm, dln}>
const posts = new Map();

const initialActiveTabsFocus = new Map(
	Object.entries(tabsInfo).flatMap(([tabId, { active, window }]) =>
		active ? [[tabId, window.focused]] : [],
	),
);

console.log("initialActiveTabsFocus", initialActiveTabsFocus);

for (const [tabId, { title, url, window, active }] of tabsInfo) {
	const tweetUrl = url.match(tweetUrlRegex);
	if (tweetUrl) {
		const postingTime = getTimestampFromTweetUrl(tweetUrl.groups.tweetId);
		let userid = tweetUrl.groups.user;
		const timestamp = formatDateTime(postingTime);

		const knm = `${userid} ${postingTime.toLocaleDateString("ja-JP", {
			year: "numeric",
			month: "long",
			day: "numeric",
		})}`;

		console.log(knm);

		// 背景タブとして開かれページが十分に読み込まれていない場合、読み込む
		const titleRes = title.match(tweetTitleRegex);
		console.log("titleRes", titleRes);
		if (!titleRes) {
			await ACtl.setTabState(tabId, "active");
			await ACtl.sleep(300);
		}

		const [{ inner, ...tw }] = await ACtl.runInTab(tabId, () => {
			const tweetUrlRegex =
				/https?:\/\/(?:x|twitter)\.com\/(?<user>[a-zA-Z0-9_]+)\/status\/(?<tweetId>\d+)/;
			const tweetUrl = window.location.href.match(tweetUrlRegex);

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

			// : Element -> string
			const convertTweetText = (textContainer) => {
				if (!textContainer) return "";

				let fullText = "";

				// 2. 遍历所有子节点
				// childNodes 包含文本节点和元素节点
				textContainer.childNodes.forEach((node) => {
					if (node.nodeType === Node.TEXT_NODE) {
						// 如果是纯文本节点，直接累加
						fullText += node.textContent;
					} else if (node.nodeName === "IMG") {
						// 如果是图片（通常是表情符号），获取其 alt 属性
						const altText = node.getAttribute("alt");
						if (altText) {
							fullText += altText;
						}
					} else if (node.nodeName === "A") {
						// 如果是链接，你可以选择获取它的 href
						// 或者继续保持它在页面上显示的文本
						const linkUrl = node.getAttribute("href");

						// 如果你希望将链接替换为完整的 URL，可以使用 linkUrl
						// 如果希望保留显示的样子，可以使用 node.textContent
						fullText += linkUrl.startsWith("http")
							? linkUrl
							: `https://x.com${linkUrl}`;
					} else {
						// 处理其他可能的嵌套标签
						fullText += node.textContent;
					}
				});

				return padSpacesAroundUrl(fullText).trim();
			};

			/**
			 * 获取推文完整文本的函数
			 * @param {Element} tweetElement - 推文的根元素
			 * @returns {string} 包含表情符号和链接的完整文本
			 */
			const getTweetText = (tweetElement) => {
				// 1. 获取推文文本的容器
				const textContainer = tweetElement.querySelector(
					"[data-testid='tweetText']",
				);

				return convertTweetText(textContainer);
			};

			const getNameTextAndId = (userNameElement) => {
				// document.querySelector(`[data-tuic-zooming-tweet]`).querySelector(`[data-testid='User-Name'] a [dir] > span`)
				const a = userNameElement.querySelector(`a`);
				if (!!a) {
					const id = a.getAttribute("href").slice(1);
					const textContainer = userNameElement.querySelector(`a [dir] > span`);
					return [textContainer.textContent, id];
				}

				// a が見つからない = 引用ツイートと想定
				const id = userNameElement.childNodes[1]
					.querySelector(`:scope > div > div`)
					.textContent.slice(1);
				const nameContainer =
					userNameElement.childNodes[0].querySelector(`[dir] > span`);
				return [nameContainer.textContent, id];
			};

			// const tweet = document.querySelector("[data-testid='tweet']") // 返信元が表示されるとそっちを捉えてしまう

			// EXTERNAL_DEPENDENCY: 拡張機能 Twitter UI Customizer
			const tweet = document.querySelector("[data-tuic-zooming-tweet]");

			const names = [];
			let id = null;
			for (const userNameElement of tweet.querySelectorAll(
				`[data-testid='User-Name']`,
			)) {
				const [name, _id] = getNameTextAndId(userNameElement);
				if (name.length > 0) names.push(name);
				if (!id) id = _id;
			}

			const hasInnerTweet = names.length > 1;
			const content = getTweetText(tweet);
			const imageSources = [
				...tweet.querySelectorAll(
					`a[href*="/${tweetUrl.groups.user}/status/${tweetUrl.groups.tweetId}/photo"] [data-testid='tweetPhoto'] img`,
				),
			].map((img) => img.getAttribute("src"));

			const cardUrl = [
				...tweet.querySelectorAll(`[data-testid="card.wrapper"] a`),
			].map((a) => a.getAttribute("href"));
			const cardTexts = [
				...tweet.querySelectorAll(`[data-testid="card.layoutSmall.detail"]`),
			]
				.flatMap((c) => [...c.childNodes])
				.map((c) => c.textContent);
			const card = {
				url: cardUrl.length > 0 ? cardUrl[0] : null,
				texts: cardTexts
					.map((s) => s.replaceAll("\n", " ").trim())
					.filter((s) => s.length > 0),
			};

			let inner = null;
			if (hasInnerTweet) {
				console.log("hasInnerTweet!, names:", names);

				const userNameElement = tweet.querySelector(
					`[role="link"] [data-testid='User-Name']`,
				);
				// const name = namePart.childNodes[0].textContent
				// const id = namePart.childNodes[1].childNodes[0].childNodes[0].textContent
				const [name, id] = getNameTextAndId(userNameElement);
				const time = userNameElement.querySelector("time").textContent;

				const content = (() => {
					const t = tweet.querySelector(
						`[role="link"]:has([data-testid="User-Name"]) [data-testid='tweetText']`,
					);
					console.log("t Element:", t);
					return convertTweetText(t);
				})();
				const imageSources = [
					...tweet.querySelectorAll(
						`[role="link"]:has([data-testid="User-Name"]) [data-testid='tweetPhoto'] img`,
					),
				].map((img) => img.getAttribute("src"));
				const cardUrl = [
					...tweet.querySelectorAll(
						`[role="link"]:has([data-testid="User-Name"]) [data-testid="card.wrapper"] a`,
					),
				].map((a) => a.getAttribute("href"));
				const cardTexts = [
					...tweet.querySelectorAll(
						`[role="link"]:has([data-testid="User-Name"]) [data-testid="card.layoutSmall.detail"]`,
					),
				]
					.flatMap((c) => [...c.childNodes])
					.map((c) => c.textContent);
				const card = {
					url: cardUrl.length > 0 ? cardUrl[0] : null,
					texts: cardTexts
						.map((s) => s.replaceAll("\n", " ").trim())
						.filter((s) => s.length > 0),
				};
				const includesVideo = !!tweet.querySelector(
					`[role="link"]:has([data-testid="User-Name"]) [data-testid="videoPlayer"]`,
				);
				inner = {
					content,
					card,
					name,
					id,
					images: imageSources,
					includesVideo,
					time,
				};
			}

			const videoCount = tweet.querySelectorAll(
				`[data-testid="videoPlayer"]`,
			).length;

			return {
				content,
				card,
				name: names[0],
				id,
				// id: userid, // runInTab() 内は独立しているので、外部の変数は参照できない
				images: imageSources,
				includesVideo: videoCount > (inner && inner.includesVideo ? 1 : 0),
				inner,
			};
		});

		console.log({ tw, inner });

		// isOuterOrInner?: boolean (true: outer, false: inner)
		const dlnProvider = (tw, isOuterOrInner = undefined) => {
			const texts = tw.card.texts;
			const innerMedia = tw.card.url
				? texts.length === 0
					? tw.card.url
					: texts.length === 1
						? `[${texts[0]} ${tw.card.url}]`
						: `[${tw.card.texts[1]} ${tw.card.url}] (${tw.card.texts[0]})`
				: tw.includesVideo
					? "...video"
					: "";
			const media = tw.images.map((src) => `+${src}`).join("\n");

			const lines = [tw.content, innerMedia, isOuterOrInner ? `...引用` : ""]
				.filter((k) => k.length > 0)
				.flatMap((part) => part.split("\n").map((line) => `> ${line}`))
				.join("\n");
			const tweetLinkPart =
				isOuterOrInner !== false ? `[${timestamp.full} ${url}]` : tw.time;

			const dln = `${lines}
-- ${tw.name} {@${tw.id ?? userid}} ${tweetLinkPart}
${media}`;

			return dln;
		};

		const dln = inner
			? dlnProvider(tw, true) + "\n" + dlnProvider(inner, false)
			: dlnProvider(tw);

		posts.set(url, { knm, dln });
		// if (!initialActiveTabsFocus.has(tabId)) await ACtl.closeTab(tabId)
	}
}

console.log(posts);

for (const [tabId, focused] of initialActiveTabsFocus) {
	await ACtl.setTabState(tabId, "active");
	if (focused) await ACtl.setTabState(tabId, "focused");
}

for (const [_url, { _knm, dln }] of posts.entries()) {
	await ACtl.setClipboard(dln);
	const [tabId] = await ACtl.openURL(
		`https://dlt.kitetu.com/?dln=${encodeURIComponent(dln)}`,
		{
			leftOf: "#leftmostTab",
		},
	);
	await ACtl.on("tabLoadEnd", tabId);

	await ACtl.runInTab(tabId, () => {
		document.querySelector("#drw button.sv").click();
		// document.querySelector("#drw button.pvw").click()
	});
	await ACtl.sleep(150);
	await ACtl.closeTab(tabId);
}
