// Panel orientation determines how the board is positioned in 3D space:
// - 'horizontal': Shelf/top/bottom - lies flat, you see the front edge in front view
// - 'vertical': Side panel/divider - stands upright going front-to-back
// - 'back': Back panel - faces forward, you see the full face in front view
export type PanelOrientation = "horizontal" | "vertical" | "back";

export interface Panel {
  id: string;
  label: string;
  x: number; // Position in front view (left edge)
  y: number; // Position in front view (top edge)
  width: number; // Panel's actual width (longest dimension typically)
  height: number; // Panel's actual height/length
  quantity: number;
  orientation: PanelOrientation;
}

export interface Settings {
  thickness: number;
  sheetWidth: number;
  sheetHeight: number;
  units: "mm" | "inches";
  woodColor: string;
}

export interface DesignData {
  version: number;
  settings: Settings;
  panels: Panel[];
}

export interface Placement {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
  sourceId: string;
}

export interface Sheet {
  id: string;
  placements: Placement[];
  usedArea: number;
  wastePercent: number;
}

export interface OptimizationResult {
  sheets: Sheet[];
  totalSheets: number;
  totalWaste: number;
  unplacedPieces: Panel[];
}
