---
name: generate-web-handbook
description: 通过现有 Chrome DevTools Protocol 会话和任务语料爬取网站，生成“任务工作流 + 按需检索的小型 handbook”站点 skill。适用于构建或刷新浏览器 agent 的网站操作技能、整理参数化 Playwright locator、压缩 selector 上下文，或恢复中断的 handbook 抓取任务。
---

# 生成网站 Handbook

为每个网站生成一套任务驱动的操作 skill。任务手册只做路由；agent 每次只读取
一个工作流，失败后再逐级读取单页快照和全量 selector。生成器同时输出适合直接
注入 agent 的窄运行时 skill，并把所有已生成网站汇总到一个总 router。

任务集是可选的优先级信号，不是生成器的硬依赖。有任务集时，用它激活领域
工作流、排序少量抓取入口并检查覆盖；没有任务集时，从页面证据生成导航、
搜索、读取、账户表单、修改提交等通用工作流。领域任务入口默认不能超过页面
预算的三分之一。

## 执行流程

1. 阅读 [抓取策略](references/crawl-policy.md)。
2. 做自动迭代或基准实验时，阅读
   [迭代与回归策略](references/iteration-policy.md)，先冻结覆盖语料和重点任务。
3. 若网站已有从 Trace 审核形成的正式 Context Model，阅读
   [Context Model 输入](references/context-model-input.md)；不要直接把原始 Trace
   塞进 handbook。
4. 确认目标网站和 CDP 端点均可访问。
5. 在项目根目录运行抓取器：

```bash
node generate-web-handbook/scripts/crawl-site.mjs \
  --url http://localhost:7770 \
  --site webarena-shopping \
  --output handbooks \
  --cdp http://127.0.0.1:9222 \
  --max-pages 10 \
  --max-depth 1 \
  --coverage-corpus /path/to/full-task-corpus.json \
  --focus-tasks /path/to/current-failures.json \
  --site-key shopping \
  --context-model /path/to/context-model-workspace
```

`--coverage-corpus` 决定工作流库存和 router 覆盖；`--focus-tasks` 只决定本轮抓取
优先级和分类路径提示，不能删除覆盖语料中的工作流。`--tasks` 保留为兼容参数，
等价于把同一文件同时用于两者，不要与新参数混用。`--site-key` 用于筛选任务并解析
`__SHOPPING__` 一类站点占位符。提供任务集后，常见任务入口会优先进入抓取队列；
默认最多占页面预算的三分之一，避免具体任务页面挤占通用路由。需要调整时使用
`--max-task-seeds N`。

生成器只读取任务意图、站点和起始 URL，不读取 evaluator 的期望答案。它会用
任务词从已经抓取的站点链接中选择少量分类路径提示；这些提示仍需在实时页面核验。
抓取导航页时会逐个 hover 可见的一级菜单并合并动态出现的同源链接，避免只保存
父分类。商品列表则生成一段小型批量读取模板，固定返回页面身份、总数、商品字段
和 Next；agent 不需要自行重复发明 selector。

生成器同时写入 `references/execution-contract.json`。这里保存每个 workflow 的
允许动作、列表页确定性 evaluate 模板、查询预算和 SUCCESS 前的 CDP 最终状态闸门；
运行时应以这个 JSON 为强制来源，Markdown 只作为解释层。

`--context-model` 也为可选。它只读取正式的 `business-core/` 与
`platform-core/bindings/`，把与当前工作流相关的对象、能力、页面状态、动作和
已验证 selector 裁成小型摘录。陌生网站没有 Context Model 时，生成流程不受影响。

生成器会在写入前执行 router 门禁：覆盖语料必须 `0 unmatched`，最后始终保留通用
fallback；如果新 router 删除旧路线则停止，只有显式传入
`--allow-route-removal route-a,route-b` 才允许删除。冲突与最终主路由记录在
`snapshots/router-audit.json`。

6. 按顺序检查：
   - `SKILL.md` 是否只说明渐进式加载规则；
   - `references/handbook.md` 是否是小型任务路由；
   - `references/workflows/*.md` 是否包含步骤、成功判据、风险和 locator；
   - `references/execution-contract.json` 是否包含各 workflow 的 allowed actions、
     budgets 和 final state gate；
   - `runtime-skills/*/SKILL.md` 是否每个只覆盖一种任务策略，并编译为前置条件、
     状态变量、循环动作、停止条件、完成证明和失败恢复；
   - 列表型运行时 skill 是否含单次批量读取模板、查询预算和停止条件；
   - 站点 `router.json` 是否带有 `site_keys`，输出目录的
     `webarena-router.json` 是否汇总所有网站；
   - `snapshots/coverage.json` 是否如实标出任务覆盖缺口。
7. 至少查看一个单页快照和一张标注截图，确认工作流证据可追溯。
8. 在不点击页面的前提下验证生成的原始 locator：

```bash
node generate-web-handbook/scripts/verify-handbook.mjs \
  --handbook handbooks/webarena-shopping \
  --cdp http://127.0.0.1:9222
```

9. 若外部工具链提供 `quick_validate.py`，使用它校验生成的站点 skill；本仓库不包含该文件，仓库内可执行验证使用 `verify-handbook.mjs` 与 `npm --prefix generate-web-handbook test`。
10. 检查各 Markdown 文件体量，确保路由手册和单个运行时 skill 都保持小型；不要
   为减少路由数量把订单聚合、订单查找、分类导航和商品聚合重新合并。

本项目只验证生成结构、证据和 locator，不在这里运行 agent A/B；skill 效果应在
目标 benchmark 项目中验证。

## 恢复或刷新

抓取器每完成一个页面便写入检查点。以相同命令重跑即可恢复；已完成 URL
会被跳过，待抓取队列会从任务入口和保存的链接中重建。

仅在需要替换当前结果时使用 `--fresh`。旧 handbook 会被移动到带时间戳的
同级目录，不会被直接删除。

## 判断 locator 质量

按以下顺序选择：

1. 经实时验证唯一的 `getByRole(role, {name})`
2. 唯一且稳定的 `data-testid`、`aria-label`、`name` 或 `id`
3. 导航元素的唯一精确 `href`
4. 最后才使用生成的 CSS 路径

如果 locator 有歧义、动作名称不符、只依赖坐标，或依赖随机 class，则判定
为不合格。截图用于理解布局，不作为首选点击方式。

## 保留迭代证据

把 `manifest.json` 作为恢复记录，把 `snapshots/coverage.json` 作为任务覆盖
记录，把结构化页面快照作为 selector 事实来源。不要手工修改生成数据。通用且
稳定的经验写入本 skill；站点细节只保存在各自生成的 handbook 中。
