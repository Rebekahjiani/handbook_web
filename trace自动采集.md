# trace 自动采集

> 本文件说明 WebArena **shopping** 站点 trace 的**产物是如何产生的**：从环境、命令、驱动脚本行为、tracer API 调用到落盘结构，全部固定下来，便于**复现**与**扩展**。
> 实验轮次结论与事故记录同步登记在 `实验手册.md` §10。

## 0. 版本指纹（复现基线）

| 组件 | 位置 | 指纹 |
| --- | --- | --- |
| 驱动脚本 | `generate-web-handbook/scripts/webarena-shopping-trace-driver.mjs`（906 行） | sha256 前缀 `fed8c79bbc1e69bc`（26_08_21_15_00_47 正式 run 所用） |
| 驱动脚本（26_08_21_16_27 起） | 同上（915 行） | sha256 前缀 `9d1496c4ba7d57a5`（新增：实际会话账号记录、`--fresh-account` 登出分支） |
| 驱动脚本（26_08_21_16_50 起） | 同上（981 行） | sha256 前缀 `071d8decc977c655`（新增：`configurable_select` 规格选择流程、下单成功页 `?pbaocw` 判定） |
| tracer 源码仓库 | `/Users/rebekah/context-model-generator-web` | git HEAD `20f1c9debb06a386d3663deecbb640afaadd82a1` |
| 产物所在仓库 | `/Users/rebekah/handbook_web` | git HEAD `742377d` |
| playwright | `generate-web-handbook/node_modules/playwright` | `1.62.0`（tracer 侧为 workspace `1.61.0`） |
| Chrome | 本机 `/Applications/Google Chrome.app` | `151.0.7922.170`（经 CDP 9222 连接） |

> 扩展或复现遇到行为差异时，先核对上述指纹是否与记录一致（驱动脚本后续修改会改变 sha256，应在本文档追加新基线）。

## 1. 当前产物总览（已验证事实）

**正式采集（本轮，仅 storefront，未采集 admin，未下单）：**

- runRoot：`platform-core/dev/26_08_21_15_00_47-js/`（≈391 MB）
- profile：`webarena_shopping` / `completed` / `durationMs=151,606`（约 2 分 32 秒）
- 账号：**已有会话** `wa.tracer.1787292848790@example.com`（干跑 1/2 注册；本轮 `login_ensure method=already`，**未新注册**；driver-report/`driver-runs.jsonl` 中的 `accountEmail` 为脚本预生成的候选注册邮箱——已在 26_08_21 之后改为记录实际会话账号）
- 时间窗：`2026-08-21T07:00:48Z → 07:03:19Z`
- 命令：`node scripts/webarena-shopping-trace-driver.mjs --storefront-only`（其余参数全默认）

| 证据类型 | 文件/目录 | 数量与规模 |
| --- | --- | --- |
| Chrome Tracing（性能 trace） | `trace.segment.000001..000011.jsonl` | 11 段，共 **1,463,140** 事件；preset=`js`（toplevel/blink/loading/v8）；`dataLossOccurred=true`（保守标记：`maxSwitchGapMs=3631`，即一次分段切换停顿 3.6s；无 failed 段） |
| trace 元数据 | `trace.meta.jsonl` / `trace.segments.manifest.json` / `trace.segments.summary.json` | 分段与事件索引 |
| 网络请求/响应 | `698D50C4_trace/network.jsonl` | **7,692** 事件（request 3,846 / response 3,846） |
| 响应体原文 | `698D50C4_trace/rawbody/` | **3,692** 个文件（含表单 POST body、API 响应原文，扩展名按 content-type 推断） |
| 页面会话元数据 | `698D50C4_trace/profile-run.json` / `metadata.json` / `runtime-status.json` | 录制参数与状态 |
| 交互事件 | `698D50C4_trace/interactions.jsonl` | **不存在（0 条，已知限制，见 §5.1）** |
| pre 快照 | `698D50C4_pre/`（截图 png + html + accessibility.json + capture.json） | ≈3.9 MB |
| post 快照 | `698D50C4_post/`（同上） | ≈1.0 MB |
| driver 步骤日志 | `driver-steps.jsonl` / `driver-report.json` | 11/11 步成功 |
| driver 截图 | `driver-screenshots/`（12 张） | 每步一张 |
| 跨 run 台账 | `platform-core/dev/driver-runs.jsonl`（outputRoot 下） | 每次采集追加一行 |

**对比产物（保留不删）**：`platform-core/dev/26_08_21_14_54_43-js/`（9/11，add_to_cart 失败版，加购修复前）。三轮 `--no-record` 干跑产物 `manual-*` 目录由用户在正式采集前主动删除（属过渡验证产物）；其结果与故障记录已完整保留在本文件 §3 与 `driver-runs.jsonl` 前 6 行，不影响正式证据。

**补充采集 ①（`--fresh-account`，补 account-forms 缺口）：**

- runRoot：`platform-core/dev/26_08_21_16_27_00-js/`（≈12/12 步全成功，profile `5cdd5c41` completed，durationMs=193,828）
- 命令：`node scripts/webarena-shopping-trace-driver.mjs --storefront-only --fresh-account`
- 本 run 的已验证事实：`login_ensure method=register loggedIn=True`（先登出 → 注册新账号 `wa.tracer.1787300819721@example.com`，driver-report 已按实际账号记录）；**`POST /customer/account/createpost/` 进入网络证据**（account-forms 缺口补齐）；结算多了一步 `POST /rest/default/V1/carts/mine/billing-address`（比上一 run 更完整）；`order_history orderRows=0`（**空态订单历史页**顺带入库）；network 9,530 事件；未下单；interactions=0（限制同前）；`category_browse_2` 为有条件步骤（搜索后未停在商品页才执行，本轮执行了）
- 已知小瑕疵（如实记录）：description/product 详情步的 step URL 有时停在列表页（`flowProductDetail` 点击后未跳转时以当前页记录），商品详情证据以 rawbody HTML 为准

**补充采集 ②（`--place-order` 两轮 + 聚合账号，补 下单mutation / order-aggregation 缺口）：**

| run | 命令要点 | 结果（已验证） |
| --- | --- | --- |
| `26_08_21_16_51_26-js` | `--storefront-only --place-order --shopping-user/--shopping-pass`（聚合账号 `wa.tracer.agg.1787302127232@example.com`，本节先注册该账号：`/customer/account/create` 填表注册，已知凭据） | 12/12 步；checkout **placed=true**，`/checkout/onepage/success/`；**订单 #191**；**`POST /rest/default/V1/carts/mine/payment-information`（cartId 268，下单 REST `setPaymentInformationAndPlaceOrder`）首次入案** —— edit-submit 最大 mutation 证据补齐 |
| `26_08_21_16_59_39-js` | 同上（复用聚合账号会话） | 12/12 步；**订单 #192**；`order_history orderRows=2`（历史页 2 行 + 打开第一笔详情 192）—— **order-aggregation（多单汇总面）证据到位** |

- 聚合证据要点（已验证）：两轮均含结算 REST 链 estimate×3 → totals×2 → by-address-id → shipping-information → billing-address → set-payment-information → **payment-information（下单）**；checkmo；`driver-report/orderPlaced=true`、`driver-runs.jsonl` 已按实际账号记录。
- **可配置商品规格选择（product-selection 缺口）结论**：驱动已内置 `configurable_select` 步骤（在 iPhone 搜索结果前 8 个商品中逐个找 `.super-attribute-select`/`.swatch-option`，选中后加购）；两轮实测均返回 `configurable:false`——anime 手机壳页 `super-attribute-select=0/swatch-option=0`（但有 Add to Cart + In stock），**该 run 全部 268 个 rawbody HTML 中两选择器命中均为 0** → 本 fork 无（或极罕见）需选规格的可配置商品，缺口按「站点事实」关闭（若后续站点引入可配置商品，步骤会自动演练）。
- **有评论商品探查（reviews 列表素材）结论**：独立 probe 遍历顶级分类前 6 页共 **72 个商品页，`review-item` 命中 = 0**（全部为 "Be the first to review" 表单）；结合两轮正式 run 的商品详情页（anime/tweezers 均无既有评论）→ **该 fork 商品池无既有评论数据**，reviews「列表读取」素材缺失属平台数据事实，缺口关闭；`review-form`/`#reviews` 结构证据已在。

## 2. 产物是如何产生的（生成链路）

### 2.1 链路图

```text
[driver: webarena-shopping-trace-driver.mjs]
   ├─ playwright chromium.connectOverCDP("http://127.0.0.1:9222")
   │     └─ 操作 Chrome 标签页（打开 localhost:7770，点击/输入/滚动）  ← SSH 隧道 → 远程 WebArena
   └─ fetch → ContextModelTracer HTTP API (127.0.0.1:14567)
         ├─ POST /api/profile/start   → tracer 通过自己的 CDP 连接向同一 tab 发起
         │                              Tracing.start(ReturnAsStream) + 注入交互监听 + pre-capture
         ├─（driver 走 11 个 flow 期间 tracer 持续）
         │       · Tracing 每 ~15s 滚动落一段 trace.segment.*.jsonl（IO.read 流式）
         │       · page 级监听网络事件 → network.jsonl；响应体 → rawbody/
         └─ POST /api/profile/stop    → Tracing.end + post-capture + 汇总 profile-run.json
```

要点：driver 与 tracer **各自独立** connectOverCDP 到同一个 Chrome；tracer 是常驻后端，start/stop 必须落在同一会话上（Chrome Tracing 不能跨短命进程）。

### 2.2 前置环境（复现必须，全部已验证）

```bash
# ① SSH 隧道（免密；浏览器访问必须用 localhost，站点跳转会拒绝 127.0.0.1）
ssh -N -L 7770:localhost:7770 -L 17771:localhost:7771 \
    -L 7780:localhost:7780 -L 17781:localhost:7781 \
    -L 9999:localhost:9999 -L 19998:localhost:9998 \
    root@218.245.63.97 -p 2286

# ② Chrome 开启 CDP（独立 user-data-dir，持久化登录态；本次 9222）
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 --user-data-dir=/tmp/cmg-tracer-chrome

# ③ tracer 常驻后端（API 14567 / Web 14568）
cd /Users/rebekah/context-model-generator-web/tracer-webapp && pnpm dev
```

### 2.3 一次完整生成的执行序列（与产物一一对应）

| 步骤 | 驱动脚本行为 | 关键事实（已验证） |
| --- | --- | --- |
| 1 | `chromium.connectOverCDP(http://127.0.0.1:9222)` | 脚本结束**不**关闭浏览器（close 只断开连接） |
| 2 | 自检 `GET /api/healthz`（仅非 --no-record） | tracer 必须已启动，否则 FATAL |
| 3 | `openOrReusePage` 打开 `http://localhost:7770`，经 CDP `Target.getTargetInfo` 取本 tab 的 `targetId` | 复用同站已有 tab 或空白 tab，否则新开 |
| 4 | `POST /api/profile/start`，payload： | `targetIds` 由步骤 3 的 targetId 决定 |
| | `{ cdpPort:9222, targetIds:[<targetId>], pageName:"webarena_shopping", basename:"storefront", outputRoot:"/Users/rebekah/handbook_web/platform-core/dev", tracePreset:"js", traceCategories:[], captureBefore:true }` | outputRoot 传**绝对路径**，落盘位置不受 tracer 配置影响 |
| 5 | 轮询 `GET /api/status` 直到 `runtime.state==="recording"` | runRoot = `{outputRoot}/{runTs}-js/`（runTs 由 tracer 生成，如 `26_08_21_15_00_47`） |
| 6 | 依次执行 11 个 flow（见 §2.5 表） | 每步：动作 → 截图 → 追加 `driver-steps.jsonl` |
| 7 | `POST /api/profile/stop`，payload：`{ pageName:"webarena_shopping", captureAfter:true }` | 结束 Tracing、落 post 快照、写 `profile-run.json` |
| 8 | 写 `driver-report.json`；outputRoot 下追加 `driver-runs.jsonl` | 跨 run 可追溯 |

### 2.4 落盘结构（runRoot 内）

```text
platform-core/dev/26_08_21_15_00_47-js/
├── trace.segment.000001.jsonl … 000011.jsonl   # Chrome Tracing 分段（browser 级，覆盖该 tab 全部活动）
├── trace.meta.jsonl                            # 每段流的元数据行
├── trace.segments.manifest.json                # 段文件清单（路径、大小、事件数）
├── trace.segments.summary.json                 # 汇总（totalSegments/totalEventCount/dataLoss）
├── 698D50C4_trace/                             # 页面会话目录，前缀 = CDP targetId 前 8 位
│   ├── network.jsonl                           # 该 tab 的 request/response 事件（含 POST body 引用）
│   ├── rawbody/                                # 响应体原文（按 content-type 推断扩展名）
│   ├── interactions.jsonl                      # 交互事件（本轮为空，见 §5.1）
│   ├── metadata.json / profile-run.json / runtime-status.json
├── 698D50C4_pre/ 698D50C4_post/                # 录制前后页面快照（png/html/accessibility/capture.json）
├── driver-steps.jsonl / driver-report.json     # driver 步骤与汇总
└── driver-screenshots/                         # 每步截图
```

### 2.5 11 个 flow 及其锚点（复现/排查时若站点 DOM 变化，先对照此表）

| # | flow | 页面/动作 | 关键选择器（已验证） |
| --- | --- | --- | --- |
| 1 | open_home | 打开 `localhost:7770`，滚动 3 次 | `#search, .page-header` |
| 2 | category_browse | 从导航选顶级分类（排除政策/搜索等），滚动懒加载 + 翻页 | `nav .navigation a[href$='.html']` + DENY 正则；`.product-item`；`.action.next` |
| 3 | product_detail | 点列表第一个商品，采集标题/价格/评论区 | `.product-item a.product-item-link`；`[data-ui-id="page-title-wrapper"]`；`#reviews` |
| 4 | search_discovery | 依次试词（phone case…），点第 2 个结果 | `#search` + `.action.search` |
| 5 | product_detail_2 | 已在详情页则直接采集，否则点商品 | `.product-info-main` 判定 |
| 6 | login_ensure | 已登录→跳过；否则 `--shopping-user/--shopping-pass` 登录或注册新账号 | `/customer/account`；登录 `#email #pass .action.login`；注册 `#firstname #lastname #email_address #password #password-confirmation` |
| 7 | add_to_cart | 逐商品重试（每次换分类页第 N 个商品），校验成功提示 | `#product-addtocart-button:visible`；`.message-success` |
| 8 | cart_view | 打开购物车 | `/checkout/cart`；`.cart-empty` |
| 9 | checkout | 进结算→填地址/国家/地区→Next→**停在 Place Order 前（默认）** | `#top-cart-btn-checkout:visible`、`.action.primary.checkout:visible`；select `country_id/region_id`；`.button.action.continue.primary`；Place Order 仅 `--place-order` 启用 |
| 10 | order_history | 订单历史 + 打开第一笔详情 | `/sales/order/history`；`#my-orders-table`；`.action.view` |
| 11 | account_page | 账户页 | `/customer/account`；`.block-dashboard-info` |

## 3. 复现命令（从零开始的最小序列）

```bash
# 1) 三份前置（§2.2，各开一个终端/后台）
# 2) 干跑验证（可选，不调 tracer，产物落 platform-core/dev/manual-*）
cd /Users/rebekah/handbook_web/generate-web-handbook
node scripts/webarena-shopping-trace-driver.mjs --no-record

# 3) 正式采集（复现本轮：仅 storefront）
node scripts/webarena-shopping-trace-driver.mjs --storefront-only
# 预期：runRoot=platform-core/dev/{runTs}-js/，11/11 步成功，产出与 §1 结构一致
```

> 复现核对点：`driver-report.json` 的 `profiles[0].status=="completed"`、`driver-steps.jsonl` 全 `ok:true`、`trace.segments.summary.json` 的 `totalEventCount>0` 且 `failedSegments==0`（`dataLossOccurred` 为保守标记：任一 failed 段或切换间隙 >1000ms 即 true；本 run 为 true 仅因一次 3631ms 切换停顿，段内容完整）。

## 4. 如何扩展 trace

### 4.1 参数扩展（无需改代码）

| 参数 | 效果 | 影响 |
| --- | --- | --- |
| `--admin-only` / `npm run trace:shopping`（split） | 采集 admin 轮 / 完整两轮 | admin 走 `{origin}/admin/`（`#username #login .action-login`），只读网格 |
| `--place-order` | 结算真正下单 | ⚠️ 新增订单，属 benchmark 写操作，默认关闭 |
| `--fresh-account` | 先登出再注册，注册流程也进 trace | 多注册一个账号 |
| `--wishlist` | 加购前先加入愿望清单 | 改变账号状态，默认关闭 |
| `--preset base\|js\|js-profile` | 控制 Tracing 粒度 | `js-profile` 体积显著增大 |
| `--mode single` | storefront+admin 一次 run | 只有第一个 target 有 Chrome Tracing（§5.2） |
| `--output-root` | 改变产物根目录 | 默认 `/Users/rebekah/handbook_web/platform-core/dev` |
| `--no-record` | 只跑流程不调 tracer | 用于选择器验证 |

### 4.2 新增 flow（代码位置）

- 每个 flow 是一个 `async function flowXxx(ctx, page)`（§2.5 表对应的函数），失败只影响该步（`TraceRun.record` 隔离异常）。
- 在 `main()` 的 storefront/admin 分支里按顺序 `await recorder.record("step_name", () => flowXxx(...), page)` 注册即可。
- 步骤结果会随 `driver-report.json` / `driver-steps.jsonl` 自动记录；新步骤会进入 trace 录制（只要发生在 start/stop 之间）。
- 扩展后更新 §2.5 表与 §0 指纹。

### 4.3 消费现有产物

- 结构化分析：tracer 提供分析端点（对 profileId 生效）——`POST /api/analysis/preprocess*`、`GET /api/analysis/:profileId/filtered|summary|index`、`/api/profiles/:id/analysis/...`（见 `docs/api.md`），可把 network/interactions 加工成 API 调用对、UI 结构等结构化证据。
- 直接读取：`network.jsonl` 每行一个事件（含 `requestId/url/method/postData/responseBodyFile` 等）；`rawbody/` 文件名含毫秒时间戳，可与 network 事件按时间对齐；`trace.segment.*.jsonl` 为 Chrome Tracing 原始事件（`ph/ts/name/cat`），供时间骨架与性能分析。
- 注意：tracer Web 控制台（14568）的 Evidence 列表默认扫 `context-model-generator-web/platform-core/dev`；要在此查看 handbook_web 产物，需 `PUT /api/config` 把 `evidenceOutputRoot` 指向 `/Users/rebekah/handbook_web/platform-core/dev`。

### 4.4 站点 DOM 变化时的适配点

站点改版后，先跑 `--no-record` 干跑，对照 §2.5 锚点表定位失败步骤；选择器集中在各 `flowXxx` 函数顶部，改动局部即可；若页面结构大改（如更换模板），需同步更新 `fillVisibleInputs/fillVisibleSelects` 的字段名映射与结算步按钮判定。

## 5. 已知限制与事故记录

### 5.1 interactions 为空（已验证）

tracer 只在 `startProfile` 时注入一次交互监听脚本；页面**整页导航**后注入被销毁 → 多页面自动化录制 `interactions.jsonl` 为空（本轮 0 条）。补齐需 tracer 侧实现「导航后重注入」。当前以 network + Chrome Tracing 为主证据。

### 5.2 Chrome Tracing 是 per-target（已验证）

`--mode single` 合并录制时仅第一个 target 有 Tracing；按 surface 拆分录制（默认 split / 本轮）每个 run 都有完整 Tracing。

### 5.3 干跑 2 意外订单 #190（事故，已修复）

干跑第 2 轮（`manual-1787293500608`）因 checkout payment 守卫顺序 bug，未加 `--place-order` 仍真实创建订单 `order_id=190`（2026-08-21，账号 `wa.tracer.1787292848790@example.com`）。已修复（守卫提前、Place Order 点击仅 `--place-order` 启用）。影响评估（推测，待验证）：站点时钟若为真实 2026，则该订单不在 WebArena 任务「2023-06」窗口内。

## 6. 台账关联

- `实验手册.md` §10：本轮采集与事故的结论登记。
- `platform-core/dev/driver-runs.jsonl`：每次采集的机器可读流水。
- 产物目录：`/Users/rebekah/handbook_web/platform-core/dev/`（已加入 `.gitignore`，不进 git 历史）。
- **下一步入口（Step 02 提炼，调研结论）**：context-model-generator-web 的正式构建管道是运行态 4 步任务链——01 scope → `template/steps/02-platform-core-draft`（review 本批 evidence → 提炼 states/actions/state-machines → `python3 scripts/validate_platform_core.py --root .`）→ `template/steps/03-business-core-refinement`（炼出 `business-core/{object-model,business-context,capabilities/*}.json` → `validate_business_core.py`）→ 04 交叉校验+freeze。执行地：先 `./build-template.sh` 生成 `dist/templates/ContextModelGenerator/`，在 AT 工作区执行；无一键命令，校验脚本不读 `platform-core/dev/`（`template/scripts/README.md:14`）。

## 7. 采集详尽性审计（对照 handbook 12 路由）

> 依据：正式 run `26_08_21_15_00_47-js` 的证据内容（steps/network/rawbody/segments/快照）与 `handbooks/webarena-shopping/router.json` 的 12 条工作流路由逐项对照。**已验证事实**与**缺口（推测/建议）**分开标注。

### 7.1 覆盖矩阵

| handbook 路由 | 覆盖 | 证据位置（已验证） |
| --- | --- | --- |
| navigation / category-navigation | ✅ 全 | 首页 `/`、分类 `beauty-personal-care.html` + 分页 `?p=2`，URL 与 rawbody HTML（248 个 html body）齐全 |
| search-discovery | ✅ 全 | `#search` 输入 → `/search/ajax/suggest/`（联想）→ `/catalogsearch/result/`（61 结果）→ `/catalogsearch/searchTermsLog/save/` |
| product-selection | ⚠️→✅ N/A 关闭 | 2 个商品详情（anime、tweezers）✅；「可配置规格选择」已内置 `configurable_select` 步骤并两轮实测：**本 fork 商品页无 `super-attribute-select`/`swatch-option`（含动漫手机壳页，268 个 run HTML 命中 0）** → 该类商品不存在，步骤留作自动演练 |
| catalog-aggregation | ⚠️ 部分 | 分类/搜索结果页 DOM 与商品数量在；无跨页聚合演练 |
| order-lookup | ✅ | `/sales/order/history` + 详情（#190；#191/#192 见聚合 run） |
| order-aggregation | ✅ 已补（26_08_21_16_59_39） | 聚合账号累计 **2 笔订单**（#191、#192），`order_history orderRows=2`：历史页 2 行 + 首笔详情，多单汇总素材在案 |
| reviews | ⚠️→✅ 数据事实 | 商品页 `#reviews`+`product-reviews-summary`+`review-form` 结构在；**72 商品页 probe `review-item`=0** → 该 fork 商品池无既有评论，"读取评论列表"无素材属站点事实 |
| account-forms | ✅ 已补（26_08_21_16_27_00） | `--fresh-account` 登出→注册，`POST /customer/account/createpost/` 在案；注册/登录表单动作完整进 trace |
| edit-submit | ✅ 已补（26_08_21_16_51_26） | 加购/结算/注册 POST 全在；**`POST /rest/default/V1/carts/mine/payment-information`（下单 REST）已入案**，订单 #191/#192 真实创建；还包括 billing-address、set-payment-information |
| read-content | ⚠️ 部分 | 条款页/404 未采；26_08_21_16_27_00 顺带采到**空态订单历史页**（orderRows=0） |
| other | ❌ 未覆盖 | 404、空搜索、空购物车等空态页无样本（`cart_view emptyCart=false` 未采空态） |

### 7.2 各类证据的详尽度结论（已验证）

- **网络链（最全）**：3,846 请求 + 3,846 响应逐条捕获；POST body 含真实地址/客户/购物车数据（比 DOM 表单截图更接近"真实提交"证据）；rawbody 3,692 个文件按 content-type 归档。
- **结算 mutation 链**：`estimate-shipping-methods → totals-information → by-address-id → shipping-information → set-payment-information` 全部在案，每个 body 可还原结算语义。
- **页面快照**：11 张 step 截图 + pre/post（HTML 253KB / 188KB + accessibility.json）。
- **Chrome Tracing**：11 段覆盖全程 138,996ms，事件 1,463,140。
- **interactions**：0（已知限制 §5.1，多页跳转后注入失效）。

### 7.3 缺口 → 补采建议（推测/建议，未实施）

| 优先级 | 缺口 | 补法 | 代价 |
| --- | --- | --- | --- |
| ~~高~~ | ~~account-forms（注册/登录表单进 trace）~~ | ✅ 已补（26_08_21_16_27_00，`--fresh-account`） | 已完成 |
| ~~高~~ | ~~edit-submit 的 place-order（下单 mutation 证据）~~ | ✅ 已补（26_08_21_16_51_26 / 16_59_39，`--place-order`，订单 #191/#192 已登记） | 已完成 |
| ~~中~~ | ~~可配置商品规格选择~~ | ✅ 已内置 `configurable_select` 步骤；实测本 fork 无该类商品（268 个 run HTML 0 命中），自动演练就绪 | 已完成 |
| ~~中~~ | ~~order-aggregation（多单汇总）~~ | ✅ 已补（聚合账号 2 单 #191/#192，历史 2 行） | 已完成 |
| ~~中~~ | ~~reviews 列表素材~~ | ✅ 已探查：72 商品页 `review-item`=0，站点无既有评论（属数据事实，非采集缺口） | 已完成 |
| 低 | interactions 补齐 | tracer 侧实现「导航后重注入」 | 高（tracer 改造） |
| 低 | read-content / other 空态 | 驱动加 1-2 个空态步骤（空搜索词、不存在的 URL） | 低 |

**推荐补采序列**（每次间隔做台账登记）：① `--fresh-account`（account-forms）→ ② `--place-order`（下单链）→ ③ 复采订单历史（order-aggregation）。
