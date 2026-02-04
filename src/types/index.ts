// Panel orientation determines how the board is positioned in 3D space:
// - 'horizontal': Shelf/top/bottom - lies flat, you see the front edge in front view
// - 'vertical': Side panel/divider - stands upright going front-to-back
// - 'back': Back panel - faces forward, you see the full face in front view
export type PanelOrientation = "horizontal" | "vertical" | "back";

// Z-axis alignment for panels with depth less than furniture depth
export type ZAlignment = "front" | "back" | "center";

// Edge banding configuration - which edges have banding applied
export interface EdgeBanding {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export interface Panel {
  id: string;
  label: string;
  x: number; // Position in front view (left edge)
  y: number; // Position in front view (top edge)
  width: number; // Panel's actual width (longest dimension typically)
  height: number; // Panel's actual height/length
  quantity: number;
  orientation: PanelOrientation;
  depth?: number; // Custom depth (Z dimension), defaults to furniture depth (400mm)
  zAlign?: ZAlignment; // Where to position panel in Z-axis when depth < furniture depth
  edgeBanding?: EdgeBanding; // Which edges have banding
}

// Material presets
export type MaterialType = "plywood" | "mdf" | "particleboard" | "melamine" | "solid_wood" | "custom";

export interface MaterialPreset {
  id: MaterialType;
  name: string;
  defaultThickness: number;
  defaultColor: string;
  description: string;
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  { id: "plywood", name: "Plywood", defaultThickness: 18, defaultColor: "#E8D4B8", description: "Versatile, strong, good for structural parts" },
  { id: "mdf", name: "MDF", defaultThickness: 18, defaultColor: "#D4C4A8", description: "Smooth surface, great for painting" },
  { id: "particleboard", name: "Particleboard", defaultThickness: 16, defaultColor: "#C8B89C", description: "Budget-friendly, good for hidden parts" },
  { id: "melamine", name: "Melamine", defaultThickness: 18, defaultColor: "#FFFFFF", description: "Pre-finished, easy to clean" },
  { id: "solid_wood", name: "Solid Wood", defaultThickness: 20, defaultColor: "#C19A6B", description: "Premium, natural grain" },
  { id: "custom", name: "Custom", defaultThickness: 18, defaultColor: "#E8D4B8", description: "Custom material settings" },
];

export interface Settings {
  thickness: number;
  sheetWidth: number;
  sheetHeight: number;
  units: "mm" | "inches";
  woodColor: string;
  furnitureDepth: number; // Default depth for panels (typically 400mm)
  projectName?: string; // Name of the project for print cover page
  // Cost calculation
  sheetPrice?: number; // Price per sheet in local currency
  currency?: string; // Currency symbol (default: $)
  // Material
  materialType?: MaterialType;
  // Edge banding
  edgeBandingPrice?: number; // Price per meter
}

export interface DesignData {
  version: number;
  settings: Settings;
  panels: Panel[];
}

export interface Placement {
  id: string;
  label: string;
  letter?: string; // Assembly letter (A, B, C...)
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

export interface StickyNote {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
}

export interface OptimizationResult {
  sheets: Sheet[];
  totalSheets: number;
  totalWaste: number;
  unplacedPieces: Panel[];
}

// ============================================
// Assembly Instruction Types
// ============================================

// How two panels connect to each other
export type JointType =
  | "corner" // Two panels meet at a 90° corner (L-shape)
  | "t-joint" // One panel meets another mid-span (T-shape)
  | "edge" // Panels share an edge (partial overlap)
  | "dado" // Panel inserted into a groove (slot)
  | "butt"; // Simple butt joint (face to edge)

// Which edge/face of a panel is involved in a joint
export type PanelEdge = "top" | "bottom" | "left" | "right" | "front" | "back";

// Describes a connection between two panels
export interface Joint {
  panelAId: string;
  panelBId: string;
  type: JointType;
  panelAEdge: PanelEdge;
  panelBEdge: PanelEdge;
  // Position along the edge where connection occurs (0-1 normalized)
  positionOnA?: number;
  positionOnB?: number;
}

// Stability status for an assembly step
export type StabilityStatus =
  | "stable" // Structure stands on its own
  | "unstable" // Structure would tip without support
  | "needs-support"; // Panel being added needs temporary support

// Type of temporary support needed
export type SupportType =
  | "none"
  | "hold" // Someone needs to hold it
  | "prop" // Prop against wall/surface
  | "clamp" // Use clamps to hold in place
  | "lean"; // Lean panels against each other

// Hint for temporary support during assembly
export interface SupportHint {
  type: SupportType;
  instruction: string;
  // Which panel(s) need support
  targetPanelIds: string[];
}

// Direction the structure might tip
export type TipDirection = "forward" | "backward" | "left" | "right" | "none";
