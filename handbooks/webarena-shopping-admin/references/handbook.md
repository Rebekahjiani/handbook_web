# webarena-shopping-admin 任务手册

站点：`http://localhost:7780`

覆盖语料：0 条（未提供任务集，以下路由仅来自页面证据）
本轮重点任务：0 条。重点任务只影响抓取优先级和路径提示，不删除覆盖语料中的工作流。

## 使用方法

1. 根据任务目标在下表选择一个工作流。
2. 本轮只读取该工作流文件，不要预载其他工作流或全量 selector。
3. 工作流失败时先读取其中链接的单页快照；最后才按关键词检索 `../snapshots/selectors.json`。

## 工作流路由

| 任务线索 | 工作流 | 覆盖 / 重点 | 页面证据 |
|---|---|---:|---|
| best-selling, top product, revenue, sales, quarter, month, brand, SKU | [销售报表与聚合统计](workflows/admin-report.md) | 0 / 0 | 关键步骤有 |
| update, disable, enable, price, description, SKU, on-sale, status | [商品属性编辑与状态管理](workflows/admin-product-edit.md) | 0 / 0 | 关键步骤有 |
| customer, email, nickname, account, group, address | [客户信息查询与管理](workflows/admin-customer.md) | 0 / 0 | 关键步骤有 |
| get, return, list, show, summarize, how many, find, retrieve | [读取列表、详情与结构化数据](workflows/read-content.md) | 0 / 0 | 关键步骤有 |
| create, add, edit, update, delete, upload, save, send, notify | [创建、修改与提交](workflows/edit-submit.md) | 0 / 0 | 关键步骤有 |
| go to, open, navigate, view, settings page | [页面导航](workflows/navigation.md) | 0 / 0 | 关键步骤有 |
| 未命中已有工作流的任务 | [未归类任务](workflows/other.md) | 0 / 0 | 仅入口 |

## 覆盖缺口

- 当前任务工作流均有至少一条页面 locator 证据。
