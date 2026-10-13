export function taskLabel(kind: string, labels: Readonly<Record<string, string>>): string {
  return labels[kind] ?? kind;
}
