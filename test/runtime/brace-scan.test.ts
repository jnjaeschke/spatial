import { test } from "node:test";
import assert from "node:assert/strict";
import { enclosingFunction, functionsIn } from "../../src/runtime/brace-scan.ts";

const SOURCE = `namespace blink {

// https://html.spec.whatwg.org/C/#navigate
constexpr int kMaxCount = 3;

enum class Mode {
  kA,
  kB,
};

class Document {
 public:
  // https://html.spec.whatwg.org/C/#navigate
  void Abort();
  int Count() const { return count_; }
};

bool FrameLoader::CancelProvisionalLoaderForNewNavigation(
    int reason) {
  const char* brace = "}";  // a } in a comment
  if (reason) {
    // https://html.spec.whatwg.org/C/#navigate
    auto cb = [&](int x) {
      return x + '{';
    };
  }
  return true;
}

// https://html.spec.whatwg.org/C/#navigate
void Frame::Navigate() {
  Run();
}

}  // namespace blink`.split("\n");

const CANCEL = { symbol: "FrameLoader::CancelProvisionalLoaderForNewNavigation(int reason)", signature: "bool FrameLoader::CancelProvisionalLoaderForNewNavigation(", line: 18, end: 28 };

test("a line in a function resolves to it from its name line to its closing brace, past if blocks, lambdas, and braces in strings and comments", () => {
  for (const line of [18, 19, 22, 24, 28]) assert.deepEqual(enclosingFunction(SOURCE, line), CANCEL, `line ${line}`);
  assert.deepEqual(enclosingFunction(SOURCE, 31), { symbol: "Frame::Navigate()", signature: "void Frame::Navigate() {", line: 31, end: 33 });
  assert.deepEqual(enclosingFunction(SOURCE, 15), { symbol: "Count()", signature: "int Count() const { return count_; }", line: 15, end: 15 });
});

test("lines outside function bodies resolve to nothing: namespace and class scope, declarations, comments above a definition", () => {
  for (const line of [3, 7, 13, 14, 30, 35]) assert.equal(enclosingFunction(SOURCE, line), null, `line ${line}`);
  assert.deepEqual(functionsIn(SOURCE).map((fn) => fn.symbol).sort(), ["Count()", "Frame::Navigate()", "FrameLoader::CancelProvisionalLoaderForNewNavigation(int reason)"]);
});

test("templates, elaborated parameter types, operators and constructors with brace member initializers are functions; a braced argument is not", () => {
  const source = `template <class T>
void Foo(T t) {
  Run();
}

void F(struct stat* s) {
  Call(a, {1,
           // https://html.spec.whatwg.org/C/#navigate
           2});
}

bool operator==(const A& a, const A& b) {
  return true;
}

Foo::Foo(int a) : a_(a), b_{2} {
  Run();
}

int Bar::operator()(int x) const {
  return x;
}`.split("\n");
  assert.deepEqual(functionsIn(source).map(({ symbol, line, end }) => [symbol, line, end]).sort(), [
    ["Bar::operator()(int x)", 20, 22], ["F(struct stat* s)", 6, 10], ["Foo(T t)", 2, 4], ["Foo::Foo(int a)", 16, 18], ["operator==(const A& a, const A& b)", 12, 14],
  ]);
  assert.equal(enclosingFunction(source, 8)!.symbol, "F(struct stat* s)");
  assert.equal(enclosingFunction(source, 17)!.symbol, "Foo::Foo(int a)");
});
