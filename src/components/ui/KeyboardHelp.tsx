/**
 * Keyboard Shortcuts Help Modal
 * 
 * Shows all available keyboard shortcuts in an organized panel.
 */

import { Keyboard, X } from "lucide-react";
import React, { useEffect, useState } from "react";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "General",
    shortcuts: [
      { keys: ["N"], description: "Add new panel" },
      { keys: ["⌫"], description: "Delete selected" },
      { keys: ["⌘", "A"], description: "Select all" },
      { keys: ["⌘", "D"], description: "Duplicate selected" },
      { keys: ["⌘", "Z"], description: "Undo" },
      { keys: ["⌘", "⇧", "Z"], description: "Redo" },
      { keys: ["?"], description: "Show this help" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["Space"], description: "Pan (hold + drag)" },
      { keys: ["⌘", "+"], description: "Zoom in" },
      { keys: ["⌘", "-"], description: "Zoom out" },
      { keys: ["⌘", "0"], description: "Reset zoom" },
      { keys: ["⌘", "1"], description: "Fit to content" },
    ],
  },
  {
    title: "Tools",
    shortcuts: [
      { keys: ["V"], description: "Select tool" },
      { keys: ["H"], description: "Pan tool" },
      { keys: ["R"], description: "Toggle rulers" },
      { keys: ["G"], description: "Toggle grid" },
      { keys: ["M"], description: "Toggle measurements" },
    ],
  },
  {
    title: "Editing",
    shortcuts: [
      { keys: ["⇧"], description: "Constrain to straight line" },
      { keys: ["⌥"], description: "Duplicate while dragging" },
      { keys: ["⌘"], description: "Disable snapping" },
      { keys: ["←↑↓→"], description: "Nudge selected (1px)" },
      { keys: ["⇧", "←↑↓→"], description: "Nudge selected (10px)" },
    ],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono font-medium text-gray-700 shadow-sm">
      {children}
    </kbd>
  );
}

interface KeyboardHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardHelp({ isOpen, onClose }: KeyboardHelpProps) {
  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onClose();
        }
      };
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
              <Keyboard className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <h2 id="help-title" className="text-lg font-semibold text-gray-900">
                Keyboard Shortcuts
              </h2>
              <p className="text-sm text-gray-500">Speed up your workflow</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-100px)]">
          <div className="grid grid-cols-2 gap-6">
            {SHORTCUT_GROUPS.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  {group.title}
                </h3>
                <div className="space-y-2">
                  {group.shortcuts.map((shortcut, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-1.5"
                    >
                      <span className="text-sm text-gray-600">
                        {shortcut.description}
                      </span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIdx) => (
                          <React.Fragment key={keyIdx}>
                            <Kbd>{key}</Kbd>
                            {keyIdx < shortcut.keys.length - 1 && (
                              <span className="text-gray-400 text-xs">+</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            Press <Kbd>?</Kbd> anytime to show this help
          </p>
        </div>
      </div>
    </div>
  );
}

// Hook for toggle with ? key
export function useKeyboardHelp() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if we're in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }
      
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((prev) => !prev),
  };
}
