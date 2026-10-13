import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeChromiumSearch, parseNumbered } from "../../../src/plugins/spec/runtime/chromium-search.ts";

const STUB = fileURLToPath(new URL("../../stubs/fake-llm.mjs", import.meta.url));
const FL = "third_party/blink/renderer/core/loader/frame_loader.cc";
const signal = new AbortController().signal;
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "chromium-"));
  process.env.FAKE_LLM_LOG = join(dir, "log.jsonl");
  for (const key of ["FAKE_LLM_STDOUT", "FAKE_LLM_STDERR", "FAKE_LLM_EXIT"]) delete process.env[key];
});
const stdout = (text: string) => { writeFileSync(join(dir, "out"), text); process.env.FAKE_LLM_STDOUT = join(dir, "out"); };
const argv = () => readFileSync(process.env.FAKE_LLM_LOG!, "utf8").trim().split("\n").map((line) => JSON.parse(line).argv);
const fixture = (name: string) => readFileSync(new URL(`../../fixtures/chromium/${name}`, import.meta.url), "utf8");

test("specRefs searches the spec prefix line by line, groups test directories as tests, and keeps near misses for the caller to check", async () => {
  stdout(fixture("spec-links-navigate.json"));
  const refs = await makeChromiumSearch({ bin: STUB }).specRefs("https://html.spec.whatwg.org/#navigate", signal, 500);
  assert.deepEqual(argv()[0], ["search", "pcre:yes html\\.spec\\.whatwg\\.org/\\S*#navigate -file:^out/", "--json", "path,line,snippet", "-L", "500"]);
  assert.equal(refs.length, 14);
  assert.deepEqual(refs.filter((ref) => ref.group === "Code").map((ref) => [ref.path, ref.line, ref.url]), [
    ["third_party/blink/renderer/core/dom/document.h", 909, "https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/dom/document.h;l=909"],
    [FL, 1816, `https://source.chromium.org/chromium/chromium/src/+/main:${FL};l=1816`],
  ]);
  assert.ok(refs.filter((ref) => ref.group !== "Code").every((ref) => ref.group === "Test" && ref.path.includes("/web_tests/")));
});

test("search looks for the literal text line by line outside out/, with its limit", async () => {
  stdout(fixture("spec-links-navigate.json"));
  const hits = await makeChromiumSearch({ bin: STUB }).search("FrameLoader::CancelProvisionalLoaderForNewNavigation(", signal, 20);
  assert.deepEqual(argv()[0], ["search", "pcre:yes FrameLoader::CancelProvisionalLoaderForNewNavigation\\( -file:^out/", "--json", "path,line,snippet", "-L", "20"]);
  assert.equal(hits.length, 14);
  assert.deepEqual(Object.keys(hits[0]!).sort(), ["line", "path", "snippet"]);
  await makeChromiumSearch({ bin: STUB }).search("-webkit-appearance: none file:x", signal);
  assert.deepEqual(argv()[1]![1], "pcre:yes \\-webkit-appearance:\\s+none\\s+file:x -file:^out/");
});

test("file parses cat -n output once per path; a failure other than a missing file throws", async () => {
  stdout(fixture("frame_loader.cc.txt"));
  const chromium = makeChromiumSearch({ bin: STUB });
  const text = (await chromium.file(FL, signal))!;
  assert.deepEqual(argv()[0], ["cat", FL, "-n"]);
  assert.equal(text.split("\n").length, 1985);
  assert.equal(text.split("\n")[1815], "  // https://html.spec.whatwg.org/C/#navigate");
  await chromium.functionAt(FL, 1816, signal);
  assert.equal(argv().length, 1, "the scope lookup reads the file fetched before");
  delete process.env.FAKE_LLM_STDOUT;
  process.env.FAKE_LLM_EXIT = "1";
  process.env.FAKE_LLM_STDERR = "Error: quota exceeded\n";
  await assert.rejects(chromium.file("x.cc", signal), /chromium-search exited with code 1: Error: quota exceeded/);
  assert.deepEqual(parseNumbered("     1\ta\n     2\t\tb\n"), ["a", "\tb"]);
});

test("a path that chromium-search would read as a flag, and a line that is no positive integer, are rejected before it runs", async () => {
  const chromium = makeChromiumSearch({ bin: STUB });
  await assert.rejects(chromium.file("--help", signal), /must not start with "-"/);
  await assert.rejects(chromium.functionAt("-x", 3, signal), /must not start with "-"/);
  await assert.rejects(chromium.functionAt(FL, 0, signal), /positive integer/);
});

test("functionAt is the brace scan's function; the tip is main", async () => {
  stdout(fixture("frame_loader.cc.txt"));
  const chromium = makeChromiumSearch({ bin: STUB });
  assert.deepEqual(await chromium.functionAt(FL, 1816, signal), [{ symbol: "FrameLoader::CancelProvisionalLoaderForNewNavigation()", signature: "bool FrameLoader::CancelProvisionalLoaderForNewNavigation() {" }]);
  assert.deepEqual(await chromium.functionAt(FL, 1, signal), []);
  assert.deepEqual(await chromium.tip(), { repoBase: "https://source.chromium.org/chromium/chromium/src/", rev: "main" });
  assert.deepEqual([chromium.engine, chromium.pinned, chromium.heuristicScopes], ["blink", false, true]);
});

const FAKE = fileURLToPath(new URL("../../stubs/fake-chromium-search.mjs", import.meta.url));
test("a file the finder does not list is missing; one it lists that cannot be read is an error, as chromium-search reports both as not found", async () => {
  const fake = makeChromiumSearch({ bin: FAKE });
  assert.deepEqual(await fake.specRefs("https://html.spec.whatwg.org/#navigate", signal), []);
  assert.equal(await fake.file("x.cc", signal), null);
  process.env.FAKE_CHROMIUM_UNREACHABLE = "1";
  try { await assert.rejects(fake.file(FL, signal), /File not found/); }
  finally { delete process.env.FAKE_CHROMIUM_UNREACHABLE; }
  assert.equal((await fake.file(FL, signal))!.split("\n").length, 1985);
});
