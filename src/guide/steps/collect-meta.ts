import inquirer from "inquirer";

import type { GuideAnswers } from "../../shared/types";

export async function collectMeta(initial: Partial<GuideAnswers> = {}): Promise<GuideAnswers> {
  const answers = await inquirer.prompt<GuideAnswers>([
    {
      type: "input",
      name: "platform",
      message: "平台标识",
      default: initial.platform ?? ""
    },
    {
      type: "input",
      name: "url",
      message: "站点 URL",
      default: initial.url ?? `https://www.${initial.platform ?? "example"}.com`
    },
    {
      type: "input",
      name: "capability",
      message: "你要实现的能力",
      default: initial.capability ?? ""
    },
    {
      type: "confirm",
      name: "requiresLogin",
      message: "该能力是否需要登录态?",
      default: initial.requiresLogin ?? false
    },
    {
      type: "list",
      name: "strategy",
      message: "优先尝试哪种方式?",
      choices: ["auto", "network", "dom"],
      default: initial.strategy ?? "auto"
    },
    {
      type: "input",
      name: "commandName",
      message: "命令名",
      default: initial.commandName ?? "search"
    },
    {
      type: "confirm",
      name: "cacheable",
      message: "是否缓存结果?",
      default: initial.cacheable ?? true
    },
    {
      type: "number",
      name: "ttlSeconds",
      message: "TTL 秒数",
      default: initial.ttlSeconds ?? 300
    },
    {
      type: "confirm",
      name: "runTest",
      message: "是否立即运行测试?",
      default: initial.runTest ?? false
    }
  ]);

  return answers;
}
