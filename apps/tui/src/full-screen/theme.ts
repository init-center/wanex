import type { EditorTheme, SelectListTheme } from "@earendil-works/pi-tui"

export const tuiSelectListTheme: SelectListTheme = {
  selectedPrefix: (text) => text,
  selectedText: (text) => text,
  description: (text) => text,
  scrollInfo: (text) => text,
  noMatch: (text) => text
}

export const tuiEditorTheme: EditorTheme = {
  borderColor: (text) => text,
  selectList: tuiSelectListTheme
}
