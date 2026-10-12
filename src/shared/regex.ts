/** `text` as a regular expression that matches it literally. */
export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
