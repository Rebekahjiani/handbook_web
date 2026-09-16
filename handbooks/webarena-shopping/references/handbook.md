# webarena-shopping 任务手册

站点：`http://localhost:7770`

本手册描述由当前 Context Model 支持的能力和运行入口，不以旧任务语料条数表示能力覆盖率。

## 事实来源与运行产物

- 原始 trace：`/Users/rebekah/handbook_web/platform-core/dev`
- 整理后的证据：`/Users/rebekah/handbook_web/platform-core/reviewed`
- Platform Core：`/Users/rebekah/handbook_web/platform-core/surfaces`
- Business Core：`/Users/rebekah/handbook_web/business-core`
- 能力绑定：`/Users/rebekah/handbook_web/context-model/capability-bindings.json`
- Context Model 校验：`/Users/rebekah/handbook_web/context-model/validation-report.json`
- Context Model 冻结清单：`/Users/rebekah/handbook_web/context-model/context-model.freeze.json`
- 能力路由：`/Users/rebekah/handbook_web/handbooks/webarena-shopping/router.json`
- 运行契约目录：`/Users/rebekah/handbook_web/handbooks/webarena-shopping/runtime-contracts`
- 机器执行契约：`/Users/rebekah/handbook_web/handbooks/webarena-shopping/references/execution-contract.json`

在 `baselineB_skill_routed` 条件下，每次只把命中的一个 `runtime-skills/<route>/SKILL.md` 作为 Skill 文本注入 Agent。Runner 另行读取 `execution-contract.json` 中命中工作流的切片，把 preflight guards、Workflow IR 和 contract-action bridge 指令写入 prompt，并用该切片执行机器审计；不会把整个契约文件、顶层 `SKILL.md` 或全部 runtime Skills 原样注入。原始 trace 只用于审计、定位证据缺口和重建 Context Model，不应默认整批注入 Agent。

## 使用方法

1. 根据任务目标在下表选择一个工作流。
2. 本轮只读取该工作流文件，不要预载其他工作流或全量 selector。
3. 工作流失败时先读取其中链接的单页快照；最后才按关键词检索 `../snapshots/selectors.json`。

## 工作流路由

| 任务线索 | 工作流 | Context Model 能力 | 注入方式 | 证据状态 |
|---|---|---|---|---|
| 订单数量、消费金额、时间范围、商品类别、退款 | [订单筛选、金额聚合与退款](workflows/order-aggregation.md) | `aggregate-orders` | `workflow_skill` | supported |
| 最近订单、订单状态、已购商品、规格、配送与账单字段 | [订单查找与已购商品属性](workflows/order-lookup.md) | `inspect-orders` | `workflow_skill` | supported |
| 购买、结账、地址、配送、付款、下单 | [购买与结账](workflows/checkout.md) | `submit-purchase` | `workflow_skill` | supported |
| 加入、移除、购物车、愿望单、收藏、比较、数量 | [购物车、愿望单与比较](workflows/cart-lists.md) | `manage-cart` | `workflow_skill` | supported |
| 商品详情、评论、评分、评论者、评论标题、摘要 | [商品详情与评论](workflows/reviews.md) | — | `baseline_fallback` | fallback |
| 登录、注册、账户、个人信息、地址、联系表单 | [账户、地址与表单](workflows/account-forms.md) | `establish-account` | `workflow_skill` | supported |
| 打开分类、浏览商品、分类页、价格上限 | [分类页导航与价格过滤](workflows/category-navigation.md) | `browse-catalog` | `contract_only` | supported |
| 价格范围、品牌商品、完整名称、可用型号 | [商品集合、名称与价格聚合](workflows/catalog-aggregation.md) | `browse-catalog` | `workflow_skill` | supported |
| 最便宜、最佳选项、最低容量、打开商品页 | [满足约束的最优商品选择](workflows/product-selection.md) | `inspect-product` | `workflow_skill` | supported |
| 搜索、筛选、排序、商品发现 | [通用搜索、筛选与商品发现](workflows/search-discovery.md) | `search-products` | `contract_only` | supported |
| 读取、查询、列表、详情、统计、下载、导出 | [读取列表、详情与结构化数据](workflows/read-content.md) | — | `baseline_fallback` | fallback |
| 创建、编辑、更新、删除、上传、保存、发送、订阅 | [创建、修改与提交](workflows/edit-submit.md) | — | `baseline_fallback` | fallback |
| 打开、前往、进入、导航、页面 | [页面导航](workflows/navigation.md) | — | `baseline_fallback` | fallback |
| 未命中已有工作流的任务 | [未归类任务](workflows/other.md) | — | `baseline_fallback` | fallback |

## 已知证据边界

- `empty-search-state`（not_evidenced）：No reusable empty-result behavior is asserted.
- `empty-cart-state`（not_evidenced）：Cart capability is limited to the evidenced nonempty state.
- `not-found-content-state`（not_evidenced）：No general not-found handling policy is asserted.
- `large-order-history-pagination`（partially_evidenced）：Order aggregation is supported for the reviewed collection states; exhaustive large-history behavior remains a later evidence target.

没有 capability binding 或超出上述证据边界的任务必须回退 baseline，不得把通用工作流或旧任务语料当成已验证能力。
