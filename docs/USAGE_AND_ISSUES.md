# GitHub Adapter 使用记录

> 更新日期：2026-03-24

---

## 一、原始状态

原始 github adapter 只有 `search` 一个 command。

```json
{
  "id": "github",
  "commands": ["search"]
}
```

---

## 二、扩展内容

### 新增 Commands

| Command | 参数 | 说明 |
|---------|------|------|
| `search` | `--query` | 搜索仓库（原有） |
| `search-issues` | `--query`, `--type` | 搜索 Issues/PRs |
| `search-users` | `--query` | 搜索用户 |
| `repo` | `--owner`, `--repo` | 获取仓库详情 |
| `user` | `--username` | 获取用户资料 |
| `trending` | `--language` | 获取趋势仓库（近7天） |

### 实现方式

- 所有 API 调用统一使用 `fetchJson<T>()` 封装
- `trending` 日期硬编码为近 7 天（`created:>2026-03-16`）
- 所有 API 响应字段映射到统一输出格式
- 支持 `--no-cache` 禁用缓存

---

## 三、测试结果

### trending

```bash
fast-browser site github/trending --language typescript
```

```
language: typescript
dateRange: last 7 days
total: 20
耗时: ~2.5s
```

### user

```bash
fast-browser site github/user --username torvalds
```

```
login: torvalds
followers: 292258
publicRepos: 11
耗时: ~700ms
```

### repo

```bash
fast-browser site github/repo --owner torvalds --repo linux
```

```
fullName: torvalds/linux
stars: 224703
forks: 61146
openIssues: 3
language: C
耗时: ~700ms
```

### search-issues

```bash
fast-browser site github/search-issues --query "fast-browser" --type issue
```

```
type: issue
total: 20
耗时: ~1.5s
```

### search-users

```bash
fast-browser site github/search-users --query "ai developer"
```

```
total: 20
耗时: ~950ms
```

---

## 四、已知问题

| 问题 | 说明 |
|------|------|
| `trending` 日期硬编码 | 不支持自定义日期范围（如"过去30天"），日期写死在代码里 |

---

## 五、文件修改

- `src/adapters/github/index.ts` — 从 77 行扩展到 ~260 行，新增 5 个 command 实现
