import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { loadRepoContext, readRepoSkill } from "../../src/runtime/repo-context.ts";

function tempRepo(t: { after(callback: () => void): void }): string {
  const root = mkdtempSync(join(tmpdir(), "spatial-repo-context-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(root: string, path: string, content: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

test("loadRepoContext: no .mcp.json gives an empty server map", (t) => {
  const root = tempRepo(t);
  assert.deepEqual(loadRepoContext(root).mcpServers, {});
});

test("loadRepoContext: parses an http server", (t) => {
  const root = tempRepo(t);
  write(root, ".mcp.json", JSON.stringify({ mcpServers: { moz: { type: "http", url: "https://example.test/mcp" } } }));
  assert.deepEqual(loadRepoContext(root).mcpServers, {
    moz: { type: "http", url: "https://example.test/mcp" },
  });
});

test("loadRepoContext: parses an explicitly typed stdio server", (t) => {
  const root = tempRepo(t);
  write(root, ".mcp.json", JSON.stringify({ mcpServers: { local: { type: "stdio", command: "node", args: ["server.js"] } } }));
  assert.deepEqual(loadRepoContext(root).mcpServers, {
    local: { type: "stdio", command: "node", args: ["server.js"] },
  });
});

test("loadRepoContext: parses legacy stdio specs without a type as stdio", (t) => {
  const root = tempRepo(t);
  write(root, ".mcp.json", JSON.stringify({ mcpServers: { local: { command: "node", args: ["server.js"] } } }));
  assert.deepEqual(loadRepoContext(root).mcpServers, {
    local: { type: "stdio", command: "node", args: ["server.js"] },
  });
});

test("loadRepoContext: denied servers are only requestable", (t) => {
  const root = tempRepo(t);
  write(root, ".mcp.json", JSON.stringify({ mcpServers: {
    "denied-server": { type: "stdio", command: "node", args: [] },
    allowed: { type: "stdio", command: "node", args: [] },
  } }));
  assert.deepEqual(loadRepoContext(root, ["denied-server"]).mcpServers, {
    allowed: { type: "stdio", command: "node", args: [] },
  });
  assert.deepEqual(loadRepoContext(root, ["denied-server"]).requestableMcpServers, {
    "denied-server": { type: "stdio", command: "node", args: [] },
  });
});

test("loadRepoContext: malformed MCP server specs throw", (t) => {
  const root = tempRepo(t);
  write(root, ".mcp.json", JSON.stringify({ mcpServers: { broken: { type: "stdio", command: "node" } } }));
  assert.throws(() => loadRepoContext(root), /Malformed MCP server spec for "broken"/);
});

test("loadRepoContext: expands stdio vars and defaults", (t) => {
  const root = tempRepo(t);
  const previous = process.env.SET_VAR;
  process.env.SET_VAR = "configured-value";
  t.after(() => {
    if (previous === undefined) delete process.env.SET_VAR;
    else process.env.SET_VAR = previous;
  });
  write(root, ".mcp.json", JSON.stringify({ mcpServers: {
    local: {
      type: "stdio",
      command: "${SET_VAR:-x}",
      args: ["${UNSET:-python3}", "${UNSET}"],
    },
    "denied-server": {
      type: "stdio",
      command: "${SET_VAR}",
      args: ["${UNSET:-devtools.js}"],
    },
  } }));
  assert.deepEqual(loadRepoContext(root).mcpServers.local, {
    type: "stdio",
    command: "configured-value",
    args: ["python3", ""],
  });
  assert.deepEqual(loadRepoContext(root, ["denied-server"]).requestableMcpServers["denied-server"], {
    type: "stdio",
    command: "configured-value",
    args: ["devtools.js"],
  });
});

test("loadSkills: ignores allowed-tools lists while reading name and description", (t) => {
  const root = tempRepo(t);
  write(root, ".agents/skills/review/SKILL.md", `---
name: review
description: Review a change.
allowed-tools:
  - Read
  - Grep
---
Instructions.
`);
  assert.deepEqual(loadRepoContext(root).skills, [{ name: "review", description: "Review a change." }]);
});

test("loadSkills: no .agents/skills gives an empty list", (t) => {
  const root = tempRepo(t);
  assert.deepEqual(loadRepoContext(root).skills, []);
});

test("loadSkills: reads valid skill frontmatter from two skill directories", (t) => {
  const root = tempRepo(t);
  write(root, ".agents/skills/first/SKILL.md", `---
name: first-skill
description: First   skill description.
---
`);
  write(root, ".agents/skills/second/SKILL.md", `---
name: second-skill
description: Second skill.
---
`);
  const skills = loadRepoContext(root).skills;
  assert.equal(skills.length, 2);
  assert.deepEqual(new Set(skills.map((skill) => skill.name)), new Set(["first-skill", "second-skill"]));
  assert.equal(skills.find((skill) => skill.name === "first-skill")?.description, "First skill description.");
});

test("loadSkills: SKILL.md without frontmatter throws", (t) => {
  const root = tempRepo(t);
  write(root, ".agents/skills/broken/SKILL.md", "No metadata here.\n");
  assert.throws(() => loadRepoContext(root), /No YAML frontmatter/);
});

test("loadSkills: collapses a multiline block description", (t) => {
  const root = tempRepo(t);
  write(root, ".agents/skills/review/SKILL.md", `---
name: accessibility-frontend-review
description: >
  Performs an accessibility code review
  of a local diff or Phabricator revision.
---
`);
  assert.deepEqual(loadRepoContext(root).skills, [{
    name: "accessibility-frontend-review",
    description: "Performs an accessibility code review of a local diff or Phabricator revision.",
  }]);
});

test("loadInstructions: returns AGENTS.md content", (t) => {
  const root = tempRepo(t);
  write(root, "AGENTS.md", "  Follow the repo rules.  \n");
  assert.equal(loadRepoContext(root).instructions, "Follow the repo rules.");
});

test("loadInstructions: uses CLAUDE.md when AGENTS.md is absent", (t) => {
  const root = tempRepo(t);
  write(root, "CLAUDE.md", "Claude-specific instructions.\n");
  assert.equal(loadRepoContext(root).instructions, "Claude-specific instructions.");
});

test("loadInstructions: resolves a single-line @file include from CLAUDE.md", (t) => {
  const root = tempRepo(t);
  write(root, "included-rules.md", "Included agent rules.\n");
  write(root, "CLAUDE.md", "@included-rules.md\n");
  assert.equal(loadRepoContext(root).instructions, "Included agent rules.");
});

test("loadInstructions: missing include target throws", (t) => {
  const root = tempRepo(t);
  write(root, "CLAUDE.md", "@missing.md\n");
  assert.throws(() => loadRepoContext(root), /includes @missing\.md/);
});

test("loadInstructions: neither instructions file gives null", (t) => {
  const root = tempRepo(t);
  assert.equal(loadRepoContext(root).instructions, null);
});

test("loadInstructions: an include outside the repository throws", (t) => {
  const root = tempRepo(t);
  const outside = tempRepo(t);
  write(outside, "secret.md", "secret\n");
  write(root, "CLAUDE.md", `@${join("..", outside.split("/").pop()!, "secret.md")}\n`);
  assert.throws(() => loadRepoContext(root), /outside the repository/);
});

test("loadInstructions: an include that is a symlink out of the repository throws", (t) => {
  const root = tempRepo(t);
  const outside = tempRepo(t);
  write(outside, "secret.md", "secret\n");
  symlinkSync(join(outside, "secret.md"), join(root, "link.md"));
  write(root, "CLAUDE.md", "@link.md\n");
  assert.throws(() => loadRepoContext(root), /outside the repository/);
});

test("loadInstructions: an include that is a symlink within the repository is read", (t) => {
  const root = tempRepo(t);
  write(root, "rules.md", "Rules.\n");
  symlinkSync(join(root, "rules.md"), join(root, "link.md"));
  write(root, "CLAUDE.md", "@link.md\n");
  assert.equal(loadRepoContext(root).instructions, "Rules.");
});

test("skills: a SKILL.md symlinked out of the repository is not read", (t) => {
  const root = tempRepo(t);
  const outside = tempRepo(t);
  write(outside, "SKILL.md", "---\nname: evil\ndescription: Outside.\n---\nbody\n");
  mkdirSync(join(root, ".agents", "skills", "evil"), { recursive: true });
  symlinkSync(join(outside, "SKILL.md"), join(root, ".agents", "skills", "evil", "SKILL.md"));
  assert.throws(() => loadRepoContext(root), /outside the repository/);
  assert.throws(() => readRepoSkill(root, "evil"), /outside the repository/);
});
