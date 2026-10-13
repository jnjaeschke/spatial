import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { ChatNodeData, GraphNode, GraphNodeData } from "./graph.ts";
import { hostedThreads } from "./graph.ts";
import { quoteRange } from "./quote-range.ts";

type QuoteData = { kind: string; anchor: string; quote: string; lines?: ChatNodeData["lines"] };
type QuoteEntry = { id: string; anchors: string[]; data: QuoteData };
type QuoteSpec = { id: string; kind: string; anchor: string; quote: string; lines?: ChatNodeData["lines"] };

export function useQuoteHighlights(input: {
  nodes: GraphNode[];
  quoteEntries(data: GraphNodeData): QuoteSpec[];
  container: RefObject<HTMLDivElement | null>;
  shownNodeIds: ReadonlySet<string>;
  collapsed: ReadonlySet<string>;
}) {
  const rangeOwner = useRef(new Map<AbstractRange, string>());
  const highlightNames = useRef<string[]>([]);
  const [hoveredChat, setHoveredChat] = useState<string | null>(null);
  const [focusedChat, setFocusedChat] = useState<string | null>(null);
  const [hoveredQuote, setHoveredQuote] = useState<string | null>(null);
  const entries = useMemo(() => {
    const result: QuoteEntry[] = [];
    for (const node of input.nodes) {
      const data = node.data;
      if ("quote" in data && typeof data.quote === "string" && data.quote && "anchor" in data && typeof data.anchor === "string") {
        result.push({ id: node.id, anchors: node.anchors ?? [], data: { kind: data.kind, anchor: data.anchor, quote: data.quote, lines: ("lines" in data ? data.lines : undefined) as ChatNodeData["lines"] } });
      }
      for (const { id, ...quote } of input.quoteEntries(data)) result.push({ id, anchors: [node.id], data: quote });
      for (const thread of hostedThreads(data) ?? []) if (thread.quote) result.push({ id: thread.threadId ?? thread.draftId!, anchors: [node.id], data: { kind: "chat", anchor: thread.anchor, quote: thread.quote, lines: thread.lines } });
    }
    return result;
  }, [input.nodes, input.quoteEntries]);
  const visibleBoxIds = useMemo(() => new Set(entries.filter((item) => item.data.kind !== "chat" || !input.collapsed.has(item.id)).filter((item) => input.shownNodeIds.has(item.anchors[0]!)).map((item) => item.id)), [entries, input.shownNodeIds, input.collapsed]);
  const activeQuote = hoveredQuote ?? (hoveredChat && visibleBoxIds.has(hoveredChat) ? hoveredChat : focusedChat && visibleBoxIds.has(focusedChat) ? focusedChat : null);
  const quoteAt = (x: number, y: number) => {
    for (const hit of CSS.highlights.highlightsFromPoint(x, y)) {
      if (!highlightNames.current.some((name) => name.endsWith("-quote") && CSS.highlights.get(name) === hit.highlight)) continue;
      for (const range of hit.ranges) {
        const id = rangeOwner.current.get(range);
        if (id) return id;
      }
    }
    return null;
  };
  useEffect(() => {
    const el = input.container.current;
    if (!el) return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      const id = quoteAt(event.clientX, event.clientY);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setHoveredQuote(id);
        el.classList.toggle("over-collapsed-quote", id !== null && input.collapsed.has(id));
      });
    };
    const leave = () => { cancelAnimationFrame(frame); setHoveredQuote(null); el.classList.remove("over-collapsed-quote"); };
    const chatAt = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      const id = target.closest<HTMLElement>("[data-testid^='chat-']")?.dataset.testid?.slice(5) ?? target.closest(".react-flow__node")?.getAttribute("data-id") ?? null;
      return id && visibleBoxIds.has(id) ? id : null;
    };
    const over = (event: PointerEvent) => setHoveredChat(chatAt(event.target));
    const out = (event: PointerEvent) => { if (!chatAt(event.relatedTarget)) setHoveredChat(null); };
    const focus = (event: FocusEvent) => setFocusedChat(chatAt(event.target));
    const blur = (event: FocusEvent) => { if (!chatAt(event.relatedTarget)) setFocusedChat(null); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("pointerover", over);
    el.addEventListener("pointerout", out);
    el.addEventListener("focusin", focus);
    el.addEventListener("focusout", blur);
    return () => {
      el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave);
      el.removeEventListener("pointerover", over); el.removeEventListener("pointerout", out);
      el.removeEventListener("focusin", focus); el.removeEventListener("focusout", blur);
      cancelAnimationFrame(frame); el.classList.remove("over-collapsed-quote");
    };
  }, [input.container, input.collapsed, visibleBoxIds]);
  useEffect(() => {
    const el = input.container.current;
    if (!el) return;
    let frame = 0;
    const build = () => {
      const byKind = new Map<string, { ranges: Range[]; active: Range[] }>();
      rangeOwner.current.clear();
      for (const entry of entries) {
        const group = byKind.get(entry.data.kind) ?? { ranges: [], active: [] };
        byKind.set(entry.data.kind, group);
        const range = quoteRange(el, entry.data.anchor, entry.data.quote, entry.data.lines);
        if (!range) continue;
        group.ranges.push(range); rangeOwner.current.set(range, entry.id);
        if (entry.id === activeQuote) group.active.push(range);
      }
      const names: string[] = [];
      for (const [kind, group] of byKind) {
        const name = `${kind}-quote`, activeName = `${kind}-quote-active`;
        CSS.highlights.set(name, new Highlight(...group.ranges));
        const active = new Highlight(...group.active); active.priority = 1;
        CSS.highlights.set(activeName, active); names.push(name, activeName);
      }
      highlightNames.current = names;
    };
    // Build synchronously so clicks cannot observe the preceding effect's deleted highlights.
    build();
    const observer = new MutationObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(build); });
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      for (const name of highlightNames.current) CSS.highlights.delete(name);
      highlightNames.current = [];
    };
  }, [input.container, entries, activeQuote]);
  return { quoteAt, activeQuote, visibleBoxIds, setHoveredChat, setFocusedChat };
}
