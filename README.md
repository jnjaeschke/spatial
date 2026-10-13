# spatial

spatial is a local workbench for working on code with LLM agents. You start work from a repository's start screen or a slash command. A workflow then runs it as recorded steps: reviewing a patch, implementing a bug fix, exploring a web spec, or chatting about the code. Results appear on a zoomable canvas: changes, findings, plans, spec algorithms and conversations, each linked to where it came from.

The runtime, not the LLM, is in charge. It stores every fact and every LLM result as an artifact with provenance. It establishes facts such as diffs, refs, bugs and test results deterministically. It asks you before doing anything consequential, such as approving a plan, accepting a change, pushing to try, or submitting for review.

## Installation

### Requirements

- **Node.js 24 or newer.** spatial runs its TypeScript sources directly; there is no compile step for the server.
- **git.**
- **At least one LLM CLI, installed and logged in.** spatial drives these CLIs and uses their authentication:
  - [Claude Code](https://docs.claude.com/en/docs/claude-code) (`claude`)
  - [Codex](https://github.com/openai/codex) (`codex`)
- **Linux or macOS.** The browser is opened with `xdg-open` or `open`.

Optional tools enable more features. spatial finds them on `PATH`.

| Tool | Used for |
| --- | --- |
| `webspec-index` | Spec exploration, and spec references in reviews |
| `searchfox-cli` | Gecko and WebKit code search for spec implementations |
| `chromium-search` | Blink code search for spec implementations |
| `moz-phab` | Submitting Gecko stacks to Phabricator |
| `treeherder-cli` | Following try pushes |
| `~/.arcrc` with Conduit tokens | Importing, syncing and replying to Phabricator revisions |

### Install

```sh
git clone <this repository> spatial
cd spatial
npm install
npm run build:web
npm link
```

`npm link` puts the `spatial` command on your `PATH`. After pulling new changes, run `npm run build:web` again, then `spatial restart`. A running server notices when it is older than the checkout and tells you so.

### Run

```sh
cd ~/src/some-repo
spatial              # open the start screen for this repository, starting the server if needed
spatial open <path>  # the same, for another repository
spatial stop         # stop the server
spatial restart      # restart the server without opening a browser
spatial models       # list the models each LLM backend offers
spatial run <repo> /review main..feature   # run a workflow from the terminal and print the session overview
```

- **Server:** listens on `http://127.0.0.1:4177`. Change it with `--port`.
- **Data:** `~/.local/share/spatial/runtime.sqlite` (or under `$XDG_DATA_HOME`), with `knowledge.db` and `server.log` next to it. Use `--db` for another location.

### Configuration

All configuration is optional and uses environment variables.

| Variable | Effect |
| --- | --- |
| `SPATIAL_CLAUDE_BIN`, `SPATIAL_CODEX_BIN` | Path of the LLM CLIs |
| `SPATIAL_WEBSPEC_BIN`, `SPATIAL_SEARCHFOX_BIN`, `SPATIAL_CHROMIUM_SEARCH_BIN` | Path of the spec and code search tools |
| `SPATIAL_MOZPHAB`, `SPATIAL_TREEHERDER_CLI` | Path of `moz-phab` and `treeherder-cli` |
| `SPATIAL_ARCRC_PATH` | Where to read Phabricator tokens (default `~/.arcrc`) |

A repository can give agents more context:

- **`AGENTS.md` or `CLAUDE.md`:** instructions placed in every prompt.
- **`.agents/skills/<name>/SKILL.md`:** skills the agent can read on demand.
- **`.mcp.json`:** MCP servers.
  - `http` servers are available to every task.
  - Command-line (`stdio`) servers never start on their own. An agent can ask for one in a chat. You see the exact command and enable it for that chat.

## Workflows

Type a request into a repository's start screen. A selector model picks the workflow and its parameters, or asks you one question first. You can also name the workflow with a slash command.

### Review: `/review [D-number | base..head]`

Reviews a patch without checking it out:
- **Range:** a `base..head` range, or a Phabricator revision (`D123` or its URL). A revision's stack is imported as git objects, so your work tree is not touched.
- **Default:** without arguments, it reviews the uncommitted changes, or else the commits since the branch left main.

What a review produces:
- **Narrative:** the patch is described commit by commit and change by change.
- **Context:** spec sections the patch refers to are resolved and mapped onto the code. In repositories whose profile can reach the bug tracker (Gecko, through the `moz` MCP server), bugs named in commit messages are fetched and summarized.
- **Findings:** each finding is anchored to diff lines, with a severity.
- **On the canvas:** you can ask about any change or selection, draft comments, and add sequence diagrams.
- **New versions:** when a revision gets a new version, the next review round shows the interdiff. Findings carry over, and every earlier finding gets a verdict.
- **Phabricator:** reviewer comments sync into the session, and you can draft and post replies.

### Implement: `/implement <what to fix or build>`

Takes a bug fix or a feature from request to reviewed commits on a new branch in the current checkout:

1. **Investigate.** The agent reads the code. It proposes a plan with steps, locations, open questions and acceptance checks: tests that must fail before the change and pass after it.
2. **Approve.** You approve the plan, ask for a revision, or cancel. You can pick the model that implements it.
3. **Implement.** The agent writes the change as commits in the repository's commit style. If it finds that the plan cannot work, it stops and asks you to re-investigate or continue.
4. **Review.** The review workflow reviews the result. Open high-severity findings get up to two automatic fix rounds. After that you revise, accept or cancel.
5. **After Accept.** The repository's profile decides what happens next. For Gecko: propose and push a try run, then submit the stack to Phabricator with suggested reviewers. Each push or submit asks you first.

More things you can do during implementation:
- **Steer the agent** while it works, from the session chat. Steers can become memories: notes kept per session, per repository or globally, which later investigations and implementations receive.
- **Work in reviewer comments.** Comments that reviewers leave on the submitted revision start a phase where you choose which ones to address.

The write mode decides what the implementing agent may do:

| Mode | What the agent may do |
| --- | --- |
| **Auto** | Edit files and run commands; the CLI's own safety checks decide what needs approval |
| **Full access** | Everything, without approvals or a sandbox |
| **Edits only** | Edit files only; spatial runs the build and the plan's tests |

In Edits only, the build and tests still run the edited code without a sandbox.

### Explore: `/explore <SPEC#anchor | URL | search phrase>`

Opens a web spec algorithm as a box on the canvas, or searches for one and asks which result to open. From there you can:
- follow links to other algorithms;
- summarize steps, with the summary checked against the spec text;
- trace a path through several algorithms;
- find each engine's implementation (Gecko, Blink, WebKit) and compare it with the spec and with the other engines.

Other sessions can open the spec explorer too, for example when a review refers to a spec section.

### Chat: `/chat <message>`

An open conversation about the repository, for anything that is not one of the other workflows. A reply can offer to start another step, such as exploring a spec section or proposing a try push.

### Git view

Not a workflow: the Git view is available on every repository page and in every session. It shows the commit graph with lanes, refs, commit details and diffs.

## Architecture

```
src/
  runtime/   sessions, store, tasks, epochs, LLM backends, git, repo profiles, knowledge
  server/    HTTP API and static UI server
  mcp/       the session MCP server that agents use to read session state
  workflows/ workflow registry, selection and start
  web/       the UI shell: canvas, conversations, session and repo pages
  plugins/   everything users work on: chat, review, implement, spec, scm, gecko
```

Core knows nothing about any particular workflow. Every workflow, artifact type, view and tool belongs to a plugin. Plugins import core only through `src/plugin-api.ts`, `src/web/plugin-api.ts` and `src/web/graph-api.ts`. They import another plugin only through its `api.ts`, and only if they list it in `dependsOn`. `npm run check` enforces this boundary. It also keeps core free of Mozilla-specific names.

### Concepts

- **Session.** The root unit of work: one request in one checkout. It holds everything below.
- **Workflow.** What a user starts. It parses its arguments, may ask one question about the work tree before the session exists, and runs phases. A workflow with `next` is driven by stored state: after each step, `next` looks at the epochs and artifacts and returns the next phase to run, a decision to ask, or nothing.
- **Phase.** One step of a workflow, such as `investigate`, `implement` or `review`. A phase can define its own follow-up, which is how Gecko's try and submit steps work in any workflow.
- **Epoch.** One numbered, stored run of a phase, with its input, status and error. Tasks and artifacts created meanwhile belong to it. A failed or cancelled epoch can be retried in place. One phase runs per session at a time.
- **Task.** A unit of work run by the runtime: usually one LLM call or one deterministic step, such as importing a diff, fetching a bug or running a test. Tasks record their activity and can be cancelled.
- **Artifact.** A stored result with a type, a status and provenance (the task and epoch that made it).
  - **Status:** `verified` for facts and user input, `proposed` for LLM interpretation.
  - **Immutable:** artifacts are never edited. A new version is linked to the old one with `revises`.
  - **Links:** typed links connect artifacts, such as `about` and `reply`.
  - **Kinds:** an artifact kind tells core how to render, search and summarize a plugin's type.
- **Decision.** An artifact holding a question with options: Approve, Push, Submit, Accept and so on. Either you answer it or a rule does, for example an automatic fix round. Answering it lets the workflow continue.
- **Structured LLM output.** Every LLM reply that the runtime acts on is checked against a JSON schema and a domain validator. A failing reply gets a repair prompt. Claims about code, such as cited lines and locations, are verified against git before they are kept.
- **Repo profile.** Says how to work in a kind of repository:
  - commit style (one commit or a stack) and the commit message rule;
  - build and test commands;
  - the steps after Accept;
  - optional hooks for the bug tracker, the upstream branch and prompt notes.

  The session's profile is chosen when it starts. Two profiles exist:
  - `plain-git` works in any repository;
  - `gecko`, from the gecko plugin, handles Firefox's `./mach`, `Bug N - ` messages, try and Phabricator.
- **Knowledge store.** Versioned plugin data that outlives sessions, kept per session, per repository or globally. Implement memories live here. Nothing is ever deleted; a removal is stored as a tombstone.
- **Services.** Capabilities that a plugin builds from the environment, such as spec and code search tools. Tasks and MCP tools reach them through their context.

### Agents and tools

Each LLM call goes through the `claude` or `codex` CLI. Every call names three things:
- **Backend:** the model and effort you picked.
- **Tool access:** none, read-only or write.
- **Write mode:** for write access only (Auto, Full access or Edits only).

Read-only calls can read the repository and run a small set of read-only commands, such as spec and code search. Agents also get the **session MCP server**, a child process reading the session database. Through it they can read session artifacts, run git history and search tools (log, show, blame, search), read repository skills, and use the tools plugins contribute.

### UI

The web UI is React, with a canvas built on React Flow. A web plugin contributes:
- **Phase views:** what a session shows for each phase.
- **Canvas node kinds:** with the graph builders that place them.
- **Session views:** other projections of the same session, such as the spec explorer, the implementations comparison and the Git view.
- **Repository pages and panels:** such as the Git view and the memories panel.

Views are projections of the stored artifacts and never the source of truth. The server streams session events to the UI over server-sent events.

### Security model

- **Local only:** the server binds to `127.0.0.1`. It rejects foreign `Host` headers and cross-site requests. Pages carry a strict content security policy and cannot be framed.
- **Untrusted inputs:** patches, bugs, specs and repository files can contain instructions aimed at the LLM.
  - Read-only agents cannot write or run arbitrary commands.
  - Consequential actions wait for your decision.
  - A repository's command-line MCP servers run only after you approve their exact command.
- **Write modes are not sandboxes:** builds and tests run the code the agent wrote.

## Development

```sh
npm run check     # typecheck, unit tests, generated-docs check, plugin boundary check
npm run e2e       # Playwright end-to-end tests against stubbed LLMs
npm run docs      # regenerate docs/ from the sources
npm run web       # Vite dev server for the UI (proxies /api to the running server)
```

- **API reference:** generated from the sources into [`docs/`](docs/README.md). Start with [`plugin-api`](docs/plugin-api/README.md) for the plugin contract.
- **Contributor rules:** see [`AGENTS.md`](AGENTS.md).
