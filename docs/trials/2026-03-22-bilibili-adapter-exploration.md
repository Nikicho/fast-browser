# Bilibili Fast-Browser Adapter 探索总结

## Adapter 存放位置

**正确位置**：`D:\AIWorks\skills\fast-browser\adapters\bilibili\`

**说明**：
- Fast-Browser 适配器应存放在 `adapters/` 目录下
- 不应放在 skill 的安装目录（如 `C:\Users\Hebe1\.config\opencode\skills\fast-browser-agent\`）
- 需确认 CLI 执行时的工作目录是否能访问到 `D:\AIWorks\skills\fast-browser\adapters\`

## 探索过程中发现的问题

### 1. 搜索框交互问题

**问题**：在首页使用 `fill` + `press Enter` 提交搜索后，页面未发生跳转。

**尝试的操作**：
```bash
fast-browser fill @e9 "原神"
fast-browser press Enter
```

**结果**：URL 保持不变，搜索建议下拉框出现但未执行搜索

**替代方案**：直接通过 URL 打开搜索结果页
```bash
fast-browser open https://search.bilibili.com/all?keyword=%E5%8E%9F%E7%A5%9E
```

### 2. 选择器（Selector）不稳定问题

**问题**：`snapshot -i` 返回的 `div:nth-of-type(n)` 形式选择器极易失效。

**原因**：
- B站页面结构复杂，DOM 层级深
- nth-of-type 选择器依赖于 DOM 兄弟节点顺序，动态内容加载后顺序可能变化
- 页面刷新或内容变化后，之前有效的选择器会失效

**示例**：
```bash
# 点击搜索建议
fast-browser click @e10  
# 失败：Waiting for selector `div:nth-of-type(x) > div:nth-of-type(y)...` failed

# 改用 eval 获取 URL
fast-browser eval "document.querySelector('.video-list .video-item a')?.href"
# 成功：返回实际 URL
```

**建议**：
- 优先使用语义化选择器（class、id、data-* 属性）
- 使用 `eval` 获取元素的实际 href 属性
- 避免依赖 `nth-of-type` 选择器

### 3. 选择器 ref 过期问题

**问题**：通过 `snapshot -i` 获取的 `@eXX` 引用在一段时间后或页面变化后失效。

**建议**：
- 获取 snapshot 后立即使用 ref
- 页面变化后需要重新 `snapshot -i` 获取新的 ref
- 复杂交互场景下优先使用 JavaScript 获取元素

### 4. 动态内容加载等待问题

**问题**：页面内容通过 JavaScript 动态渲染，`wait` 固定时间可能不够稳定。

**建议**：
```bash
fast-browser waitForSelector <selector> --state visible
```

### 5. 搜索建议框交互问题

**问题**：输入关键词后出现的搜索建议下拉框，点击后未触发搜索。

**观察**：
- 输入 "原神" 后出现多个建议词
- 点击第一个建议 "原神新手攻略从零开始"
- 页面跳转到首页的登录/大会员区域，未进入搜索结果

**替代方案**：直接通过 URL 参数访问搜索结果

## 创建的 Adapter 结构

```
D:\AIWorks\skills\fast-browser\adapters\bilibili\
├── manifest.json                    # 适配器清单
├── commands\
│   ├── search.ts                   # 搜索命令
│   ├── openVideo.ts                # 打开视频命令
│   └── openUser.ts                 # 打开UP主命令
├── flows\
│   ├── search_and_open_first_result.flow.json
│   └── open_video_and_get_upinfo.flow.json
└── cases\
    ├── search_video_returns_results.case.json
    └── video_page_has_play_and_upinfo.case.json
```

## 已验证的命令流程

### 搜索视频
```bash
fast-browser open https://search.bilibili.com/all?keyword=原神
```

### 获取视频 BV 号并打开
```bash
# 通过 eval 获取视频链接
fast-browser eval "document.querySelector('.video-list a')?.href"
# 返回: https://www.bilibili.com/video/BV1GcPvz5ESM/

# 打开视频页
fast-browser open https://www.bilibili.com/video/BV1GcPvz5ESM/
```

### 获取 UP 主信息
```bash
# 从视频页获取 UP 主空间链接
fast-browser eval "document.querySelector('a[href*=\"space.bilibili.com\"]')?.href"
# 返回: https://space.bilibili.com/401742377/

# 打开 UP 主主页
fast-browser open https://space.bilibili.com/401742377/
```

## Trace Markers

探索过程中使用的 trace markers：

| Marker | Type | 说明 |
|--------|------|------|
| `explore_bilibili_homepage` | goal_start | 开始探索B站首页 |
| `homepage_snapshot_done` | checkpoint | 首页快照完成 |
| `search_results_loaded` | checkpoint | 搜索结果页加载完成 |
| `video_page_loaded` | checkpoint | 视频详情页加载完成 |
| `explore_bilibili_complete` | goal_success | 探索完成 |

## 后续建议

1. **Adapter 注册**：确认 `D:\AIWorks\skills\fast-browser\adapters\` 是否在 Fast-Browser CLI 的加载路径中
2. **Command 实现**：基于探索发现的问题，重新实现 Command 时应：
   - 使用 URL 直接导航而非模拟输入
   - 使用 eval 获取动态元素而非依赖不稳定的选择器
3. **Flow 优化**：考虑在 Flow 中使用 `waitForSelector` 替代固定 `wait`
