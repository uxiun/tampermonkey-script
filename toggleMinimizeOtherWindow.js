// AutoControl Script

const [currentTabId] = await ACtl.getTabIds("#currentTab")
const [[,currentTab]] = await ACtl.getTabInfo("#currentTab")
console.log({
	currentTabId,
	currentTab
})

const minimWindows = await ACtl.getTabIds({not: "#nonMinimTabs"})
console.log({minimWindows})
if (minimWindows.length > 0) {
	await ACtl.setTabState(minimWindows, "minimized", false, false) // 最小化を解除する。が、このとき聚焦も持っていかれる
	await ACtl.setTabState(currentTabId, "focused") // 元の現在タブに聚焦を戻す
	// UI設定ではこの聚焦を戻す操作ができそうになかったため、わざわざscriptを書いた
	return
}

// functions --------------
const transpose = matrix => {
	const minLenRowIndex = matrix.map((row, rowIndex) => [- row.length, rowIndex]).sort()[0][1]
	return matrix[minLenRowIndex].map((_, colIndex) => matrix.map(row => row[colIndex]));
}

const listAllSame = list => list.length > 0 ? list.reduce((item, x) => item === x ? item : undefined, list[0]) != undefined : true;

// obj を  で
const compareObjects = objs =>
	transpose(
		objs.map(o => Object.entries(o).sort()) // 各objを辞書配列化して整列
	).reduce((hasDiff, list) => hasDiff && listAllSame(list), true); // 転置して 属性/値[][] の形にして、各配列の中身がすべて同じであることを確認

const compareObjectsWith = (attrs) => (objs) =>
	attrs.reduce((ok, attr) => ok && listAllSame(objs.map(o => o[attr])), true);

const compareObjectsWithAll = objs => {
	const attrSet = new Set(objs.flatMap(o => Object.keys(o)))
	return compareObjectsWith([...attrSet])(objs)
}
// --------------

const nonMinimTabsInfo = await ACtl.getTabInfo("#nonMinimTabs")
const toMinimTabsId = Object.entries(nonMinimTabsInfo)
	.filter(([_id, info]) => info.window.height == currentTab.window.height) // 擬似的に同じモニターの窓に絞る
	.filter(([_id, info]) => !compareObjectsWith(["top", "left", "width"]) ([currentTab.window, info.window])) // 他の窓
	.map(([id, _info]) => id)

console.log({
	nonMinimTabsInfo,
	nonMinimTabs: Object.keys(nonMinimTabsInfo),
	toMinimTabsId})

await ACtl.setTabState(toMinimTabsId, "minimized", true, false)
