/**
 * Canvas Context Menu
 * 
 * Right-click menu for panel operations in the 2D editor.
 */

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Copy,
  Lock,
  Scissors,
  Trash2,
  Unlock,
} from "lucide-react";
import React, { useEffect, useRef } from "react";

export interface ContextMenuAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  divider?: boolean;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  onClose: () => void;
}

export function ContextMenu({ x, y, actions, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (rect.right > viewportWidth) {
        menuRef.current.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > viewportHeight) {
        menuRef.current.style.top = `${y - rect.height}px`;
      }
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[200px] animate-scale-in"
      style={{ left: x, top: y }}
      role="menu"
    >
      {actions.map((action, index) => (
        <React.Fragment key={action.id}>
          {action.divider && index > 0 && (
            <div className="my-1 border-t border-gray-200" />
          )}
          <button
            onClick={() => {
              action.onClick();
              onClose();
            }}
            disabled={action.disabled}
            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-3 transition-colors ${
              action.disabled
                ? "text-gray-300 cursor-not-allowed"
                : action.danger
                ? "text-red-600 hover:bg-red-50"
                : "text-gray-700 hover:bg-gray-100"
            }`}
            role="menuitem"
          >
            {action.icon && (
              <span className="w-4 h-4 flex items-center justify-center">
                {action.icon}
              </span>
            )}
            <span className="flex-1">{action.label}</span>
            {action.shortcut && (
              <span className="text-xs text-gray-400 font-mono">
                {action.shortcut}
              </span>
            )}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

// Helper to create standard panel actions
export function createPanelContextActions({
  hasSelection,
  selectionCount,
  onCut,
  onCopy,
  onPaste,
  onDuplicate,
  onDelete,
  onAlignLeft,
  onAlignCenterH,
  onAlignRight,
  onAlignTop,
  onAlignCenterV,
  onAlignBottom,
  onDistributeH,
  onDistributeV,
  onLock,
  onUnlock,
  isLocked,
}: {
  hasSelection: boolean;
  selectionCount: number;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAlignLeft: () => void;
  onAlignCenterH: () => void;
  onAlignRight: () => void;
  onAlignTop: () => void;
  onAlignCenterV: () => void;
  onAlignBottom: () => void;
  onDistributeH: () => void;
  onDistributeV: () => void;
  onLock?: () => void;
  onUnlock?: () => void;
  isLocked?: boolean;
}): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [
    {
      id: "cut",
      label: "Cut",
      icon: <Scissors size={14} />,
      shortcut: "⌘X",
      onClick: onCut,
      disabled: !hasSelection,
    },
    {
      id: "copy",
      label: "Copy",
      icon: <Copy size={14} />,
      shortcut: "⌘C",
      onClick: onCopy,
      disabled: !hasSelection,
    },
    {
      id: "paste",
      label: "Paste",
      shortcut: "⌘V",
      onClick: onPaste,
    },
    {
      id: "duplicate",
      label: "Duplicate",
      shortcut: "⌘D",
      onClick: onDuplicate,
      disabled: !hasSelection,
    },
    {
      id: "delete",
      label: "Delete",
      icon: <Trash2 size={14} />,
      shortcut: "⌫",
      onClick: onDelete,
      disabled: !hasSelection,
      divider: true,
      danger: true,
    },
  ];

  // Add alignment options if multiple panels selected
  if (selectionCount >= 2) {
    actions.push(
      {
        id: "align-left",
        label: "Align Left",
        icon: <AlignStartHorizontal size={14} />,
        onClick: onAlignLeft,
        divider: true,
      },
      {
        id: "align-center-h",
        label: "Align Center",
        icon: <AlignCenterHorizontal size={14} />,
        onClick: onAlignCenterH,
      },
      {
        id: "align-right",
        label: "Align Right",
        icon: <AlignEndHorizontal size={14} />,
        onClick: onAlignRight,
      },
      {
        id: "align-top",
        label: "Align Top",
        icon: <AlignStartVertical size={14} />,
        onClick: onAlignTop,
        divider: true,
      },
      {
        id: "align-center-v",
        label: "Align Middle",
        icon: <AlignCenterVertical size={14} />,
        onClick: onAlignCenterV,
      },
      {
        id: "align-bottom",
        label: "Align Bottom",
        icon: <AlignEndVertical size={14} />,
        onClick: onAlignBottom,
      }
    );
  }

  // Add distribute options if 3+ panels selected
  if (selectionCount >= 3) {
    actions.push(
      {
        id: "distribute-h",
        label: "Distribute Horizontally",
        icon: <AlignHorizontalDistributeCenter size={14} />,
        onClick: onDistributeH,
        divider: true,
      },
      {
        id: "distribute-v",
        label: "Distribute Vertically",
        icon: <AlignVerticalDistributeCenter size={14} />,
        onClick: onDistributeV,
      }
    );
  }

  // Add lock/unlock if handlers provided
  if (onLock && onUnlock) {
    actions.push({
      id: isLocked ? "unlock" : "lock",
      label: isLocked ? "Unlock" : "Lock Position",
      icon: isLocked ? <Unlock size={14} /> : <Lock size={14} />,
      onClick: isLocked ? onUnlock : onLock,
      disabled: !hasSelection,
      divider: true,
    });
  }

  return actions;
}
