// 開いているツイートをデライトに転記（して、元々が非Active ならそのタブを閉じたい） AutoControl script
// EXTERNAL_DEPENDENCY: 外部依存

const tweetUrlRegex = /https?:\/\/(?:x|twitter)\.com\/(?<user>[a-zA-Z0-9_]+)\/status\/(?<tweetId>\d+)/;
const tweetTitleRegex = /(\(\d+\)\s)?(?<name>.+)\s.+“(?<content>.+)”/

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

// EXTERNAL_DEPENDENCY: AutoControl GUI
// filter by URL Domain "x.com"
const tabsInfo = await ACtl.getTabInfo("x.com")
console.log("tabsInfo", tabsInfo)

// なぜか重複してデライトのタブが開かれてしまうのを防ぐ Map<tweetUrl, {knm, dln}>
const posts = new Map()

const initialActiveTabsFocus = new Map(
	Object.entries(tabsInfo)
	.flatMap(([tabId, { active, window }]) => active ? [[tabId, window.focused]] : [])
)

console.log("initialActiveTabsFocus", initialActiveTabsFocus)

// 初期現在タブ
let tabIdToFocus = null

for (const [tabId, { title, url, window, active }] of tabsInfo) {
	const tweetUrl = url.match(tweetUrlRegex)
	if (tweetUrl) {
		const postingTime = getTimestampFromTweetUrl(tweetUrl.groups.tweetId);
		let userid = `@${tweetUrl.groups.user}`
		const timestamp = formatDateTime(postingTime)

		const knm = `${userid} ${postingTime.toLocaleDateString("ja-JP", {
			year: "numeric",
			month: "long",
			day: "numeric"
		})}`

		console.log(knm)

		// 背景タブとして開かれページが十分に読み込まれていない場合、読み込む
		const titleRes = title.match(tweetTitleRegex)
		console.log("titleRes", titleRes)
		if (!titleRes) {
			await ACtl.setTabState(tabId, "active")
			await ACtl.sleep(300)
		}



		const [{ inner, ...tw }] = await ACtl.runInTab(tabId, () => {
			// const tweet = document.querySelector("[data-testid='tweet']") // 返信元が表示されるとそっちを捉えてしまう

			// EXTERNAL_DEPENDENCY: 拡張機能 Twitter UI Customizer
			const tweet = document.querySelector("[data-tuic-zooming-tweet]")

			const names = [...tweet.querySelectorAll(`[data-testid='User-Name']`)]
				.map(d => d.childNodes[0].textContent)
			const hasInnerTweet = names.length > 1

			const content = (() => {
				const t = tweet.querySelector("[data-testid='tweetText']")
				return !!t ? t.textContent : ""
			})()
			const imageSources = [...tweet.querySelectorAll("[data-testid='tweetPhoto'] img")].map(img => img.getAttribute("src"))
			const cardUrl = [...tweet.querySelectorAll(`[data-testid="card.wrapper"] a`)].map(a => a.getAttribute("href"))
			const cardTexts = [...tweet.querySelectorAll(`[data-testid="card.layoutSmall.detail"]`)]
				.flatMap(c => [...c.childNodes])
				.map(c => c.textContent)
			const card = { url: cardUrl.length > 0 ? cardUrl[0] : null, texts: cardTexts }
			const includesVideo = !!tweet.querySelector(`[data-testid="videoPlayer"]`)

			let inner = null
			if (hasInnerTweet) {
				console.log("hasInnerTweet!, names:", names)

				const nameParts = tweet.querySelector(`[role="link"] [data-testid='User-Name']`).childNodes
				const name = nameParts[0].textContent
				const id = nameParts[1].childNodes[0].childNodes[0].textContent

				const content = (() => {
					const t = tweet.querySelector(`[role="link"]:has([data-testid="User-Name"]) [data-testid='tweetText']`)
					return t ? t.textContent : ""
				})()
				const imageSources = [...tweet.querySelectorAll(`[role="link"]:has([data-testid="User-Name"]) [data-testid='tweetPhoto'] img`)].map(img => img.getAttribute("src"))
				const cardUrl = [...tweet.querySelectorAll(`[role="link"]:has([data-testid="User-Name"]) [data-testid="card.wrapper"] a`)].map(a => a.getAttribute("href"))
				const cardTexts = [...tweet.querySelectorAll(`[role="link"]:has([data-testid="User-Name"]) [data-testid="card.layoutSmall.detail"]`)]
					.flatMap(c => [...c.childNodes])
					.map(c => c.textContent)
				const card = { url: cardUrl.length > 0 ? cardUrl[0] : null, texts: cardTexts }
				const includesVideo = !!tweet.querySelector(`[role="link"]:has([data-testid="User-Name"]) [data-testid="videoPlayer"]`)
				inner = {
					content,
					card,
					name,
					id,
					images: imageSources,
					includesVideo
				}
			}


			return {
				content,
				card,
				name: names[0],
				// id: userid, // runInTab() 内は独立しているので、外部の変数は参照できない
				images: imageSources,
				includesVideo,
				inner
			}
		})

		console.log({ tw, inner })

		const dlnProvider = (tw, hasInnerTweet = false) => {
			const innerMedia = tw.card.url
				? `\n\n[${tw.card.texts[1]} ${tw.card.url}] (${tw.card.texts[0]})`
				: tw.includesVideo
					? "...video"
					: ""
			const media = tw.images.map(src => `+${src}`).join("\n")

			const lines = [tw.content, innerMedia, hasInnerTweet ? `...引用` : ""]
				.map(k => k.trim())
				.filter(k => k.length > 0)
				.join("\n")
			const dln =
				`>>
${lines}
-- ${tw.name} {${tw.id ?? userid}} [${timestamp.full} ${url}]
${media}`;

			return dln
		}

		const dln = inner
			? dlnProvider(tw, true) + "\n" + dlnProvider(inner, false)
			: dlnProvider(tw)

		posts.set(url, { knm, dln })

		const g = initialActiveTabsFocus.get(tabId)
		if (g) tabIdToFocus = tabId
		else if (g == undefined) {
			console.log("close!")
			// await ACtl.closeTab(tabId) // バグってるから一旦閉じないでおく
		}
	}
}

console.log(posts)

for (const [url, { knm, dln }] of posts.entries()) {
	console.log(url)
	const [tabId] = await ACtl.openURL(`https://dlt.kitetu.com/?knm=${knm}&dln=${encodeURIComponent(dln)}`,
		{ rightOf: "#currentTab" })
	await ACtl.on("tabLoadEnd", tabId);

	await ACtl.runInTab(tabId, () => {
		document.querySelector("#drw button.sv").click()
		// document.querySelector("#drw button.pvw").click()
	})
	await ACtl.sleep(150)
	await ACtl.closeTab(tabId)
}

for (const [tabId, focused] of initialActiveTabsFocus) await ACtl.setTabState(tabId, "active")
await ACtl.setTabState(tabIdToFocus, "focused")