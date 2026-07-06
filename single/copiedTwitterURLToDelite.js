// http:// または https:// で始まり、空白文字（スペース、改行など）以外の文字が続く文字列にマッチする正規表現
const urlRegex = /https?:\/\/[^\s\[\]]+/g
const tweetUrlRegex = /https?:\/\/(?:x|twitter)\.com\/(?<user>[a-zA-Z0-9_]+)\/status\/(?<tweetId>\d+)/;
const tweetContentRegex = /(?<name>.+) 发布了推文："(?<content>.+)"$/

/**
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

function simpleDateTimeFormat(date) {
	const days = "日月火水木金土".split()
	const year = date.getFullYear()
	const month = date.getMonth() + 1
	const d = date.getDate()
	const hour = date.getHours()
	const min = date.getMinutes()
	const day = days[date.getDay()]

	const dateString = `${year}-${month < 10 ? "0" + month.toString() : month.toString()}-${d < 10 ? "0" + d.toString() : d.toString()}`
	const timeString = `${hour < 10 ? "0" + hour.toString() : hour.toString()}:${min < 10 ? min.toString() : min.toString()}`
	return {
		full: `${dateString} ${day} ${timeString}`,
		date: dateString,
		time: timeString,
	}
}

const content = await ACtl.getClipboard()
let tabIds = []
if (content) {
	console.log(content)
	const extractedUrls = content.match(urlRegex)
	console.log(extractedUrls)
	const ids = await ACtl.openURL(extractedUrls, {
		// newWindow: "popup",
		rightOf: "#currentTab",
	})
	tabIds = ids
} else {
	console.log("empty clipboard")
}

for (const tabId of tabIds) {
	console.log(`tabId:`, tabId)
	const {title, url} = ACtl.getTabInfo(tabId)
	console.log({title, url})
	const tweetUrl = url.match(tweetUrlRegex)
	console.log("tweetUrl", )
	console.log(tweetUrl)
	if (tweetUrl) {
		let timestamp = ""
		const postingTime = getTimestampFromTweetUrl(tweetUrl.groups.tweetId);
		let knm = `@${tweetUrl.groups.user}`
		if (postingTime) {
			const format = simpleDateTimeFormat(postingTime)
			timestamp = format.full + " "
			knm +=  ` ${format.date}`
		} else {
			knm += " _"
		}
		const {name, content} = title.match(tweetContentRegex).groups // !
		const dln =
`{>>
${content}
-- {@${tweetUrl.groups.user}} [${timestamp} ${name} ${url}]`

		let [tabId] = ACtl.openURL(`https://dlt.kitetu.com/?knm=${knm}&dln=${dln}`,
		{rightOf: "#currentTab"})
		// await ACtl.on("tabLoadEnd", tabId);
		// await ACtl.setTabState(tabId, "focus active");
		// await ACtl.execAction("focusSubmit", tabIds)
	}
}