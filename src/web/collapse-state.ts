export interface CollapseExplicit { collapsed: ReadonlySet<string>; expanded: ReadonlySet<string> }

/** (defaults union explicitly collapsed) minus explicitly expanded. */
export function effectiveCollapsed(defaults: ReadonlySet<string>, explicit: CollapseExplicit): Set<string> {
  return new Set([...defaults, ...explicit.collapsed].filter((id) => !explicit.expanded.has(id)));
}

/** Flips an id as the user sees it, preserving the effective state if defaults change. */
export function toggleExplicit(defaults: ReadonlySet<string>, explicit: CollapseExplicit, id: string): CollapseExplicit {
  const collapsed = effectiveCollapsed(defaults, explicit).has(id);
  const nextCollapsed = new Set(explicit.collapsed), nextExpanded = new Set(explicit.expanded);
  if (collapsed) { nextCollapsed.delete(id); nextExpanded.add(id); }
  else { nextExpanded.delete(id); nextCollapsed.add(id); }
  return { collapsed: nextCollapsed, expanded: nextExpanded };
}

/** Explicitly expands one id, preserving every other user's choice. */
export function expandExplicit(explicit: CollapseExplicit, id: string): CollapseExplicit {
  const collapsed = new Set(explicit.collapsed), expanded = new Set(explicit.expanded);
  collapsed.delete(id);
  expanded.add(id);
  return { collapsed, expanded };
}

/** Everything currently collapsed becomes explicitly expanded. */
export function expandAllExplicit(defaults: ReadonlySet<string>): CollapseExplicit {
  return { collapsed: new Set(), expanded: new Set(defaults) };
}
