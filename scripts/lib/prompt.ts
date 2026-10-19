import readline from "node:readline";

/**
 * Minimal interactive prompter for CLI commands. Hidden questions don't echo input
 * on a TTY. When stdin is not a TTY (e.g. piped from a secret manager), lines are
 * read in order, so commands can also be automated without exposing passwords in
 * process arguments.
 */
export class Prompter {
  private muted = false;
  private readonly rl: readline.Interface;
  private readonly lines: string[] = [];
  private readonly waiters: ((line: string | undefined) => void)[] = [];
  private closed = false;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: process.stdin.isTTY === true,
    });
    // Suppress echo while a hidden question is active.
    const rlWithOutput = this.rl as unknown as { _writeToOutput: (s: string) => void };
    const write = rlWithOutput._writeToOutput.bind(this.rl);
    rlWithOutput._writeToOutput = (s: string) => {
      if (!this.muted) write(s);
    };
    this.rl.on("line", (line) => {
      const waiter = this.waiters.shift();
      if (waiter) waiter(line);
      else this.lines.push(line);
    });
    this.rl.on("close", () => {
      this.closed = true;
      for (const waiter of this.waiters.splice(0)) waiter(undefined);
    });
  }

  private nextLine(): Promise<string> {
    const buffered = this.lines.shift();
    if (buffered !== undefined) return Promise.resolve(buffered);
    if (this.closed) return Promise.reject(new Error("Input ended before all questions were answered."));
    return new Promise((resolve, reject) => {
      this.waiters.push((line) => (line === undefined ? reject(new Error("Input ended.")) : resolve(line)));
    });
  }

  async ask(question: string): Promise<string> {
    process.stdout.write(question);
    return (await this.nextLine()).trim();
  }

  async askHidden(question: string): Promise<string> {
    process.stdout.write(question);
    this.muted = true;
    try {
      return await this.nextLine();
    } finally {
      this.muted = false;
      process.stdout.write("\n");
    }
  }

  async confirm(question: string): Promise<boolean> {
    const answer = (await this.ask(`${question} [y/N] `)).toLowerCase();
    return answer === "y" || answer === "yes";
  }

  close(): void {
    this.rl.close();
  }
}

/** Repeats a question until `validate` returns a value (or a non-TTY input runs out). */
export async function askUntilValid<T>(
  askOnce: () => Promise<string>,
  validate: (raw: string) => { ok: true; value: T } | { ok: false; message: string },
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = validate(await askOnce());
    if (result.ok) return result.value;
    console.error(`  ${result.message}`);
    if (!process.stdin.isTTY) break;
  }
  throw new Error("Too many invalid answers.");
}
