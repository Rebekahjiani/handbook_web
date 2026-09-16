# 未归类任务

适用线索：未命中已有工作流的任务

证据状态：只有入口或邻近控件证据，关键步骤仍有缺口

## 推荐流程

1. 先把任务拆成「导航到正确页面」「读取所需内容」「执行写操作」三个阶段。
2. 从当前页面语义和快照中寻找最接近的已验证入口。
3. 每一步都验证可见结果。

## 成功判据

- 完成任务要求，且没有执行未授权的写操作。

## 已验证入口

- [image] Experience never goes wasted：`/f/GetMotivated/55022/image-experience-never-goes-wasted`；[页面快照](../../snapshots/pages/19-f-getmotivated-55022-image-experience-never-goes-wasted.json)
- PsBattle: Halloween Costume：`/f/photoshopbattles/45340/psbattle-halloween-costume`；[页面快照](../../snapshots/pages/09-f-photoshopbattles-45340-psbattle-halloween-costume.json)
- 2 years later, this is still one of the most incredible evenings of my life | Y…：`/f/EarthPorn/98297/2-years-later-this-is-still-one-of-the-most-incredible`；[页面快照](../../snapshots/pages/11-f-earthporn-98297-2-years-later-this-is-still-one-of-the-most-incredible.json)

## 操作锚点

- up：`getByRole("button", { name: "up", exact: true })`；证据：`04-f-machinelearning-1-nvidia-rtx-4090.json`
- down：`getByRole("button", { name: "down", exact: true })`；证据：`04-f-machinelearning-1-nvidia-rtx-4090.json`
- log in：`getByRole("link", { name: "log in", exact: true })`；证据：`04-f-machinelearning-1-nvidia-rtx-4090.json`
- register：`getByRole("link", { name: "register", exact: true })`；证据：`04-f-machinelearning-1-nvidia-rtx-4090.json`

## 风险与恢复

- 此工作流证据较弱；不要把未验证的推断当成站点事实。
- locator 不唯一或不可见时，先核对 URL 与标题，再读取上面列出的单页快照。
- 只有工作流和单页快照都无法定位时，才按关键词检索全量 selector 快照；不要整体载入。

