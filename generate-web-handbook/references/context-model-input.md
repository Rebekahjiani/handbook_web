# Context Model 输入

`--context-model` 接受 Context Model 工作目录或单个 JSON 文件。

工作目录采用以下正式结构；缺少的部分可以省略：

```text
business-core/
  object-model.json
  business-context.json
  capabilities/*.json
platform-core/
  bindings/*.json
```

生成器只读取结构化正式产物，不扫描 `platform-core/dev/` 原始 Trace，也不读取
benchmark 的答案或 evaluator 数据。支持的字段为：

- `objects`：业务对象和字段
- `contexts`：能力成立所需上下文
- capability：`id`、`object_ids`、`inputs`、`outputs`、
  `requires_context_ids`
- `surfaces`：URL 模式、必备 locator 和字段
- `actions`：动作标识和目标 locator
- `locators`：selector、作用域和验证状态

生成时按工作流关键词筛选这些事实。解释文字使用中文模板，模型中的稳定标识和
字段名保留原文；未经验证的 locator 不进入工作流。

使用原则：

1. 简单、无状态的网站直接从任务集与 DOM 生成，不必先建 Context Model。
2. 涉及登录态、分页、跨页面对象身份、聚合计算或写操作时，优先从成功 Trace
   审核并建立小型 Context Model。
3. Context Model 负责“业务上选什么、平台上何时算成功”；页面快照负责“当前
   控件在哪里”。两者不能互相替代。
