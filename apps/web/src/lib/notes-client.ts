import { api } from "./api";

export type NoteImportance = "INFO" | "NORMAL" | "IMPORTANT" | "URGENT";

export type ShopNote = {
  id: string;
  title: string;
  body: string;
  importance: NoteImportance;
  relevantAt: string;
  createdById: string | null;
  authorName: string;
  authorRole: string;
  archived: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotesListResponse = {
  notes: ShopNote[];
  canWrite: boolean;
};

export function fetchNotes(includeArchived = false) {
  const q = includeArchived ? "?archived=1" : "";
  return api<NotesListResponse>(`/notes${q}`);
}

export function createNote(body: {
  title: string;
  body: string;
  importance?: NoteImportance;
  relevantAt?: string;
  authorName?: string;
}) {
  return api<ShopNote>("/notes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateNote(
  id: string,
  body: {
    title?: string;
    body?: string;
    importance?: NoteImportance;
    relevantAt?: string;
  },
) {
  return api<ShopNote>(`/notes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function archiveNote(id: string) {
  return api<ShopNote>(`/notes/${id}`, { method: "DELETE" });
}
