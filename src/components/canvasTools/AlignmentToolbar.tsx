/**
 * Alignment Toolbar
 * 
 * Floating toolbar for alignment and distribution tools.
 * Appears when multiple panels are selected.
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
  Equal,
} from "lucide-react";
import React from "react";

interface AlignmentToolbarProps {
  selectionCount: number;
  onAlignLeft: () => void;
  onAlignCenterH: () => void;
  onAlignRight: () => void;
  onAlignTop: () => void;
  onAlignCenterV: () => void;
  onAlignBottom: () => void;
  onDistributeH: () => void;
  onDistributeV: () => void;
  onMatchWidth: () => void;
  onMatchHeight: () => void;
}

interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function ToolButton({ icon, label, onClick, disabled }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`p-1.5 rounded transition-colors ${
        disabled
          ? "text-gray-300 cursor-not-allowed"
          : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
      }`}
      aria-label={label}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-gray-200 mx-1" />;
}

export function AlignmentToolbar({
  selectionCount,
  onAlignLeft,
  onAlignCenterH,
  onAlignRight,
  onAlignTop,
  onAlignCenterV,
  onAlignBottom,
  onDistributeH,
  onDistributeV,
  onMatchWidth,
  onMatchHeight,
}: AlignmentToolbarProps) {
  if (selectionCount < 2) return null;

  const canDistribute = selectionCount >= 3;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 bg-white rounded-lg shadow-lg border border-gray-200 px-2 py-1 animate-fade-in">
      {/* Horizontal Alignment */}
      <ToolButton
        icon={<AlignStartHorizontal size={16} />}
        label="Align Left"
        onClick={onAlignLeft}
      />
      <ToolButton
        icon={<AlignCenterHorizontal size={16} />}
        label="Align Center Horizontally"
        onClick={onAlignCenterH}
      />
      <ToolButton
        icon={<AlignEndHorizontal size={16} />}
        label="Align Right"
        onClick={onAlignRight}
      />

      <Divider />

      {/* Vertical Alignment */}
      <ToolButton
        icon={<AlignStartVertical size={16} />}
        label="Align Top"
        onClick={onAlignTop}
      />
      <ToolButton
        icon={<AlignCenterVertical size={16} />}
        label="Align Center Vertically"
        onClick={onAlignCenterV}
      />
      <ToolButton
        icon={<AlignEndVertical size={16} />}
        label="Align Bottom"
        onClick={onAlignBottom}
      />

      <Divider />

      {/* Distribution */}
      <ToolButton
        icon={<AlignHorizontalDistributeCenter size={16} />}
        label="Distribute Horizontally"
        onClick={onDistributeH}
        disabled={!canDistribute}
      />
      <ToolButton
        icon={<AlignVerticalDistributeCenter size={16} />}
        label="Distribute Vertically"
        onClick={onDistributeV}
        disabled={!canDistribute}
      />

      <Divider />

      {/* Match Dimensions */}
      <ToolButton
        icon={
          <div className="flex items-center">
            <Equal size={14} />
            <span className="text-[10px] ml-0.5">W</span>
          </div>
        }
        label="Match Width"
        onClick={onMatchWidth}
      />
      <ToolButton
        icon={
          <div className="flex items-center">
            <Equal size={14} />
            <span className="text-[10px] ml-0.5">H</span>
          </div>
        }
        label="Match Height"
        onClick={onMatchHeight}
      />

      {/* Selection count indicator */}
      <div className="ml-2 pl-2 border-l border-gray-200 text-xs text-gray-500">
        {selectionCount} selected
      </div>
    </div>
  );
}
