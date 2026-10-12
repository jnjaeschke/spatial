/** The `SPEC#anchor` ref of a section. */
export const specRef = (spec: string, anchor: string) => `${spec}#${anchor}`;
/** Whether explore input names a section (`SPEC#anchor` or a spec URL with a fragment) rather than a search phrase. */
/** Whether `text` is a `SPEC#anchor` ref. */
export const isSpecRef = (text: string) => /^[A-Za-z0-9-]+#\S+$/.test(text);
export const isSpecQuery = (text: string) => isSpecRef(text) || /^https?:\/\/\S+#\S+$/.test(text);
