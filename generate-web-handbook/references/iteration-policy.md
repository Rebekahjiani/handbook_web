# 迭代与回归策略

把每轮自动改进分成三组任务：

- 训练组：当前失败题，只用于定位问题和生成最小策略更新。
- 回归组：历史通过题，每条主路由至少保留一题，防止旧能力被遗忘。
- 晋级组：完整任务分布；候选只有通过训练组和回归组后才能运行。

使用两个不同输入：

- `coverage-corpus` 保存完整、脱敏后的 `task_id/sites/start_urls/intent/task_type`，
  只决定工作流库存和 router 覆盖。
- `focus-tasks` 保存本轮重点题，只影响抓取种子、路径提示和覆盖统计。

每次生成后先读取 `snapshots/router-audit.json`：

1. `unmatched_count` 必须为 0。
2. 每条任务必须有一个按优先级选出的主路由。
3. `conflicts` 单独审查，不能依赖 fallback 掩盖错误的专用路由。
4. `removed_routes` 必须为空；删除路线时显式声明并说明原因。

用 `scripts/build-iteration-splits.mjs` 从完整覆盖语料、重点任务和冻结 baseline 中
生成 `train-task-ids.json`、`replay-task-ids.json` 与
`promotion-task-ids.json`。该脚本只服务实验分组，输出内容不得进入运行时 Skill。

真实任务失败后只更新最早出错的层：router、页面证据、站点业务规则或执行策略。
数据集、evaluator 和 provider 问题不反馈到网站 Skill。

本轮发生正负翻转的任务至少重复 2 次；结果不一致时标为不稳定，不据此固化强
规则。用 `scripts/summarize-repeated-runs.mjs` 汇总多个 attempt 根目录；报告会记录
每题的 score 序列、通过率和稳定性，只有达到最小次数且全部通过才放行。准确率
优先于 token 和工具调用；覆盖、安全或历史回归未过门禁时不得晋级。
