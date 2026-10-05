import type { DiffFile, Hunk } from "../shared/types.ts";
import { numberLines } from "./diff-lines.ts";

const SIGN = { ctx: " ", add: "+", del: "-" } as const;

/** Read-only hunk. `nodrag nopan` lets users select text instead of moving the canvas. */
export function DiffView({ file, hunk }: { file: DiffFile; hunk: Hunk }) {
  return (
    <div className="diff nodrag nopan" data-testid={`hunk-${hunk.id}`}>
      <div className="diff-head">
        {file.path} <span className="hunk-header">{hunk.header}</span>
      </div>
      <table>
        <tbody>
          {numberLines(hunk).map((l, i) => (
            <tr key={i} className={l.kind}>
              <td className="ln">{l.old ?? ""}</td>
              <td className="ln">{l.new ?? ""}</td>
              <td className="sign">{SIGN[l.kind]}</td>
              <td className="code">{l.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
