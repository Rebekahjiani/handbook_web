# WebArena Shopping storefront Context Model scope

## 目标

基于现有、可追溯的 ContextModelTracer profile，构建并冻结一版 WebArena Shopping storefront Context Model，作为后续 Skill 提炼的稳定输入。

## 范围

- 系统：WebArena-Verified Shopping storefront
- 入口：`http://localhost:7770`
- 包含：目录浏览、搜索、商品信息、账户注册与认证、购物车、结算、下单、订单历史
- 排除：Shopping Admin、Reddit、跨站发布、Skill 生成、Skill 注入实验
- 登录策略：允许使用专用采集账号验证账户态；正式模型不保存账号或凭据

## Evidence 入口

主要证据位于：

```text
platform-core/dev/26_08_21_15_00_47-js/
platform-core/dev/26_08_21_16_27_00-js/
platform-core/dev/26_08_21_16_51_26-js/
platform-core/dev/26_08_21_16_59_39-js/
```

每轮包含 driver report、步骤记录、网络记录、响应体、Chrome trace 和 pre/post capture。正式模型只引用 `platform-core/reviewed/` 中经过复核的 evidence。

ArtifactTrace baselineA 的 agent trace 仅用于识别任务覆盖和失败模式，不直接作为网站业务事实来源。

## 建模边界

- Platform Core 描述 storefront 可观察状态、动作与状态迁移。
- Business Core 描述商品、账户、购物车、结算和订单等稳定业务语义。
- 不把 DOM、selector、脚本实现或一次性数据写入 Business Core。
- 不吸收 Benchmark task ID、具体答案、一次性商品值或订单号。
- Evidence 不足的能力必须标记为 unsupported 或保留未知条件。

## Baseline 关系

- `baselineA-Mac-historical-v1` 是已冻结历史参考。
- `baselineA-server-estimated-v0` 是规划用估算快照，不是最终全服务器基线。
- Context Model 构建不会修改上述结果。

## 待确认项

- 空搜索、404、空购物车和筛选无结果尚无独立定向 profile。
- 多页目录聚合已有分页观察，但缺少完整跨页聚合的受控 profile。
- 这些缺口不阻止首版冻结；相关能力只声明已被现有 evidence 支持的范围。
