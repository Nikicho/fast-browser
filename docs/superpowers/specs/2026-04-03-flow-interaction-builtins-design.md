# Flow 交互 Builtins 设计

## 背景

当前 `flow save --from-trace` 在多 tab、多页面目标里会丢失关键语义。

真实问题：
- 知乎“热榜 -> 问题详情”被保存成两个 `zhihu/hot`
- bilibili“热门 -> 视频详情”被保存成“热门 + 再打开热门页”

根因不是单纯 trace 少了几步，而是当前 `flow` DSL 只支持：
- `site`
- `open`
- `wait`
- `waitForSelector`

这导致：
- `tab` 生命周期进不了 flow
- 表单输入、按钮点击、提交动作也进不了 flow
- `trace -> flow` 只能机械保留少量步骤，无法保住真实测试语义

## 目标

把 `flow` 从“页面编排”扩成“轻量测试 / 自动化 DSL”，但保持边界清晰，不退化成录制脚本。

第一版目标：
- 支持多 tab 的核心语义
- 支持高频交互步骤
- 支持从 `trace current --json` 自动生成更接近真实目标的 flow
- 无法稳定生成时明确拒绝，不再产出语义错误的 flow

## 设计原则

1. `flow` 默认作用于当前活动 tab
2. 只有 tab 生命周期变化时，才显式写 tab 步骤
3. 不固化运行时瞬时标识
4. 探索性命令不进入正式 flow
5. 自动 draft 宁可拒绝，也不要生成错误语义

## DSL 扩展

第一版新增 builtin：
- `tabNew`
- `tabSwitch`
- `click`
- `fill`
- `press`

### tabNew

```json
{
  "type": "builtin",
  "command": "tabNew",
  "with": {
    "url": "https://www.zhihu.com/question/19581624"
  }
}
```

语义：
- 创建新 tab
- 如果给 `url`，直接在新 tab 打开
- 新 tab 自动成为当前 tab

### tabSwitch

第一版不固化真实 tabId，只支持相对目标：
- `previous`
- `lastCreated`

```json
{
  "type": "builtin",
  "command": "tabSwitch",
  "with": {
    "target": "previous"
  }
}
```

### click

```json
{
  "type": "builtin",
  "command": "click",
  "with": {
    "target": {
      "selector": "button.search-btn",
      "text": "搜索"
    }
  }
}
```

### fill

```json
{
  "type": "builtin",
  "command": "fill",
  "with": {
    "target": {
      "selector": "input[type='search']",
      "placeholder": "请输入关键词"
    },
    "value": "酒馆AI"
  }
}
```

### press

单键：

```json
{
  "type": "builtin",
  "command": "press",
  "with": {
    "key": "Enter"
  }
}
```

双键：

```json
{
  "type": "builtin",
  "command": "press",
  "with": {
    "keys": ["Control", "C"]
  }
}
```

规则：
- `key` 和 `keys` 二选一
- `keys` 长度最多 2

## Target 设计

交互步骤统一使用轻量 target bundle，而不是只存一个 selector：

```json
{
  "target": {
    "selector": "button.search-btn",
    "text": "搜索",
    "placeholder": "请输入关键词"
  }
}
```

第一版允许字段：
- `selector`
- `text`
- `placeholder`
- `role`
- `ariaLabel`

不允许：
- `@eN`
- 运行时 tabId
- 任意一次性 xpath

## Trace -> Flow Draft 规则

允许进入 draft 的步骤：
- `site`
- `open`
- `wait`
- `waitForSelector`
- `tabNew`
- `tabSwitch`
- `click`
- `fill`
- `press`

明确不进入：
- `snapshot`
- `eval`
- `console`
- `network`
- `hover`
- `scroll`

### 转换规则

#### tab
- 不保留运行时 tabId
- `tabNew(url)` 可直接保留 URL
- `tabSwitch(realTabId)` 转成：
  - `lastCreated`
  - 或 `previous`

#### click / fill / press
- 必须先解析成稳定 target
- 若 trace 中只有 snapshot ref、没有可稳定 target，则拒绝自动生成 draft

## 拒绝生成的条件

以下情况直接拒绝 `flow save --from-trace`：
- 关键交互步骤无法解析成稳定 target
- 多 tab 关系无法转换成 `previous / lastCreated`
- trace 中没有任何可稳定复用的正式步骤

错误提示要明确说明：
- 哪一步不能稳定化
- 建议用户改为手工整理 flow

## 对 Case 的影响

`case` 仍然建立在 `flow` 之上，不直接承载 DOM 行为。

这次设计不扩 `case` DSL，只让 `case save --flow` 复用增强后的 flow。

## 测试范围

需要覆盖：
- flow DSL 类型与 schema
- runtime 对新 builtin 的执行
- `trace -> flow` 在知乎和 bilibili 两个多 tab 场景下的生成结果
- 无法稳定 target 时的拒绝路径
- 组合键 `press` 的合法性校验
