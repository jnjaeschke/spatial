import { createContext } from "react";

/** A location in a diff to show; with row the view jumps to that row, otherwise it opens the file. */
export interface FileViewRequest { diffId: string; path: string; hunkId: string; text?: string; row?: { side: "new" | "old"; line: number } }

export const FileViewContext = createContext<((file: FileViewRequest) => void) | null>(null);
