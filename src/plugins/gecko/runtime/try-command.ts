/** Source of the regular expression the Push decision's text must match; the full check is `tryCommandProblem`. */
export const TRY_TEXT_PATTERN = "^\\./mach try \\S";

const OPERATORS = new Set([";", "&", "|", "<", ">", "$", "`", "(", ")", "\n"]);

/** Splits a command into argv the way sh would for plain words, quotes and backslashes. Spatial runs try commands without a shell, so unquoted shell operators are refused instead of being passed on literally. */
export function splitCommand(command: string): string[] {
  const words: string[] = [];
  let word: string | null = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!;
    if (c === " " || c === "\t") { if (word !== null) words.push(word); word = null; continue; }
    if (OPERATORS.has(c)) throw new Error(`Shell operator ${JSON.stringify(c)} is not allowed; spatial runs the command without a shell`);
    word ??= "";
    if (c === "\\") { word += command[++i] ?? ""; continue; }
    if (c === "'") {
      const end = command.indexOf("'", i + 1);
      if (end < 0) throw new Error("Unclosed ' in the command");
      word += command.slice(i + 1, end);
      i = end;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      for (; j < command.length && command[j] !== '"'; j++) {
        if (command[j] === "\\" && '"\\$`'.includes(command[j + 1] ?? "")) j++;
        word += command[j];
      }
      if (j >= command.length) throw new Error('Unclosed " in the command');
      i = j;
      continue;
    }
    word += c;
  }
  if (word !== null) words.push(word);
  return words;
}

const FORMS = "Spatial runs `./mach try fuzzy --query …`, `./mach try --preset …`, `./mach try auto` and `./mach try again`";
const hasOption = (args: string[], ...names: string[]) => args.some((arg) => names.some((name) => arg === name || arg.startsWith(`${name}=`)));

/** Null when spatial can run `command` unattended, else why not. Fuzzy without a query or preset would open an interactive selector. */
export function tryCommandProblem(command: string): string | null {
  let argv: string[];
  try { argv = splitCommand(command); } catch (e) { return (e as Error).message; }
  if (argv[0] !== "./mach" || argv[1] !== "try") return "A try command starts with `./mach try`";
  const [selector, ...rest] = argv.slice(2);
  if (hasOption(rest, "-i", "--interactive")) return "`-i`/`--interactive` opens an interactive selector";
  if (selector === "auto" || selector === "again") return null;
  if (selector === "--preset" || selector?.startsWith("--preset=")) return null;
  if (selector === "fuzzy") return hasOption(rest, "-q", "--query", "--preset") ? null : "`./mach try fuzzy` needs --query or --preset; without them it opens an interactive selector";
  return FORMS;
}

const LINK = /https:\/\/treeherder\.mozilla\.org\/\S*jobs\?\S*?(?:revision=[0-9a-f]{12,40}|landoCommitID=\d+)\S*/g;

/** The last Treeherder push link in `mach try` output; `treeherder-cli` accepts it as is. */
export function treeherderUrl(output: string): string | null {
  return [...output.matchAll(LINK)].at(-1)?.[0] ?? null;
}
