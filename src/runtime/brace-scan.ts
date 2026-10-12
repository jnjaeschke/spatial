/** A function found by brace scan: `line` names it (1-based), `end` holds its closing brace; `symbol` is the qualified name before its parameter list, `signature` the trimmed text of `line`. */
export interface ScannedFunction { symbol: string; signature: string; line: number; end: number }

const CONTROL = new Set(["if", "for", "while", "switch", "catch", "do", "else", "try", "return", "sizeof", "decltype", "alignof", "static_assert", "noexcept", "case", "default"]);

/** The source with comments, string and character literals and preprocessor lines blanked; newlines kept, so offsets map to the same lines. */
function codeOnly(lines: string[]): string {
  const text = lines.map((line) => /^\s*#/.test(line) ? "" : line).join("\n");
  let out = "";
  let i = 0;
  const blank = (c: string) => c === "\n" ? "\n" : " ";
  while (i < text.length) {
    const c = text[i]!, next = text[i + 1];
    if (c === "/" && next === "/") { while (i < text.length && text[i] !== "\n") { out += " "; i++; } continue; }
    if (c === "/" && next === "*") { const close = text.indexOf("*/", i + 2); const stop = close < 0 ? text.length : close + 2; for (; i < stop; i++) out += blank(text[i]!); continue; }
    if (c === '"' || c === "'") {
      out += " "; i++;
      while (i < text.length && text[i] !== c && text[i] !== "\n") { if (text[i] === "\\" && i + 1 < text.length) { out += " "; i++; } out += blank(text[i]!); i++; }
      if (text[i] === c) { out += " "; i++; }
      continue;
    }
    out += c; i++;
  }
  return out;
}

/**
 * The function definitions of C-like source: every `{` whose preceding text (since the last `;`, `{` or `}`) names something followed by
 * `(`, except control statements, lambdas, and namespace, class, struct, union, enum and initializer braces. A heuristic: raw strings and
 * macros that unbalance braces are not handled.
 */
export function functionsIn(lines: string[]): ScannedFunction[] {
  const code = codeOnly(lines);
  const starts = [0];
  for (let i = 0; i < code.length; i++) if (code[i] === "\n") starts.push(i + 1);
  const lineOf = (offset: number) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid]! <= offset) lo = mid; else hi = mid - 1; } return lo; };
  const out: ScannedFunction[] = [];
  const consider = (open: number, close: number) => {
    let start = open - 1;
    while (start >= 0 && !";{}".includes(code[start]!)) start--;
    const head = code.slice(start + 1, open);
    if (!head.trim() || /\b(namespace|class|struct|union|enum)\b/.test(head) || /=\s*$/.test(head) || /^\s*extern\b/.test(head) || /\]\s*(\(|$|mutable|->)/.test(head)) return;
    const first = /^\s*(?:else\s+)?([A-Za-z_]\w*)/.exec(head)?.[1];
    if (first && CONTROL.has(first)) return;
    const name = /([A-Za-z_~][\w:~]*)\s*\(/.exec(head);
    if (!name || CONTROL.has(name[1]!)) return;
    const at = lineOf(start + 1 + name.index);
    out.push({ symbol: name[1]!, signature: lines[at]!.trim(), line: at + 1, end: lineOf(close) + 1 });
  };
  const stack: number[] = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === "{") stack.push(i);
    else if (code[i] === "}" && stack.length) consider(stack.pop()!, i);
  }
  for (const open of stack) consider(open, code.length - 1);
  return out;
}

/** The innermost function whose lines (from the one naming it to its closing brace) include `line`; null outside every function body. */
export function enclosingFunction(lines: string[], line: number): ScannedFunction | null {
  return functionsIn(lines).filter((fn) => fn.line <= line && line <= fn.end).sort((a, b) => b.line - a.line || a.end - b.end)[0] ?? null;
}
