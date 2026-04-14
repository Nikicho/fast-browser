export function runSmokeTestCommand(platform: string, commandName: string): string {
  return `fast-browser site ${platform}/${commandName}`;
}
