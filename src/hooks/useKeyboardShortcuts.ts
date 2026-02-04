import { useEffect, useCallback } from "react";
import { useDesignStore } from "../stores/designStore";

export function useKeyboardShortcuts(enabled: boolean = true) {
  const {
    undo,
    redo,
    canUndo,
    canRedo,
    selectedPanelIds,
    deletePanels,
    selectAll,
    clearSelection,
    addPanel,
  } = useDesignStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Undo: Cmd/Ctrl + Z
      if (cmdOrCtrl && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        if (canUndo) undo();
        return;
      }

      // Redo: Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y
      if (cmdOrCtrl && e.shiftKey && e.key === "z") {
        e.preventDefault();
        if (canRedo) redo();
        return;
      }
      if (cmdOrCtrl && e.key === "y") {
        e.preventDefault();
        if (canRedo) redo();
        return;
      }

      // Select All: Cmd/Ctrl + A
      if (cmdOrCtrl && e.key === "a") {
        e.preventDefault();
        selectAll();
        return;
      }

      // Delete selected: Delete or Backspace
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedPanelIds.length > 0) {
          e.preventDefault();
          deletePanels(selectedPanelIds);
        }
        return;
      }

      // Escape: Clear selection
      if (e.key === "Escape") {
        clearSelection();
        return;
      }

      // New panel: N
      if (e.key === "n" && !cmdOrCtrl) {
        e.preventDefault();
        addPanel();
        return;
      }
    },
    [
      enabled,
      canUndo,
      canRedo,
      undo,
      redo,
      selectAll,
      selectedPanelIds,
      deletePanels,
      clearSelection,
      addPanel,
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

// List of all shortcuts for the help modal
export const KEYBOARD_SHORTCUTS = [
  { keys: ["⌘/Ctrl", "Z"], description: "Undo" },
  { keys: ["⌘/Ctrl", "Shift", "Z"], description: "Redo" },
  { keys: ["⌘/Ctrl", "A"], description: "Select all panels" },
  { keys: ["Delete"], description: "Delete selected panels" },
  { keys: ["Escape"], description: "Clear selection" },
  { keys: ["N"], description: "Add new panel" },
];
