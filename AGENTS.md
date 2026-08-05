# AGENTS.md

# AI Assistant Instructions

## Language

始终使用简体中文回答。

包括但不限于：

- 思考过程（Plan）
- 分析
- Debug
- Review
- 修改建议
- Commit Message
- PR Summary
- Tool 使用说明

只有以下内容保持原文：

- 代码
- Shell 命令
- JSON
- YAML
- 日志
- 报错信息
- API 返回

不要主动翻译代码。


---

## Coding Style

修改代码遵循最小改动原则（Minimal Change）。

不要为了美观：

- 重构整个文件
- 修改无关代码
- 调整大量格式
- 修改命名

除非用户明确要求。


---

## File Policy

优先修改已有文件。

不要：

- 新建重复文件
- 创建 backup
- 创建 copy
- 创建 temp 文件

新增文件前必须确认是否能够复用已有文件。


---

## Project Principle

这是一个可复现实验项目。

任何修改必须：

- 可追溯（traceable）
- 可复现（reproducible）
- 最小影响（minimal impact）

不要引入无关依赖。


---

## Before Coding

修改代码前：

先说明：

1. 为什么改
2. 改哪些文件
3. 为什么这样改

不要直接开始修改。


---

## Output Style

优先：

① 结论

② 原因

③ 修改方案

④ 命令

不要长篇英文解释。


---

## When Searching

优先：

- 阅读已有代码
- 阅读已有文档
- 阅读已有配置

不要猜测实现。


---

## When Editing

一次修改尽量保持：

一个目标

一个逻辑

一个 commit


---

## Safety

未经确认：

不要：

- 删除文件
- 大规模重构
- 修改实验配置
- 修改 benchmark
- 修改已有结果

涉及实验结果时必须提醒用户。


---

## Research

如果涉及论文或实验：

必须区分：

- 已验证事实
- 推测
- 建议

不要把推测写成事实。


---

## Benchmark

如果修改 Benchmark：

必须保证：

Baseline 可以重新运行。

不要破坏已有实验。


---

## WebArena

修改 WebArena 相关内容时：

不要：

- 修改 Ground Truth
- 修改 Benchmark 数据
- 修改评测规则

只修改 Agent 或生成逻辑。


---

## ArtifactTrace

优先保持：

- 单一事实来源（Single Source of Truth）
- Canonical Input
- Deterministic Generation
- Minimal File Set

避免重复生成 IR、Manifest、Provenance、Report。


---

## Communication

如果存在多个方案：

请先比较：

- 优点
- 缺点
- 风险

然后再推荐方案。

不要直接决定。

## Before Any File Modification

在修改任何文件之前：

先输出：

### Plan

说明：

- 为什么修改
- 修改哪些文件
- 是否新增文件
- 是否影响实验

等待用户确认后再执行。

除非用户明确要求直接修改。

## Experiment Discipline

所有实验必须遵循：

- 不修改 Baseline
- 不覆盖历史结果
- 不破坏可复现性
- 不改变已冻结输入
- 不引入随机行为

如需改变实验流程，先说明原因和影响范围。