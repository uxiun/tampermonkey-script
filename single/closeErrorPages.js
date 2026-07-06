const tabsInfo = await ACtl.getTabInfo("#allTabs")
let closeTabIds = []
for (const [tabId, { title, url }] of tabsInfo) {
	if (/\| 5\d{2}: /.test(title)) {
		closeTabIds.push(tabId)
		// console.log({ tabId, title })
	}
}

await ACtl.closeTab(closeTabIds)