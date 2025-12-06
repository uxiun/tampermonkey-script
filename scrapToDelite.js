const tabsInfo = await ACtl.getTabInfo("#currentTab")
const [[title, url]] = Object.values(tabsInfo)
	.map(({ title, url }) => [
		title.replace(/^\(\d+\)/, ""),
		url
	])

const selection = await ACtl.expand(`<selection>`).then(s => s.trim())
const quote = !!selection ? `>>\n${selection}\n<<` : ""
const link = url.length > 80 ? `[${title} ${url}]` : `<!-- ${title} -->\n${url}`

const dln = [link, quote].join("\n").trim()

const [tabId] = await ACtl.openURL(`https://dlt.kitetu.com/?knm=${title}&dln=${encodeURIComponent(dln)}`, {
	rightOf: "#currentTab"
})
await ACtl.on("tabLoadEnd", tabId);

await ACtl.runInTab(tabId, () => {
	document.querySelector("#drw button.sv").click()
	// document.querySelector("#drw button.pvw").click()
})
await ACtl.sleep(150)
await ACtl.closeTab(tabId)