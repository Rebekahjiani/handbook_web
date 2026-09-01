# WebArena Shopping storefront Context Model 冻结报告

> 本文档记录 WebArena-Verified Shopping storefront 首版正式 Context Model 的证据范围、结构化产物、校验结果与冻结指纹。当前阶段到 Context Model freeze 为止，不包含 Skill 生成或注入实验。

## 1. 结论

**Context Model 已冻结，全部正式校验通过。**

| 项目 | 结果 |
| --- | --- |
| Scope | Shopping storefront，`http://localhost:7770` |
| 排除 | Shopping Admin、Reddit、Skill 生成、Skill 注入实验 |
| Platform surfaces | 4 |
| Reviewed evidence | 11 |
| Business capabilities | 8 |
| Capability bindings | 8，全部通过跨 surface 校验 |
| Freeze artifacts | 32 |
| Freeze manifest | `context-model/context-model.freeze.json` |
| Freeze SHA-256 | `5855791ab8a62a9d06710c5662d497028eb5c675f6bd6276cb4effe474d298e3` |
| 新增 tracer profile | 0；现有证据足够完成首版冻结 |

## 2. 版本指纹

| 组件 | 指纹 |
| --- | --- |
| `handbook_web` 构建前 HEAD | `742377dd58babfa72a0dc3fb97d4084c8c888eb1` |
| `context-model-generator-web` | `20f1c9debb06a386d3663deecbb640afaadd82a1` |
| baseline 来源 `/Users/rebekah/artifacttrace/handoff.md` | `0c64d40c7a68b9c98d47addcc396f806e8b83c87641e4d47f8c7d803d84a7fe6` |

## 3. BaselineA 冻结口径

机器可读记录：`baselines/webarena-shopping-baselineA.freeze.json`。

### 3.1 已冻结历史基线

`baselineA-Mac-historical-v1`：

- 192/192 已评估
- 98 成功、94 失败
- 准确率 51.04%
- `group=baseline`
- 无 Skill 注入
- 无 site reset
- 600 秒超时
- 用途仅为历史参考

### 3.2 服务器估算快照

`baselineA-server-estimated-v0`：

- 估算 106/192
- 估算准确率约 55.2%
- 来源为 Mac 成功集与服务器失败集重跑的组合
- 不是 192 个任务全部在服务器同一协议下运行的正式基线
- 不得作为最终配对实验的确定值

本轮没有修改任何 baseline 结果，也没有补跑服务器任务。

## 4. Evidence 输入

正式模型基于以下四轮已存在的 ContextModelTracer profile：

```text
platform-core/dev/26_08_21_15_00_47-js/
platform-core/dev/26_08_21_16_27_00-js/
platform-core/dev/26_08_21_16_51_26-js/
platform-core/dev/26_08_21_16_59_39-js/
```

已验证覆盖：

- storefront 入口、分类集合与第二段结果
- 搜索结果集合
- 商品身份、价格与评论相关状态
- 新账号注册与已有认证会话
- 加购与非空购物车
- 结算支付准备状态
- 真实订单提交与确认
- 空订单历史、单笔订单历史、多笔订单历史与订单详情

原始 evidence 未移动、未重写。Review 结果位于：

```text
platform-core/reviewed/
```

每条 reviewed evidence 均记录原始路径及 SHA-256。ArtifactTrace baseline trace 只用于理解任务覆盖和失败类型，没有将 task ID、具体答案、商品值或订单号写入正式模型。

## 5. Platform Core

正式结构：

```text
platform-core/
├── surfaces.json
└── surfaces/
    ├── storefront-catalog/
    ├── storefront-account/
    ├── storefront-cart-checkout/
    └── storefront-orders/
```

每个 surface 均包含：

```text
state-machine.json
actions.json
observations.json
evidence-map.json
```

状态迁移显式记录停止、失败、未知以及分页或排序条件。不同 surface 之间没有借用 action 或 evidence。

## 6. Business Core

正式业务对象：

- Product
- Product Collection
- Customer Account
- Shopping Cart
- Checkout
- Order
- Order Collection

正式能力：

1. `browse-catalog`
2. `search-products`
3. `inspect-product`
4. `establish-account`
5. `manage-cart`
6. `submit-purchase`
7. `inspect-orders`
8. `aggregate-orders`

Business Core 不包含 DOM、selector、Playwright 操作、任务答案或一次性账号信息。

## 7. Cross-layer bindings

`context-model/capability-bindings.json` 包含 8 个 binding。每个 binding 均满足：

- capability 存在于 Business Core
- surface 存在于 Platform Core
- action 属于指定 surface
- evidence 属于指定 surface
- 状态为 `supported`

其中 `aggregate-orders` 仅在现有由 Agent 结构化整理的 collection 证据范围内受支持；没有把大型多段订单历史自动宣称为完整支持。

## 8. 未充分证据项

以下内容记录在 `context-model/validation-report.json`，没有写成已验证能力：

| 项目 | 状态 | 当前影响 |
| --- | --- | --- |
| 空搜索 | `not_evidenced` | 不声明通用空结果处理规则 |
| 空购物车 | `not_evidenced` | Cart 能力限定于已验证的非空状态 |
| 404 / 不存在内容 | `not_evidenced` | 不声明通用 NOT_FOUND 处理规则 |
| 大型订单历史分页 | `partially_evidenced` | 聚合能力限定于已 review 的集合状态 |

这些缺口不影响当前 freeze 的结构有效性，但应在后续 Skill 提炼前根据目标任务范围决定是否补采。

## 9. 校验结果

执行命令：

```bash
python3 /Users/rebekah/context-model-generator-web/template/scripts/validate_platform_core.py \
  --root /Users/rebekah/handbook_web

python3 /Users/rebekah/context-model-generator-web/template/scripts/validate_business_core.py \
  --root /Users/rebekah/handbook_web

python3 /Users/rebekah/context-model-generator-web/template/scripts/validate_capability_bindings.py \
  --root /Users/rebekah/handbook_web

python3 /Users/rebekah/context-model-generator-web/template/scripts/validate_context_model_freeze.py \
  --root /Users/rebekah/handbook_web
```

结果：

```text
validate_platform_core.py: ok
validate_business_core.py: ok
validate_capability_bindings.py: ok
validate_context_model_freeze.py: ok
```

附加结构检查：

```text
surfaces=4
reviewed_evidence=11
capabilities=8
bindings=8
freeze_artifacts=32
```

所有新增 JSON 与 JSONL 均通过解析检查；freeze manifest 中全部 artifact 路径存在且 SHA-256 匹配。

## 10. 关键产物

```text
baselines/webarena-shopping-baselineA.freeze.json
steps/01-scope-and-inputs/result.md
platform-core/reviewed/*.evidence.jsonl
platform-core/surfaces.json
platform-core/surfaces/*/{state-machine,actions,observations,evidence-map}.json
business-core/object-model.json
business-core/business-context.json
business-core/capabilities/*.json
context-model/capability-bindings.json
context-model/validation-report.json
context-model/context-model.freeze.json
```

## 11. Context Model 冻结轮次明确未做

- 未修改 Benchmark、Ground Truth 或 evaluator
- 未修改 Agent、模型或服务器配置
- 未覆盖历史结果
- 未补跑 baselineA
- 未补采新的 tracer profile
- 未生成或发布 Skill
- 未运行 Context Model/Skill 注入实验
- 未修改 `实验手册.md`

## 12. Shopping 任务手册重建与下一轮验证入口（2026-08-31）

### 12.1 结论

`handbooks/webarena-shopping/references/handbook.md` 已按当前 Context Model 重新生成。旧版的“覆盖语料 100 条 / 重点任务 32 条”来自历史路由语料，不代表 Context Model 能力覆盖，因此不再出现在 Agent 可见任务手册中。

当前产物可以进入在线准确率验证，但只能视为待验证候选，不能据离线测试宣称准确率已经提高。正式运行前仍需先解决或绕开 §14.6 所述 ArtifactTrace 旧 capability parser 接线差异。

### 12.2 当前 trace 与 Context Model 路径

| 层 | 路径 | 当前核对结果 |
| --- | --- | --- |
| 原始 trace | `/Users/rebekah/handbook_web/platform-core/dev` | `driver-runs.jsonl` 登记 11 次采集；当前保留 4 个完整 run 目录、50 个 trace segment、35,398 个 network event |
| 整理后的证据 | `/Users/rebekah/handbook_web/platform-core/reviewed` | 4 个 surface 证据文件，共 11 条记录 |
| Platform Core | `/Users/rebekah/handbook_web/platform-core/surfaces` | 4 个 surface |
| Business Core | `/Users/rebekah/handbook_web/business-core` | 8 个 capability |
| Capability bindings | `/Users/rebekah/handbook_web/context-model/capability-bindings.json` | 8 个 binding，全部为 `supported` |
| Context Model 校验 | `/Users/rebekah/handbook_web/context-model/validation-report.json` | `passed` |
| Context Model freeze | `/Users/rebekah/handbook_web/context-model/context-model.freeze.json` | freeze 校验通过 |

说明：`driver-runs.jsonl` 中 11 条是采集登记记录，其中部分早期 run 目录已不在当前工作区；当前可供 Agent 实际查看的原始 trace 是表中保留的 4 个目录。运行时不应整批注入这些 trace，trace 用于审计、补证和重建 Context Model。

### 12.3 当前生成的 Skill

| 产物 | 路径 |
| --- | --- |
| Skill 入口 | `/Users/rebekah/handbook_web/handbooks/webarena-shopping/SKILL.md` |
| 新任务手册 | `/Users/rebekah/handbook_web/handbooks/webarena-shopping/references/handbook.md` |
| 能力路由 | `/Users/rebekah/handbook_web/handbooks/webarena-shopping/router.json` |
| Runtime contracts | `/Users/rebekah/handbook_web/handbooks/webarena-shopping/runtime-contracts` |
| 机器执行契约 | `/Users/rebekah/handbook_web/handbooks/webarena-shopping/references/execution-contract.json` |

当前 Skill 有 14 个工作流路由：9 个由 Context Model capability binding 支持，5 个保持 baseline fallback。8 个唯一 capability 为：

```text
aggregate-orders
browse-catalog
establish-account
inspect-orders
inspect-product
manage-cart
search-products
submit-purchase
```

已知证据边界仍是：空搜索、空购物车、通用 not-found 未取证；大型订单历史完整分页只得到部分证据。超出边界时必须回退 baseline。

当前 SHA-256：

```text
SKILL.md=35de5adc602d1674be65ee9cceae228bd491b1c2539656035cd7d8f3dd3ac38f
router.json=d69b751c93828f2658552c1254dd1ca48995c1c679ee1bc26792cc31fe8e2124
execution-contract.json=53ef29d387df4057880da88287186962116c2658733e4d3a9989617358a82ef1
```

### 12.4 本轮修改与测试

修改了生成模板并从当前 Context Model 重建现有 `handbooks/webarena-shopping/`，没有新增重复 Skill 目录。生成器回归测试新增断言：Agent 手册不得再出现旧任务条数，并必须包含 Context Model 与 Skill 运行产物路径。

```text
generator tests passed
contract evidence tests passed
contract replay passed: 335 checks
contract action replay passed
Skill is valid!
Context Model freeze: ok
git diff --check: passed
```

本轮未运行 WebArena 在线任务，因此没有新增准确率、positive flip、negative flip、token 或调用次数结果。

### 12.5 下一轮准确率验证设计

在同一服务器状态、同一任务 ID、同一模型、同一预算与同一 evaluator 下，做 baselineA 与 Skill 候选的 paired A/B。至少记录：成功数、准确率、positive flip、negative flip、tokens、模型调用数、工具调用数、contract violation 和失败阶段。

根据结果按以下顺序定位，不要一看到失败就补 trace：

| 观测结果 | 优先修改层 |
| --- | --- |
| 已支持任务被错误路由或错误 abstain | Skill 生成器的 parser/router |
| 路由正确，但注入契约缺字段、步骤冗余或投影错误 | Skill 生成器或 runtime contract 形式 |
| 路由和契约正确，但 Context Model 缺少完成任务所需页面状态、动作或证据 | 补采 trace，然后重建 Context Model |
| 原始证据已经存在，但 capability binding 无法表达筛选、日期、金额字段或成功状态 | 修改 Context Model 的结构/表达形式，再重建 Skill |
| 执行路径正确，但失败来自 provider、网络、runner 或 evaluator | 修复对应运行层；不要把 evaluator 隐藏答案写入 Skill 或 Context Model |
| 准确率不升或下降，同时 tokens、步骤或调用数明显增加 | 先缩短注入内容和 Skill 形式，不优先增加 trace |

只有当失败分析明确指向“证据缺失”，才增加 trace；如果证据已经存在而未被正确路由或投影，应修改生成器或 Context Model 形式。

## 13. Skill 阶段入口（已执行）

后续 Skill 阶段必须读取本轮冻结 Context Model，不得修改本次 freeze；证据不足的能力必须 fail-closed。Skill 生成及测试结果见下一节。

## 14. Shopping Skill v0.1 初始构建记录（2026-08-28）

### 14.1 状态

```text
offline_candidate_built
online_webarena_benchmark_not_run
```

本轮已把冻结 Context Model 编译为保存在本项目中的渐进式 Shopping Skill。没有修改 baselineA、WebArena Ground Truth、benchmark、evaluator、Agent 配置或冻结 Context Model。

### 14.2 输入

| 输入 | SHA-256 |
| --- | --- |
| `context-model/context-model.freeze.json` | `5855791ab8a62a9d06710c5662d497028eb5c675f6bd6276cb4effe474d298e3` |
| `context-model/capability-bindings.json` | `e72a7b03fc8e68d041c1990325ce20eb5d0e733250c537b682e87fa14453e06b` |
| `context-model/validation-report.json` | `ee9aff5380316f704113d16380b5517837a4a3abd8827bd6808e0491a3fa084d` |
| Round-53 execution-contract seed | `e36a224946fb5907d81d6952177148359148b8d4f052d7cf331c21fca2320ee0` |

重建前后前三个 Context Model SHA-256 未变化。

### 14.3 生成形式

产物位于 `handbooks/webarena-shopping/`：

```text
SKILL.md
router.json
runtime-skills/*/SKILL.md
runtime-contracts/*.json
references/execution-contract.json
references/handbook.md
```

生成规则：

- `SKILL.md` 只保留渐进式加载入口。
- Router 只发布 `supported` capability binding；无法完整匹配时回退 baseline。
- 每次只注入命中的一个 runtime contract。
- selector、JS 和 contract action 留在机器侧 execution contract。
- 新 Context Model 没有 selector/JS 级 executable binding，因此订单机器动作显式复用 Round-53 seed；生成产物记录 seed 路径和 SHA-256，没有把它写成新 Context Model 自身证据。

### 14.4 生成结果

```text
routes=14
capability_routes=9
unique_capabilities=8
execution_contract_workflows=14
execution_contract_actions=8
seeded_workflows=order-aggregation,order-lookup
```

冻结候选哈希：

| Skill 产物 | SHA-256 |
| --- | --- |
| `handbooks/webarena-shopping/SKILL.md` | `35de5adc602d1674be65ee9cceae228bd491b1c2539656035cd7d8f3dd3ac38f` |
| `handbooks/webarena-shopping/router.json` | `d69b751c93828f2658552c1254dd1ca48995c1c679ee1bc26792cc31fe8e2124` |
| `handbooks/webarena-shopping/references/execution-contract.json` | `faa9e25172fdbbf2ea675685bbf692796f1912ca92bcfe37e7b5a333a988887a` |

8 个唯一 capability：

```text
aggregate-orders
browse-catalog
establish-account
inspect-orders
inspect-product
manage-cart
search-products
submit-purchase
```

`reviews`、通用 `read-content`、通用 `edit-submit`、通用 `navigation` 和 `other` 没有得到当前 Context Model 的能力签名，保持 fallback。空搜索、空购物车、通用 not-found、大型订单历史完整分页仍保留 validation limitation。

`snapshots/coverage.json` 中的 Context Model provenance 状态仍为 `evidence_incomplete`，对应上述已知缺口；本候选依靠 fail-closed 发布，不把它解释为全站能力闭合。

### 14.5 测试结果

执行：

```bash
npm --prefix generate-web-handbook test
python3 /Users/rebekah/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  handbooks/webarena-shopping
```

结果：

```text
generator tests passed
contract evidence tests passed
contract replay passed: 335 checks
contract action replay passed
Skill is valid!
```

历史 task corpus 的 regex router 审计：

```text
tasks=100
assigned=100
unmatched=0
conflicts=0
fallback_assignments=0
```

capability router 离线准入审计：

```text
tasks=100
routed=71
abstained=29
unsupported_capability=16
unknown_requirements=13
```

上述 `71/100` 只是路由准入覆盖率，不是 Agent 成功率，也不能与 baselineA 准确率比较。

### 14.6 当前集成边界

ArtifactTrace 的 `run_at_webarena_task.py` 内仍有一份较旧的 capability parser。只读 smoke 结果：

```text
订单聚合 -> order-aggregation
最近 pending 订单 -> order-lookup
普通商品搜索 -> search-discovery
最低价商品 -> 被旧 parser 路由为 search-discovery（应为 product-selection）
分类页导航 -> 旧 parser abstain（应为 category-navigation）
```

因此本轮候选已完成离线生成和结构验证，但在开始正式在线 A/M paired 实验前，必须先同步或复用同一份 capability parser，并做 router-only smoke。该接线变更不得进入 baselineA 条件。

### 14.7 本轮未做

- 未运行 Agent 在线任务
- 未计算准确率、positive flip 或 negative flip
- 未宣称 Skill 优于 baselineA
- 未修改 `实验手册.md`

## 15. Shopping Skill 首轮在线验证（2026-08-31）

> 本节是当前最新状态，取代 §12.1 和 §14.6 中“尚未解决 capability parser 接线、尚未在线运行”的状态描述。本轮没有修改冻结 Context Model、WebArena 数据、Ground Truth 或 evaluator，也没有写入 `实验手册.md`。

### 15.1 结论

当前 Skill 已经可以由服务器上的 **阿器 Agent** 正确路由、注入并调用 `localweb` 执行。首轮定向任务显示：

- 分类导航任务 263：服务器历史 baseline 0 → Skill 1，且 tokens、工具调用同时下降；这是当前最干净的改善证据。
- 订单聚合任务 51：服务器历史 baseline 0 → Skill 1，但 input tokens 和工具调用约翻倍，且没有机器可复算 evidence ledger；属于准确率改善、效率回退。
- 商品价格范围任务 124：0 → 0；调用数和 input tokens 下降，但候选召回不完整，最大价返回 199.9，官方期望 298.0。
- 愿望单任务 512：旧 0 分来自 runner HAR 丢失 POST body 和 response cookies；修复后同协议 paired baseline=1、Skill=1，不是 Skill positive flip。

因此目前**不能据 4 个定向任务宣称总体准确率提高**。已观察到 2 个历史 baseline failure 在 Skill 条件下翻正、1 个真实未修复失败、1 个基础设施假失败；下一轮应先修 Skill/机器契约形式，再扩大同协议 paired 样本。

### 15.2 当前冻结输入与生成产物

| 层 | 路径 / SHA-256 |
| --- | --- |
| 原始 trace | `/Users/rebekah/handbook_web/platform-core/dev` |
| 整理后证据 | `/Users/rebekah/handbook_web/platform-core/reviewed` |
| Context Model freeze | `/Users/rebekah/handbook_web/context-model/context-model.freeze.json`，`5855791ab8a62a9d06710c5662d497028eb5c675f6bd6276cb4effe474d298e3` |
| Skill | `/Users/rebekah/handbook_web/handbooks/webarena-shopping/SKILL.md`，`35de5adc602d1674be65ee9cceae228bd491b1c2539656035cd7d8f3dd3ac38f` |
| Router | `/Users/rebekah/handbook_web/handbooks/webarena-shopping/router.json`，`d69b751c93828f2658552c1254dd1ca48995c1c679ee1bc26792cc31fe8e2124` |
| Execution contract | `/Users/rebekah/handbook_web/handbooks/webarena-shopping/references/execution-contract.json`，`1b0dc2119ef3a76e2a99296736860fa9d550a1c35d1fa3f61171129b994e086b` |
| 服务器发布目录 | `/opt/artifacttrace/local-at/benchmarks/generated-skills/webarena-shopping` |

Context Model freeze 哈希在本轮前后未变化。

### 15.3 接线与 runner 修复

ArtifactTrace 修改位于 `/Users/rebekah/artifacttrace`：

1. `local-at/benchmarks/run_at_webarena_task.py`
   - capability parser 与生成器 canonical parser 对齐；官方 Shopping 192/192 任务结果一致。
   - reset 容器健康后调用 env-ctrl `/init`，把 Magento base URL 从镜像默认地址改回 `http://localhost:7770`。
   - Chrome 临时 profile 清理改为 best-effort，避免清理竞态覆盖已完成结果。
   - HAR 记录 POST body 和 response cookies；修复前 `Set-Cookie` 虽在 headers 中，但标准 HAR `response.cookies` 始终为空。
2. `crates/executor/src/agentic_loop/stream_impl.rs`
   - 完整 DSML 文本工具调用可转换为结构化 tool call；混合文本和不完整 DSML 保持普通文本。
3. `generate-web-handbook/scripts/capability-router.mjs`、`generate-web-handbook/scripts/rebuild-from-snapshots.mjs`
   - 扩展 cart / checkout / account 与价格极值语义。
   - category-navigation 改为只要求最终状态读取，不再强制商品列表机器动作。
   - execution-contract seed 只允许用于 `order-aggregation`、`order-lookup`。

实验必须显式使用 `--agent-id 阿器`。runner 默认的 `web-benchmark-agent` 没有配置 `mcpServers: ["localweb"]`，会导致模型请求 `Tools count: 0`；该 Agent 的结果不属于目标实验。

### 15.4 路由准入审计

官方 192 个 Shopping 任务：

```text
routed=106
fallback=86
parser_parity=192/192
```

命中路由：

```text
order-aggregation=18
order-lookup=29
search-discovery=12
catalog-aggregation=8
product-selection=8
category-navigation=10
cart-lists=15
account-forms=6
```

Fallback 原因：

```text
unsupported_capability=61
unknown_requirements=25
```

这是准入覆盖，不是准确率。

### 15.5 阿器定向 pilot 结果

Skill 结果目录：

```text
/opt/artifacttrace/local-at/benchmarks/runs/webarena-shopping-contextmodel-v1-pilot-aqi-20260831-v1/baselineB_skill_routed
```

历史服务器 baseline 只读来源：

```text
/opt/artifacttrace/local-at/benchmarks/runs/webarena-verified-baselineA-aqi-server-failures-20260827T051732Z/baseline
```

| Task | Route | 历史服务器 baseline | Skill | Input tokens baseline → Skill | 工具调用 baseline → Skill | 结论 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 51 | order-aggregation | 0 | 1 | 514,137 → 1,036,313 | 16 → 31 | positive flip；效率回退；缺 evidence ledger |
| 124 | catalog-aggregation | 0 | 0 | 1,740,824 → 976,462 | 38 → 22 | 仍失败；max 199.9，期望 298.0 |
| 263 | category-navigation | 0 | 1 | 155,406 → 130,006 | 7 → 5 | positive flip；准确率与效率均改善 |
| 512 | cart-lists | 0 | 0 | 234,525 → 314,830 | 10 → 12 | 旧 HAR 协议结果无效，不能归因 Skill |

前三项不是同一时刻重跑的完整 paired A/B，只能作为定向历史对照；不得外推总体准确率。

### 15.6 HAR 修复后的 512 paired 结果

结果目录：

```text
/opt/artifacttrace/local-at/benchmarks/runs/webarena-shopping-harfix-paired-aqi-20260831-v1
```

| 条件 | Score | Input | Output | 工具调用 | NetworkEventEvaluator |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 1 | 280,634 | 1,458 | 12 | 1 |
| Skill | 1 | 291,882 | 1,446 | 11 | 1 |

旧 HAR 中 wishlist POST 的 `Set-Cookie` 已包含 toothpaste success message，但 `response.cookies=[]`；修复后 baseline 与 Skill 均通过。因此旧 baselineA 中依赖 POST data / response cookie 的 NetworkEventEvaluator 失败项需要在新协议下重新建立 baseline，不能继续统一归因于 Agent 与 evaluator 的“口径分歧”。

### 15.7 失败归因与下一步

已验证事实：

- 124 使用 Advanced Search 的产品名称匹配冻结 35 个候选，批量读取完整，但召回集合不符合任务语义；这是查询/候选边界问题，不是 selector 或分页缺失。
- 51 和 124 均调用了 contract action，但审计显示 `answer_evidence_ledgers=0`；机器动作结果没有进入可复算答案台账。
- 512 的旧失败由 HAR recorder 缺字段造成，现已修复。

建议顺序：

1. 修改 Skill 生成器/机器契约形式：普通站内搜索优先，允许一次同义词补充召回；contract action 必须产出审计可识别的 evidence ledger。
2. 用 51、124、263 加 1 个成功保持任务做当前协议 paired 回归，至少重复两次观察模型波动。
3. 只有当查询策略修复后仍无法表达“哪些候选属于目标产品概念”时，才扩展 Context Model 的查询策略/候选验收结构。
4. 只有确认缺少页面状态或动作证据时才补 trace；当前 124 不应直接以增加 trace 作为第一步。
5. HAR-fix 后重新抽查历史 34 个 NetworkEventEvaluator 失败，先区分采集缺字段与真实选品/动作错误，再决定是否重建正式服务器 baseline。

### 15.8 校验结果

```text
generator tests passed
contract evidence tests passed
contract replay passed: 335 checks
contract action replay passed
Skill is valid!
validate_platform_core.py: ok
validate_business_core.py: ok
validate_capability_bindings.py: ok
validate_context_model_freeze.py: ok
capability parser parity: 192/192
DSML parser unit tests: 2 passed
git diff --check: passed
```

未计入结果的诊断运行：

- `webarena-shopping-contextmodel-v1-smoke-20260831-v2` 至 `v12`：使用的是 runner 默认 `web-benchmark-agent`，仅用于接线诊断，不属于阿器准确率实验。
- `webarena-shopping-contextmodel-v1-pilot-20260831`：task 51 在旧 reset 逻辑下未进入 Agent；task 263 被 Chrome profile cleanup 异常阻断 evaluator。
- `webarena-shopping-contextmodel-v1-pilot-20260831-v2`：task 263 使用错误 Agent，0 工具调用；不计入目标实验。

## 16. Skill 生成器与机器契约第二轮验证（2026-08-31）

> 本节是当前最新状态，取代 §15.7 中“下一步优先修改 Skill 生成器/机器契约”的待办描述。本轮未修改 baseline、WebArena 数据、Ground Truth、evaluator 或冻结 Context Model，也未写入 `实验手册.md`。

### 16.1 结论

本轮已经完成 Skill 生成器与答案证据契约的第一阶段修复。测试结果支持以下判断：

1. **优先修改生成器/机器契约是正确的**：task 124 已从历史 0 分修复为 1 分；task 51 的既有成功结果可由 Agent 主动提交的 evidence ledger 离线复算通过；task 279 已从路由拒绝推进到正确注入、单页机器读取和可接受 evidence ledger。
2. **当前不应先增加通用 trace**：现有 trace 已足以证明 Advanced Search 多词 Name 查询返回空集合、普通多词搜索按 OR 扩张、品牌搜索加产品分类 facet 可把 34 条候选压到一个最大页，以及 `WI-1000XM2` 详情没有 Bluetooth 文本证据。
3. **task 279 的剩余主要问题是 Context Model 形式不足**：当前 `product` 只有 prose meaning，没有 typed attributes、属性证据来源和 canonical display name 规则。继续在 Skill 文本中加入具体型号特例会过拟合。
4. task 279 还存在一处 **站点数据与 Ground Truth 漂移**：当前页面标题为 `Sony WI-C300 ... (WIC300/R))`，evaluator 期望少一个右括号。不得通过修改 benchmark 或 Ground Truth 掩盖该差异。

本轮定向结果不能外推为总体准确率提升；正式结论仍需要同协议 paired 样本。

### 16.2 修改内容

`/Users/rebekah/handbook_web`：

- `generate-web-handbook/scripts/task-workflows.mjs`
  - `catalog-aggregation` capability signature 增加 `names: array`，修复 task 279 的 `unsupported_capability`。
  - 仅 min/max 使用分类价格升序/降序边界证明。
  - 完整名称集合使用 `brand-search-category-facet`：品牌搜索 → 精确产品分类 facet → 最大分页量 → 单次列表读取 → 歧义候选详情验证。
  - 明确普通多词搜索的 OR 扩张风险，禁止把 `wireless` 当作 `Bluetooth` 的替代证据。
  - 要求答案前提交结构化 evidence ledger；名称来源保持可追溯。
- `generate-web-handbook/scripts/test-contract-evidence.mjs`
  - 增加 `names/min/max` capability 路由回归。
- `generate-web-handbook/scripts/test-generator.mjs`
  - 增加完整集合策略、typed output 和硬约束行为测试。
- `generate-web-handbook/scripts/rebuild-from-snapshots.mjs`
  - execution-contract seed 复用时保留新生成的 `evidence.submit` action。
- `handbooks/webarena-shopping/`
  - 从同一 snapshots、冻结 Context Model 和生成器重新确定性生成并发布到服务器。

`/Users/rebekah/artifacttrace`：

- `crates/executor/src/tools/contract_action.rs`
  - 支持 `kind: evidence.submit`；校验并输出结构化 `evidenceLedger`，无效提交不消耗一次性预算。
- `local-at/benchmarks/run_at_webarena_task.py`
  - 同时解析旧字符串包裹结果和新结构化 contract action 结果。
  - answer audit 优先使用 Agent 显式提交的 ledger；失败 tool call 不计入有效列表动作。

### 16.3 有效在线结果

全部使用 `--agent-id 阿器`、环境重置、官方 evaluator 和 `--contract-audit-mode enforce`。

| Task / 轮次 | Route | Score | Input | Output | 工具调用 | 关键结果 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 124 / v6 | catalog-aggregation | 1 | 309,799 | 14,784 | 10 | `min=0.01,max=298`；ledger=1；audit accept |
| 51 / v6 | order-aggregation | 1 | 1,030,260 | 12,240 | 32 | `order_count=7,amount=1700.84`；修正 audit 优先级后离线复算 accept |
| 279 / v7 | catalog-aggregation | 未产出答案 | — | — | 40 | 路由和注入成功；Advanced Search 空集合后退化为 6209 条 OR 搜索，600 秒 timeout |
| 279 / v8 | catalog-aggregation | 0 | 1,973,547 | 23,541 | 32 | 单次机器列表读取、ledger=1、audit accept；11/12 个期望名称正确，缺 H900N，WIC300 多一个 `)` |
| 124 / v9 回归 | catalog-aggregation | 1 | 511,086 | 13,837 | 16 | 完整集合策略变更后 min/max 分支保持通过；ledger=1；audit accept |

结果目录：

```text
/opt/artifacttrace/local-at/benchmarks/runs/webarena-shopping-skill-contract-v2-aqi-20260831-v6-evidence-schema/baselineB_skill_routed/51
/opt/artifacttrace/local-at/benchmarks/runs/webarena-shopping-skill-contract-v2-aqi-20260831-v6-evidence-schema/baselineB_skill_routed/124
/opt/artifacttrace/local-at/benchmarks/runs/webarena-shopping-skill-contract-v2-aqi-20260831-v7-router-admission/baselineB_skill_routed/279
/opt/artifacttrace/local-at/benchmarks/runs/webarena-shopping-skill-contract-v2-aqi-20260831-v8-brand-facet/baselineB_skill_routed/279
/opt/artifacttrace/local-at/benchmarks/runs/webarena-shopping-skill-contract-v2-aqi-20260831-v9-extrema-regression/baselineB_skill_routed/124
```

未计入结果：首次 v7 启动在进入 Agent 前因本机/服务器工作目录错误和缺少临时 Playwright 依赖失败；随后使用同一 v7 目录的正式运行才进入 Agent。环境启动失败不属于 Skill 测试结果。

### 16.4 task 279 的证据化归因

已验证事实：

- v6 fallback 使用 `q=sony&cat=60`，跨 3 页检查 34 个商品，返回 13 个；额外项是 `WI-1000XM2`。
- `WI-1000XM2` 详情页对 `bluetooth` 返回 `No matches found`，Agent 随后用 `wireless` 放宽条件，造成误收。
- v7 已正确注入 Skill，但 `Sony Bluetooth headphones` 和 `Sony headphones` 的 Advanced Search Name 查询均为空；普通搜索 `Sony Bluetooth headphones` 按 OR 扩张并超时。
- v8 按品牌 `Sony` 加 Headphones 分类 facet，并使用 `product_list_limit=36` 在一次 contract read 中读取全部 34 个候选，查询编排已经闭合。
- v8 严格 Bluetooth 证据排除了 `WI-1000XM2`，但也排除了 Ground Truth 要求的 H900N；H900N 当前详情页同样没有 Bluetooth 文本证据。
- WIC300 当前 DOM 标题末尾有两个 `)`，Ground Truth 只有一个；按页面精确抄录与 evaluator 期望不可同时满足。

因此，v8 的 0 分不能再简单归因于“Skill 没遵循步骤”或“trace 数量不够”。它暴露了 Context Model 无法表达“属性事实来源、缺失属性时的判定、页面显示名与规范名”的结构问题，以及独立的 benchmark 数据漂移。

### 16.5 下一步边界

下一步优先修改 **Context Model 形式及其到 Skill 的投影**，不解冻既有文件直接覆盖：

1. 先设计候选 schema：`display_name_observed`、`canonical_name`、`attributes`、`attribute_evidence`、`source_surface`、`evidence_status`。
2. 区分 `title contains Bluetooth`、`detail proves Bluetooth`、`wireless only` 和 `attribute unknown`，让生成器依据 typed evidence 生成验收谓词，而不是自然语言同义词猜测。
3. 对页面显示名与 evaluator/规范名不一致建立显式 provenance；不得静默修正字符串。
4. 形式确定后，只针对 `attribute unknown` 的商品/页面补采定向 trace；当前不做全站通用补采。
5. 新 Context Model 候选必须另行评审和冻结；在此之前保留当前 freeze，不把 task 279 的具体型号写进通用 Skill。

### 16.6 当前产物与校验

```text
Context Model freeze  5855791ab8a62a9d06710c5662d497028eb5c675f6bd6276cb4effe474d298e3
Top-level Skill       35de5adc602d1674be65ee9cceae228bd491b1c2539656035cd7d8f3dd3ac38f
Router                2aca852f34820e2f4f161e6030c40e6c74f8290ff6fafd111a3c58b54d265a83
Catalog runtime Skill acebaf2486849476002d6e108afd72bf1e8fd7fa0a6d09de594d8e513cfcbe74
Execution contract    b2892ba43201f74fa0e7d4add335a3a31a8c434df97fabb6be24d6aa7ec3105e
```

服务器发布目录：

```text
/opt/artifacttrace/local-at/benchmarks/generated-skills/webarena-shopping
```

校验结果：

```text
generator tests passed
contract evidence tests passed
contract replay passed: 335 checks
contract action replay passed
Skill is valid!
git diff --check: passed
```

## 17. 当前 Skill 生成器 20 任务配对 Pilot（2026-09-01）

### 17.1 目的与冻结条件

本轮是一次新的 **20 任务配对测试**，用于先判断当前生成器产出的 routed Skill 是否表现出总体准确率提升信号，不是完整 benchmark 结论。

- A：`baseline`，不注入 Skill 或 Context Model。
- B：`baselineB_skill_routed`，只注入路由命中的一个 Shopping runtime Skill 及其 execution contract。
- 两组使用相同的 `阿器` agent、模型配置、官方 evaluator、600 秒预算、Shopping 环境重置与 `contract-audit-mode=enforce`。
- 奇数样本位 A→B，偶数样本位 B→A；全部串行执行。
- 未修改 Baseline、WebArena Ground Truth、benchmark 数据、评测规则、冻结 Context Model 或 Skill。

冻结计划：

```text
/Users/rebekah/handbook_web/experiments/webarena-shopping-skill-generator-paired20-20260901/plan.json
```

### 17.2 已验证结果

40/40 个运行组均有 `run_manifest.json`、`agent_response.json` 和 `eval_result.json`，官方 evaluator 的 return code 均为 0；没有 provider、gateway 或站点基础设施失败。

| 指标 | Baseline | Routed Skill | 差值 |
| --- | ---: | ---: | ---: |
| 成功任务 | 16/20 | 17/20 | +1 |
| 准确率 | 80% | 85% | +5 个百分点 |
| 正向翻转 | — | task 141 | +1 |
| 负向翻转 | — | 无 | 0 |

按实际运行时路由划分：

- 14 个任务真正注入 Skill：Baseline 12/14，Skill 13/14。
- 6 个任务 fallback、没有注入 Skill：两组均为 4/6。
- 唯一净提升来自 `order-aggregation`：task 141 从 0 变为 1；Agent 从错误的 `24.42` 修正为评测期望的 `32.41`。
- 14/14 个实际注入任务的 contract audit 通过，0 个 contract violation；5 个任务提交了 answer evidence ledger。

因此，当前生成器产物在这 20 个任务上**观察到准确率提升信号**，但只有一个 discordant pair，样本不足以证明对完整 Shopping benchmark 的总体提升。应称为“20 任务配对 pilot 有 +5pp 观察提升”，不能称为“总体准确率已经确定提高”。

### 17.3 成本结果

task 282 的 Skill 运行是有效的 agent timeout 失败，但终止事件没有 token telemetry；准确率保留该任务，token 对比只使用其余 19 对。

| 成本指标 | Baseline | Routed Skill | 变化 |
| --- | ---: | ---: | ---: |
| 平均 input tokens（19 对） | 547,318 | 590,795 | +7.94% |
| 平均 output tokens（19 对） | 5,855 | 7,355 | +25.62% |
| 平均工具调用（20 对） | 18.85 | 18.45 | -2.12% |

只看 13 个 token 可比、实际注入 Skill 的任务：平均 input tokens 为 609,438 → 614,086（+0.76%），平均 output tokens 为 4,739 → 5,959（+25.74%），平均工具调用为 20.43 → 18.79（-8.04%）。其中 input tokens 仅 5 对下降、8 对上升，均值受到 task 161 和 264 的大幅节省影响。因此当前版本尚不能声称稳定节省 token。

### 17.4 失败归因

已验证事实：

1. **task 319：机器响应契约问题。** Ground Truth 期望 `NOT_FOUND_ERROR` 且 `retrieved_data: null`；Baseline 返回 `[0.0]`，Skill 条件 fallback 后返回 `[]`。页面事实判断“没有符合条件的取消订单”是对的，但响应 schema 不合规。
2. **task 332：路由漏接 + 订单状态语义缺失。** 两组都把 2023 年 2 月已取消订单计入 `spent`，得到 `1309.03`，期望为 `912.50`；Skill 路由因 `unknown_requirements` fallback，未命中 `order-aggregation`。
3. **task 282：集合完备性和停止策略仍不可靠。** Baseline 漏掉 `Nike womens Benassi Just Do It` 并误收一个型号；Skill 命中 `catalog-aggregation`，但 49 次工具调用后 timeout，没有产出答案。
4. 6/20 个任务 fallback，说明冻结计划采用的旧 router-audit 路由标签与当前 capability parser 的实际 admission 存在差异；实际注入覆盖率为 70%，不是计划标签暗示的 100%。

推测/建议：

- 当前证据首先指向 **Skill 生成器、capability router 和机器响应契约**，不支持立即做通用 trace 补采，也不足以要求先重构 Context Model 形式。
- 生成器应把“spent 排除 canceled/refunded 状态”“空结果必须按期望 schema 返回 `retrieved_data: null`”“集合任务的候选覆盖证明与硬停止条件”写成 typed contract，而不是只写自然语言步骤。
- 路由器应修复 task 332 的 order-aggregation 识别，并为 task 319 的 refund/no-match 语义建立可路由 capability。
- task 282 需要先对现有 trace/Context Model 做定向证据检查；只有确认缺少 `Nike womens Benassi Just Do It` 的可见入口、分页或分类事实后，才补采对应 trace。不要先做无目标的全站补采。

### 17.5 产物路径

本地结构化结果：

```text
/Users/rebekah/handbook_web/experiments/webarena-shopping-skill-generator-paired20-20260901/results.json
```

服务器原始运行结果：

```text
/opt/artifacttrace/local-at/benchmarks/runs/webarena-shopping-skill-generator-paired20-20260901-v1
```

每个任务的原始证据位于：

```text
<server_output_root>/baseline/<task_id>/{run_manifest.json,agent_response.json,eval_result.json}
<server_output_root>/baselineB_skill_routed/<task_id>/{run_manifest.json,agent_response.json,eval_result.json}
```

### 17.6 下一步

优先进入下一轮最小修改：

1. 修复响应机器契约的 `NOT_FOUND_ERROR` 空值规范。
2. 修复 `spent` 对 canceled/refunded 订单的状态过滤，并让 task 332 命中 `order-aggregation`。
3. 为 `catalog-aggregation` 增加可验证的覆盖边界和停止预算，针对 task 282 做回归。
4. 先跑 task 319、332、282 的定向回归，再用本轮 20 个任务复跑 B；A 的冻结结果可复用，不重跑、不覆盖。
