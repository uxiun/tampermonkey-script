// 開いているツイートをデライトに転記（して、元々が非Active ならそのタブを閉じたい） AutoControl script
// EXTERNAL_DEPENDENCY: 外部依存

const tweetUrlRegex = /https?:\/\/(?:x|twitter)\.com\/(?<user>[a-zA-Z0-9_]+)\/status\/(?<tweetId>\d+)/;
const tweetTitleRegex = /(\(\d+\)\s)?(?<name>.+)\s.+“(?<content>.+)”/
// http:// または https:// で始まり、空白文字（スペース、改行など）以外の文字が続く文字列にマッチする正規表現
const urlRegex = /https?:\/\/[^\s]+/g;

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
	const m = n.toString()
	const k = keta - m.length
	return k > 0 ? "0".repeat(k) + m : m
}

function formatDateTime(date) {
	const days = "日月火水木金土".split("")
	const year = date.getFullYear()
	const month = date.getMonth() + 1
	const d = date.getDate()
	const hour = date.getHours()
	const min = date.getMinutes()
	const day = days[date.getDay()]


	const dateString = `${year}-${zerofill(month)}-${zerofill(d)}`
	const timeString = `${zerofill(hour)}:${zerofill(min)}`
	return {
		full: `${dateString} ${day} ${timeString}`,
		date: dateString,
		time: timeString,
	}
}

const groupBy = groupFn => iterable => {
	const m = new Map();
	[...iterable].forEach(o => {
		const key = groupFn(o)
		const v = m.get(key)
		if (v != undefined) v.push(o)
		else m.set(key, [o])
	})
	return m
}

const setBy = noDuplicateFn => iterable => {
	const m = new Map();
	[...iterable].forEach(o => {
		const key = noDuplicateFn(o)
		if (!m.has(key)) m.set(key, o)
	})
	console.log("setBy take", iterable)
	console.log("setBy returns", m)
	return m
}


// EXTERNAL_DEPENDENCY: AutoControl GUI
// filter by URL Domain "x.com"
// const tabsInfo = await ACtl.getTabInfo("x.com")
const tabsInfo = await ACtl.getTabInfo("x.com by window")
console.log("tabsInfo", tabsInfo)
const tabsInfoByWindow = groupBy(o => JSON.stringify(o.window))(Object.values(tabsInfo))
console.log(tabsInfoByWindow)

const initialActiveTabsFocus = new Map(
	Object.entries(tabsInfo)
		.flatMap(([tabId, { active, window }]) =>
			active ? [[tabId, window.focused]] : []
		)
)

console.log("initialActiveTabsFocus", initialActiveTabsFocus)


const posts = []
for (const tabsInfo of tabsInfoByWindow.values()) {
	const dlns = []
	for (const { title, url, id, window } of setBy(o => o.url)(tabsInfo).values()) {
		const tabId = id
		const tweetUrl = url.match(tweetUrlRegex)
		if (!tweetUrl) continue
		const postingTime = getTimestampFromTweetUrl(tweetUrl.groups.tweetId);
		let userid = `@${tweetUrl.groups.user}`
		const timestamp = formatDateTime(postingTime)

		// isQuote?: boolean
		const dlnProvider = (tw, isQuote = false) => {
			const texts = tw.card.texts
			const innerMedia = tw.card.url
				? (texts.length == 0
					? tw.card.url
					: texts.length == 1
						? `[${texts[0]} ${tw.card.url}]`
						: `[${tw.card.texts[1]} ${tw.card.url}] (${tw.card.texts[0]})`
				) : tw.includesVideo
					? "...video"
					: ""
			const media = tw.images.length > 0 ? tw.images.map(src => `+${src}`).join("\n") + "\n" : ""

			const lines = [tw.content, innerMedia, isQuote ? `...引用` : ""]
				.map(k => k.trim())
				.filter(k => k.length > 0)
				.join("\n")
			const tweetLinkPart = `[${timestamp.full} ${url}]`

			const dln =
				`>>
${lines}
-- ${tw.name} {${tw.id ?? userid}} ${tweetLinkPart}
${media}`;

			return dln
		}

		const knm = `${userid} ${postingTime.toLocaleDateString("ja-JP", {
			year: "numeric",
			month: "long",
			day: "numeric"
		})}`

		console.log("knm:", knm)

		// 背景タブとして開かれページが十分に読み込まれていない場合、読み込む
		const titleRes = title.match(tweetTitleRegex)
		console.log("titleRes", titleRes)
		if (!titleRes) {
			await ACtl.setTabState(tabId, "active")
			await ACtl.sleep(300)
		}



		const [tw] = await ACtl.runInTab(tabId, () => {
			const tweetUrlRegex = /https?:\/\/(?:x|twitter)\.com\/(?<user>[a-zA-Z0-9_]+)\/status\/(?<tweetId>\d+)/;
			const tweetUrl = window.location.href.match(tweetUrlRegex)

			const urlRegex = /https?:\/\/[^\s]+/g;
			const replaceByList = (targetRegex, replacementList) => originalString => {
				let counter = 0
				return originalString.replace(targetRegex, () => {
					const replacement = replacementList[counter]
					counter++
					return replacement
				})
			}

			const getTweetText = tweetElement => {
				const content = (() => {
					const t = tweetElement.querySelector("[data-testid='tweetText']")
					return !!t ? t.textContent : ""
				})()

				const links = [...tweetElement.querySelectorAll(`[data-testid='tweetText'] > a`)].map(a => a.getAttribute("href"))

				return replaceByList(urlRegex, links)(content)
			}

			// const tweet = document.querySelector("[data-testid='tweet']") // 返信元が表示されるとそっちを捉えてしまう

			// EXTERNAL_DEPENDENCY: 拡張機能 Twitter UI Customizer
			const tweet = document.querySelector("[data-tuic-zooming-tweet]")

			const names = [...tweet.querySelectorAll(`[data-testid='User-Name']`)]
				.map(d => d.childNodes[0].textContent)
			const hasInnerTweet = names.length > 1

			const content = getTweetText(tweet)
			const imageSources = [...tweet.querySelectorAll(`a[href*="/${tweetUrl.groups.user}/status/${tweetUrl.groups.tweetId}/photo"] [data-testid='tweetPhoto'] img`)].map(img => img.getAttribute("src"))
			const cardUrl = [...tweet.querySelectorAll(`[data-testid="card.wrapper"] a`)].map(a => a.getAttribute("href"))
			const cardTexts = [...tweet.querySelectorAll(`[data-testid="card.layoutSmall.detail"]`)]
				.flatMap(c => [...c.childNodes])
				.map(c => c.textContent)
			const card = {
				url: cardUrl.length > 0 ? cardUrl[0] : null,
				texts: cardTexts
					.map(s => s.replaceAll("\n", " ").trim())
					.filter(s => s.length > 0)
			}
			const includesVideo = !!tweet.querySelector(`[data-testid="videoPlayer"]`)

			return {
				content,
				card,
				name: names[0],
				// id: userid, // runInTab() 内は独立しているので、外部の変数は参照できない
				images: imageSources,
				includesVideo,
				hasInnerTweet
			}
		})

		console.log("tw: ", tw)

		dlns.push({ knm,
			dln: dlnProvider(tw, tw.hasInnerTweet),
			index: window.index,
		})
		if (!initialActiveTabsFocus.has(tabId)) await ACtl.closeTab(tabId)
	}

	dlns.sort((a, b) => a.index - b.index)
	console.log("dlns:", dlns)
	const knm = dlns[0].knm
	const dln = dlns.map(o => o.dln).join("\n")
	posts.push({ knm, dln })
}

console.log("posts:", posts)

for (const [tabId, focused] of initialActiveTabsFocus) {
	await ACtl.setTabState(tabId, "active")
	if (focused) await ACtl.setTabState(tabId, "focused")
}

for (const { knm, dln } of posts) {
	const [tabId] = await ACtl.openURL(`https://dlt.kitetu.com/?knm=${knm}&dln=${encodeURIComponent(dln)}`, {
		leftOf: "#leftmostTab"
	})
	await ACtl.on("tabLoadEnd", tabId);

	await ACtl.runInTab(tabId, () => {
		document.querySelector("#drw button.sv").click()
		// document.querySelector("#drw button.pvw").click()
	})
	await ACtl.sleep(150)
	await ACtl.closeTab(tabId)
}