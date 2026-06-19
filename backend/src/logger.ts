const COLORS = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  reset: "\x1b[0m",
} as const;

function format(color: keyof typeof COLORS, tag: string, message: string) {
  return `${COLORS[color]}[${tag}]${COLORS.reset} ${message}`;
}

export const logger = {
  info: (tag: string, message: string, ...args: unknown[]) =>
    console.log(format("green", tag, message), ...args),
  warn: (tag: string, message: string, ...args: unknown[]) =>
    console.warn(format("yellow", tag, message), ...args),
  error: (tag: string, message: string, ...args: unknown[]) =>
    console.error(format("red", tag, message), ...args),
  debug: (tag: string, message: string, ...args: unknown[]) =>
    console.log(format("magenta", tag, message), ...args),
};
