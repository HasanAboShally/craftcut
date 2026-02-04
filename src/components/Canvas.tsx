import {
  GripHorizontal,
  GripVertical,
  Hand,
  Maximize,
  MousePointer2,
  Move,
  Redo2,
  Ruler,
  RulerIcon,
  Square,
  StickyNote,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDesignStore } from "../stores/designStore";
import type { Panel, StickyNote as StickyNoteType } from "../types";
import { AlignmentToolbar, ContextMenu, createPanelContextActions } from "./canvasTools";

// =============================================================================
// COORDINATE SYSTEM: Y-UP (like real-world furniture)
// =============================================================================
// - World coords: Y=0 is floor, positive Y goes UP
// - Panel.y stores the BOTTOM edge of the panel (lowest Y value)
// - Panel.x stores the LEFT edge of the panel
// - Screen coords (SVG): Y=0 is top, positive Y goes DOWN
// - Conversion: screenY = -worldY (simple negation)
// =============================================================================

const GRID_SIZE = 10; // 1cm = 10mm
const GRID_SIZE_MAJOR = 100; // 10cm = 100mm for major grid lines
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;
const DEFAULT_ZOOM = 0.5; // Higher default zoom so thin panels are visible
const NUDGE_AMOUNT = 10;
const NUDGE_AMOUNT_LARGE = 50;
const SNAP_THRESHOLD = 15;
const RULER_SIZE = 24;
const MIN_HIT_AREA = 40; // Minimum clickable area for thin panels

const GUIDE_COLOR = "#f43f5e";
const DISTANCE_COLOR = "#3b82f6";
const AXIS_COLOR = "#10b981"; // Green for axes

// =============================================================================
// COORDINATE CONVERSION
// =============================================================================

const worldToScreenY = (worldY: number): number => -worldY;
const screenToWorldY = (screenY: number): number => -screenY;

// =============================================================================
// HELPERS
// =============================================================================

function getWoodColorVariants(baseColor: string) {
  const hex = baseColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const darken = (val: number, amount: number) =>
    Math.max(0, Math.floor(val * (1 - amount)));
  const toHex = (val: number) => val.toString(16).padStart(2, "0");
  return {
    base: baseColor,
    grain: `#${toHex(darken(r, 0.1))}${toHex(darken(g, 0.1))}${toHex(darken(b, 0.1))}`,
    dark: `#${toHex(darken(r, 0.25))}${toHex(darken(g, 0.25))}${toHex(darken(b, 0.25))}`,
  };
}

function getTrueDimensions(
  panel: Panel,
  thickness: number,
): { width: number; height: number } {
  const orientation = panel.orientation || "horizontal";
  switch (orientation) {
    case "horizontal":
      return { width: panel.width, height: thickness };
    case "vertical":
      return { width: thickness, height: panel.height };
    case "back":
      return { width: panel.width, height: panel.height };
    default:
      return { width: panel.width, height: panel.height };
  }
}

// Get expanded hit area for easier clicking on thin panels
function getHitArea(
  panel: Panel,
  thickness: number,
): { width: number; height: number; offsetX: number; offsetY: number } {
  const trueDims = getTrueDimensions(panel, thickness);
  const hitWidth = Math.max(MIN_HIT_AREA, trueDims.width);
  const hitHeight = Math.max(MIN_HIT_AREA, trueDims.height);
  return {
    width: hitWidth,
    height: hitHeight,
    // Center the hit area on the true panel
    offsetX: (hitWidth - trueDims.width) / 2,
    offsetY: (hitHeight - trueDims.height) / 2,
  };
}

// =============================================================================
// TYPES
// =============================================================================

interface SnapGuide {
  type: "vertical" | "horizontal";
  position: number;
  start: number;
  end: number;
  isEqualSpacing?: boolean;
  gapSize?: number;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function Canvas() {
  const {
    panels,
    selectedPanelIds,
    selectPanel,
    selectPanels,
    selectAll,
    clearSelection,
    updatePanel,
    deletePanel,
    deletePanels,
    addPanel,
    settings,
    undo,
    redo,
    saveToHistory,
    canUndo,
    canRedo,
    stickyNotes,
    addStickyNote,
    updateStickyNote,
    deleteStickyNote,
    viewState,
    updateViewState,
  } = useDesignStore();

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAutoCentered = useRef(false);
  const rafRef = useRef<number | null>(null); // For requestAnimationFrame
  const mouseMoveRafRef = useRef<number | null>(null); // For mouse move RAF
  const pendingMouseEvent = useRef<React.MouseEvent | null>(null); // Batched mouse events

  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [dragging, setDragging] = useState<string | null>(null);
  const [draggingMultiple, setDraggingMultiple] = useState(false);
  const [dragStartPositions, setDragStartPositions] = useState<
    Map<string, { x: number; y: number }>
  >(new Map());
  const [resizing, setResizing] = useState<{
    id: string;
    corner: string;
  } | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [panelStart, setPanelStart] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  // Use viewState from store for zoom/pan persistence
  const [zoom, setZoomLocal] = useState(viewState.zoom);
  const [pan, setPanLocal] = useState({ x: viewState.panX, y: viewState.panY });

  // Sync local state changes back to store
  const setZoom = useCallback(
    (newZoom: number | ((prev: number) => number)) => {
      setZoomLocal((prev) => {
        const value = typeof newZoom === "function" ? newZoom(prev) : newZoom;
        updateViewState({ zoom: value });
        return value;
      });
    },
    [updateViewState],
  );

  const setPan = useCallback(
    (
      newPan:
        | { x: number; y: number }
        | ((prev: { x: number; y: number }) => { x: number; y: number }),
    ) => {
      setPanLocal((prev) => {
        const value = typeof newPan === "function" ? newPan(prev) : newPan;
        updateViewState({ panX: value.x, panY: value.y });
        return value;
      });
    },
    [updateViewState],
  );

  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [altHeld, setAltHeld] = useState(false);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const [clipboard, setClipboard] = useState<Panel[]>([]);
  const [tool, setTool] = useState<"select" | "pan" | "measure">("select");
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [showRulers, setShowRulers] = useState(true);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [editingMeasurement, setEditingMeasurement] = useState<{
    type: "gap" | "position";
    panelId: string;
    axis: "x" | "y";
    direction: "before" | "after" | "floor";
    currentValue: number;
    position: { x: number; y: number };
  } | null>(null);
  const [measurementInputValue, setMeasurementInputValue] = useState("");
  const [dragAxis, setDragAxis] = useState<"free" | "horizontal" | "vertical">(
    "free",
  );
  const [hasDuplicatedOnDrag, setHasDuplicatedOnDrag] = useState(false);
  
  // Custom measurement tool state
  const [measurePoints, setMeasurePoints] = useState<{ x: number; y: number; panelId?: string | null }[]>([]);
  const [measurePreview, setMeasurePreview] = useState<{ x: number; y: number } | null>(null);

  // Marquee selection
  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState({ x: 0, y: 0 });
  const [marqueeEnd, setMarqueeEnd] = useState({ x: 0, y: 0 });

  // Sticky notes
  const [stickyNoteTool, setStickyNoteTool] = useState(false);
  const [draggingNote, setDraggingNote] = useState<string | null>(null);
  const [noteStart, setNoteStart] = useState({ x: 0, y: 0 });
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteInputValue, setNoteInputValue] = useState("");

  // Context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Hover state for panels
  const [hoveredPanelId, setHoveredPanelId] = useState<string | null>(null);

  // ViewBox in screen coordinates
  const viewBoxWidth = canvasSize.width / zoom;
  const viewBoxHeight = canvasSize.height / zoom;
  const viewBoxX = -pan.x / zoom - viewBoxWidth / 2;
  const viewBoxY = -pan.y / zoom - viewBoxHeight / 2;

  // For backward compatibility - get first selected panel
  const selectedPanelId =
    selectedPanelIds.length === 1 ? selectedPanelIds[0] : null;

  // ===========================================================================
  // GAP CALCULATIONS
  // ===========================================================================

  const calculateGaps = useMemo(() => {
    if (!selectedPanelId) return null;
    const selectedPanel = panels.find((p) => p.id === selectedPanelId);
    if (!selectedPanel) return null;
    const visible = getTrueDimensions(selectedPanel, settings.thickness);
    return { panel: selectedPanel, visible };
  }, [selectedPanelId, panels, settings.thickness]);

  // ===========================================================================
  // SNAPPING
  // ===========================================================================

  const getSnapPoints = useCallback(
    (excludeIds: string[]) => {
      const points: { x: number[]; y: number[] } = { x: [], y: [] };
      const panelEdges: {
        id: string;
        left: number;
        right: number;
        bottom: number;
        top: number;
        width: number;
        height: number;
      }[] = [];

      panels.forEach((p) => {
        if (excludeIds.includes(p.id)) return;
        const trueDims = getTrueDimensions(p, settings.thickness);
        const left = p.x;
        const right = p.x + trueDims.width;
        const bottom = p.y;
        const top = p.y + trueDims.height;

        // Basic snap points: edges and centers
        points.x.push(left, left + trueDims.width / 2, right);
        points.y.push(bottom, bottom + trueDims.height / 2, top);

        panelEdges.push({
          id: p.id,
          left,
          right,
          bottom,
          top,
          width: trueDims.width,
          height: trueDims.height,
        });
      });
      points.y.push(0); // Floor

      return { points, panelEdges };
    },
    [panels, settings.thickness],
  );

  // Find equal spacing positions between panels
  const findEqualSpacingSnaps = useCallback(
    (
      excludeIds: string[],
      panelWidth: number,
      panelHeight: number,
      rawX: number,
      rawY: number,
    ) => {
      const { panelEdges } = getSnapPoints(excludeIds);
      const snaps: {
        axis: "x" | "y";
        position: number;
        gap: number;
        guides: SnapGuide[];
      }[] = [];

      // For X-axis: find panels that are horizontally aligned (overlapping in Y)
      // and calculate equal spacing positions
      const panelBottom = rawY;
      const panelTop = rawY + panelHeight;

      // Get panels that overlap vertically with the dragged panel
      const horizontalNeighbors = panelEdges
        .filter((p) => p.top > panelBottom && p.bottom < panelTop)
        .sort((a, b) => a.left - b.left);

      // Find gaps between consecutive panels and snap to equal spacing
      for (let i = 0; i < horizontalNeighbors.length - 1; i++) {
        const leftPanel = horizontalNeighbors[i];
        const rightPanel = horizontalNeighbors[i + 1];
        const gapStart = leftPanel.right;
        const gapEnd = rightPanel.left;
        const gapWidth = gapEnd - gapStart;

        // Only consider gaps large enough to fit the panel plus some margin
        if (gapWidth >= panelWidth) {
          // Snap to center of gap (equal spacing)
          const centerX = gapStart + (gapWidth - panelWidth) / 2;
          const leftGap = centerX - gapStart;
          const rightGap = gapEnd - (centerX + panelWidth);

          if (Math.abs(leftGap - rightGap) < 1) {
            // Truly centered
            snaps.push({
              axis: "x",
              position: centerX,
              gap: leftGap,
              guides: [
                {
                  type: "vertical",
                  position: gapStart,
                  start: -2000,
                  end: 2000,
                  isEqualSpacing: true,
                  gapSize: leftGap,
                },
                {
                  type: "vertical",
                  position: centerX,
                  start: -2000,
                  end: 2000,
                  isEqualSpacing: true,
                  gapSize: leftGap,
                },
                {
                  type: "vertical",
                  position: centerX + panelWidth,
                  start: -2000,
                  end: 2000,
                  isEqualSpacing: true,
                  gapSize: rightGap,
                },
                {
                  type: "vertical",
                  position: gapEnd,
                  start: -2000,
                  end: 2000,
                  isEqualSpacing: true,
                  gapSize: rightGap,
                },
              ],
            });
          }
        }
      }

      // For Y-axis: find panels that are vertically aligned (overlapping in X)
      const panelLeft = rawX;
      const panelRight = rawX + panelWidth;

      const verticalNeighbors = panelEdges
        .filter((p) => p.right > panelLeft && p.left < panelRight)
        .sort((a, b) => a.bottom - b.bottom);

      for (let i = 0; i < verticalNeighbors.length - 1; i++) {
        const bottomPanel = verticalNeighbors[i];
        const topPanel = verticalNeighbors[i + 1];
        const gapStart = bottomPanel.top;
        const gapEnd = topPanel.bottom;
        const gapHeight = gapEnd - gapStart;

        if (gapHeight >= panelHeight) {
          const centerY = gapStart + (gapHeight - panelHeight) / 2;
          const bottomGap = centerY - gapStart;
          const topGap = gapEnd - (centerY + panelHeight);

          if (Math.abs(bottomGap - topGap) < 1) {
            snaps.push({
              axis: "y",
              position: centerY,
              gap: bottomGap,
              guides: [
                {
                  type: "horizontal",
                  position: gapStart,
                  start: -2000,
                  end: 2000,
                  isEqualSpacing: true,
                  gapSize: bottomGap,
                },
                {
                  type: "horizontal",
                  position: centerY,
                  start: -2000,
                  end: 2000,
                  isEqualSpacing: true,
                  gapSize: bottomGap,
                },
                {
                  type: "horizontal",
                  position: centerY + panelHeight,
                  start: -2000,
                  end: 2000,
                  isEqualSpacing: true,
                  gapSize: topGap,
                },
                {
                  type: "horizontal",
                  position: gapEnd,
                  start: -2000,
                  end: 2000,
                  isEqualSpacing: true,
                  gapSize: topGap,
                },
              ],
            });
          }
        }
      }

      // Also find positions that match existing gaps (distribute evenly)
      // Look for repeated gap patterns
      const xGaps: number[] = [];
      for (let i = 0; i < horizontalNeighbors.length - 1; i++) {
        xGaps.push(
          horizontalNeighbors[i + 1].left - horizontalNeighbors[i].right,
        );
      }

      // If there's a consistent gap size, snap to positions that maintain it
      if (xGaps.length > 0) {
        const commonGap = xGaps[0]; // Use the first gap as reference

        // Snap positions that would create the same gap on either side
        for (const panel of horizontalNeighbors) {
          // Position to create same gap to the right of this panel
          const snapRight = panel.right + commonGap;
          if (Math.abs(rawX - snapRight) < SNAP_THRESHOLD / zoom) {
            snaps.push({
              axis: "x",
              position: snapRight,
              gap: commonGap,
              guides: [
                {
                  type: "vertical",
                  position: snapRight,
                  start: -2000,
                  end: 2000,
                  isEqualSpacing: true,
                  gapSize: commonGap,
                },
              ],
            });
          }
          // Position to create same gap to the left of this panel
          const snapLeft = panel.left - panelWidth - commonGap;
          if (Math.abs(rawX - snapLeft) < SNAP_THRESHOLD / zoom) {
            snaps.push({
              axis: "x",
              position: snapLeft,
              gap: commonGap,
              guides: [
                {
                  type: "vertical",
                  position: snapLeft + panelWidth,
                  start: -2000,
                  end: 2000,
                  isEqualSpacing: true,
                  gapSize: commonGap,
                },
              ],
            });
          }
        }
      }

      const yGaps: number[] = [];
      for (let i = 0; i < verticalNeighbors.length - 1; i++) {
        yGaps.push(verticalNeighbors[i + 1].bottom - verticalNeighbors[i].top);
      }

      if (yGaps.length > 0) {
        const commonGap = yGaps[0];

        for (const panel of verticalNeighbors) {
          const snapAbove = panel.top + commonGap;
          if (Math.abs(rawY - snapAbove) < SNAP_THRESHOLD / zoom) {
            snaps.push({
              axis: "y",
              position: snapAbove,
              gap: commonGap,
              guides: [
                {
                  type: "horizontal",
                  position: snapAbove,
                  start: -2000,
                  end: 2000,
                  isEqualSpacing: true,
                  gapSize: commonGap,
                },
              ],
            });
          }
          const snapBelow = panel.bottom - panelHeight - commonGap;
          if (Math.abs(rawY - snapBelow) < SNAP_THRESHOLD / zoom) {
            snaps.push({
              axis: "y",
              position: snapBelow,
              gap: commonGap,
              guides: [
                {
                  type: "horizontal",
                  position: snapBelow + panelHeight,
                  start: -2000,
                  end: 2000,
                  isEqualSpacing: true,
                  gapSize: commonGap,
                },
              ],
            });
          }
        }
      }

      return snaps;
    },
    [getSnapPoints, zoom],
  );

  const findSnapPosition = useCallback(
    (
      excludeIds: string[],
      rawX: number,
      rawY: number,
      panelWidth: number,
      panelHeight: number,
    ) => {
      const { points: snapPoints } = getSnapPoints(excludeIds);
      const guides: SnapGuide[] = [];
      let snappedX = rawX,
        snappedY = rawY;

      const edges = {
        left: rawX,
        centerX: rawX + panelWidth / 2,
        right: rawX + panelWidth,
        bottom: rawY,
        centerY: rawY + panelHeight / 2,
        top: rawY + panelHeight,
      };

      let minXDiff = SNAP_THRESHOLD / zoom;
      (["left", "centerX", "right"] as const).forEach((edge) => {
        snapPoints.x.forEach((snapX) => {
          const diff = Math.abs(edges[edge] - snapX);
          if (diff < minXDiff) {
            minXDiff = diff;
            snappedX =
              edge === "left"
                ? snapX
                : edge === "centerX"
                  ? snapX - panelWidth / 2
                  : snapX - panelWidth;
            guides.push({
              type: "vertical",
              position: snapX,
              start: -2000,
              end: 2000,
            });
          }
        });
      });

      let minYDiff = SNAP_THRESHOLD / zoom;
      (["bottom", "centerY", "top"] as const).forEach((edge) => {
        snapPoints.y.forEach((snapY) => {
          const diff = Math.abs(edges[edge] - snapY);
          if (diff < minYDiff) {
            minYDiff = diff;
            snappedY =
              edge === "bottom"
                ? snapY
                : edge === "centerY"
                  ? snapY - panelHeight / 2
                  : snapY - panelHeight;
            guides.push({
              type: "horizontal",
              position: snapY,
              start: -2000,
              end: 2000,
            });
          }
        });
      });

      // Check equal spacing snaps - these take priority when close
      const equalSnaps = findEqualSpacingSnaps(
        excludeIds,
        panelWidth,
        panelHeight,
        rawX,
        rawY,
      );
      for (const snap of equalSnaps) {
        if (snap.axis === "x") {
          const diff = Math.abs(rawX - snap.position);
          if (diff < SNAP_THRESHOLD / zoom && diff < minXDiff + 5) {
            snappedX = snap.position;
            guides.push(...snap.guides);
          }
        } else {
          const diff = Math.abs(rawY - snap.position);
          if (diff < SNAP_THRESHOLD / zoom && diff < minYDiff + 5) {
            snappedY = snap.position;
            guides.push(...snap.guides);
          }
        }
      }

      return { x: snappedX, y: snappedY, guides };
    },
    [getSnapPoints, findEqualSpacingSnaps, zoom],
  );

  // Find which panel contains a given point (if any)
  const findPanelAtPoint = useCallback(
    (worldX: number, worldY: number): string | null => {
      for (const panel of panels) {
        const dims = getTrueDimensions(panel, settings.thickness);
        const left = panel.x;
        const right = panel.x + dims.width;
        const bottom = panel.y;
        const top = panel.y + dims.height;
        
        if (worldX >= left && worldX <= right && worldY >= bottom && worldY <= top) {
          return panel.id;
        }
      }
      return null;
    },
    [panels, settings.thickness],
  );

  // Snap a point to panel edges/corners for measurement tool
  // Returns the snapped point and which panel it belongs to
  const snapMeasurePoint = useCallback(
    (worldX: number, worldY: number, constrainToStraight: boolean, startPoint?: { x: number; y: number }, startPanelId?: string) => {
      const MEASURE_SNAP_THRESHOLD = 15 / zoom;
      let snappedX = worldX;
      let snappedY = worldY;
      let snappedToPanel = false;
      
      // First check if point is inside any panel
      let snappedPanelId: string | null = findPanelAtPoint(worldX, worldY);

      // Collect all panel edge points with panel ID
      const snapTargets: { x: number; y: number; type: string; panelId: string }[] = [];
      
      panels.forEach((panel) => {
        const dims = getTrueDimensions(panel, settings.thickness);
        const left = panel.x;
        const right = panel.x + dims.width;
        const bottom = panel.y;
        const top = panel.y + dims.height;
        const centerX = (left + right) / 2;
        const centerY = (bottom + top) / 2;

        // Corners
        snapTargets.push({ x: left, y: bottom, type: "corner", panelId: panel.id });
        snapTargets.push({ x: right, y: bottom, type: "corner", panelId: panel.id });
        snapTargets.push({ x: left, y: top, type: "corner", panelId: panel.id });
        snapTargets.push({ x: right, y: top, type: "corner", panelId: panel.id });
        
        // Edge midpoints
        snapTargets.push({ x: centerX, y: bottom, type: "edge", panelId: panel.id });
        snapTargets.push({ x: centerX, y: top, type: "edge", panelId: panel.id });
        snapTargets.push({ x: left, y: centerY, type: "edge", panelId: panel.id });
        snapTargets.push({ x: right, y: centerY, type: "edge", panelId: panel.id });
        
        // Center
        snapTargets.push({ x: centerX, y: centerY, type: "center", panelId: panel.id });
      });

      // Find closest snap target
      let minDist = MEASURE_SNAP_THRESHOLD;
      for (const target of snapTargets) {
        const dist = Math.sqrt(Math.pow(target.x - worldX, 2) + Math.pow(target.y - worldY, 2));
        if (dist < minDist) {
          minDist = dist;
          snappedX = target.x;
          snappedY = target.y;
          snappedToPanel = true;
          snappedPanelId = target.panelId;
        }
      }

      // Constrain to straight line (horizontal or vertical) unless shift is held
      if (constrainToStraight && startPoint) {
        const dx = Math.abs(snappedX - startPoint.x);
        const dy = Math.abs(snappedY - startPoint.y);
        
        if (dx > dy) {
          // More horizontal - snap to horizontal line
          snappedY = startPoint.y;
        } else {
          // More vertical - snap to vertical line
          snappedX = startPoint.x;
        }
        
        // After constraining to axis, try to snap to panel edges on that axis
        if (dx > dy) {
          // Horizontal line - look for vertical edges at this Y
          let minXDist = MEASURE_SNAP_THRESHOLD;
          for (const target of snapTargets) {
            if (Math.abs(target.y - snappedY) < MEASURE_SNAP_THRESHOLD) {
              const xDist = Math.abs(target.x - worldX);
              if (xDist < minXDist) {
                minXDist = xDist;
                snappedX = target.x;
                snappedToPanel = true;
                snappedPanelId = target.panelId;
              }
            }
          }
        } else {
          // Vertical line - look for horizontal edges at this X
          let minYDist = MEASURE_SNAP_THRESHOLD;
          for (const target of snapTargets) {
            if (Math.abs(target.x - snappedX) < MEASURE_SNAP_THRESHOLD) {
              const yDist = Math.abs(target.y - worldY);
              if (yDist < minYDist) {
                minYDist = yDist;
                snappedY = target.y;
                snappedToPanel = true;
                snappedPanelId = target.panelId;
              }
            }
          }
        }
      }

      return { x: snappedX, y: snappedY, snapped: snappedToPanel, panelId: snappedPanelId };
    },
    [panels, settings.thickness, zoom, findPanelAtPoint],
  );

  // Calculate the inner gap between two panels
  const calculatePanelGap = useCallback(
    (panelAId: string, panelBId: string) => {
      const panelA = panels.find(p => p.id === panelAId);
      const panelB = panels.find(p => p.id === panelBId);
      if (!panelA || !panelB) return null;

      const dimsA = getTrueDimensions(panelA, settings.thickness);
      const dimsB = getTrueDimensions(panelB, settings.thickness);

      // Get bounds for both panels
      const aLeft = panelA.x, aRight = panelA.x + dimsA.width;
      const aBottom = panelA.y, aTop = panelA.y + dimsA.height;
      const bLeft = panelB.x, bRight = panelB.x + dimsB.width;
      const bBottom = panelB.y, bTop = panelB.y + dimsB.height;

      // Check horizontal gap (panels side by side)
      const horizontalOverlap = !(aRight < bLeft || bRight < aLeft);
      const verticalOverlap = !(aTop < bBottom || bTop < aBottom);

      // Determine the gap direction
      let gapStart: { x: number; y: number } | null = null;
      let gapEnd: { x: number; y: number } | null = null;

      if (!horizontalOverlap) {
        // Panels are horizontally separated
        const verticalCenter = (Math.max(aBottom, bBottom) + Math.min(aTop, bTop)) / 2;
        // Use the actual overlap center, or midpoint if no overlap
        const yPos = verticalOverlap 
          ? verticalCenter 
          : (aBottom + aTop + bBottom + bTop) / 4;

        if (aRight <= bLeft) {
          // A is to the left of B
          gapStart = { x: aRight, y: yPos };
          gapEnd = { x: bLeft, y: yPos };
        } else {
          // B is to the left of A
          gapStart = { x: bRight, y: yPos };
          gapEnd = { x: aLeft, y: yPos };
        }
      } else if (!verticalOverlap) {
        // Panels are vertically separated
        const horizontalCenter = (Math.max(aLeft, bLeft) + Math.min(aRight, bRight)) / 2;
        const xPos = horizontalOverlap 
          ? horizontalCenter 
          : (aLeft + aRight + bLeft + bRight) / 4;

        if (aTop <= bBottom) {
          // A is below B
          gapStart = { x: xPos, y: aTop };
          gapEnd = { x: xPos, y: bBottom };
        } else {
          // B is below A
          gapStart = { x: xPos, y: bTop };
          gapEnd = { x: xPos, y: aBottom };
        }
      }
      // If panels overlap in both directions, no clear gap

      return gapStart && gapEnd ? { start: gapStart, end: gapEnd } : null;
    },
    [panels, settings.thickness],
  );

  // ===========================================================================
  // EFFECTS
  // ===========================================================================

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) setCanvasSize({ width, height });
      }
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const handleZoomIn = useCallback(
    () => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP)),
    [],
  );
  const handleZoomOut = useCallback(
    () => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP)),
    [],
  );
  const handleResetZoom = useCallback(() => {
    setZoom(DEFAULT_ZOOM);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleFitToContent = useCallback(() => {
    if (panels.length === 0) {
      handleResetZoom();
      return;
    }
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    panels.forEach((p) => {
      const dims = getTrueDimensions(p, settings.thickness);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + dims.width);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y + dims.height);
    });
    const contentWidth = maxX - minX + 100,
      contentHeight = maxY - minY + 100;
    const centerX = (minX + maxX) / 2,
      centerY = (minY + maxY) / 2;
    const fitZoom = Math.max(
      MIN_ZOOM,
      Math.min(
        MAX_ZOOM,
        Math.min(
          canvasSize.width / contentWidth,
          canvasSize.height / contentHeight,
          1,
        ),
      ),
    );
    setZoom(fitZoom);
    setPan({ x: -centerX * fitZoom, y: centerY * fitZoom });
  }, [panels, handleResetZoom, canvasSize, settings.thickness]);

  useEffect(() => {
    if (
      hasAutoCentered.current ||
      panels.length === 0 ||
      canvasSize.width === 0
    )
      return;
    const timer = setTimeout(() => {
      handleFitToContent();
      hasAutoCentered.current = true;
    }, 100);
    return () => clearTimeout(timer);
  }, [panels.length, canvasSize, handleFitToContent]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    // Use refs to track pending updates for RAF batching
    let pendingZoom: number | null = null;
    let pendingPan: { x: number; y: number } | null = null;
    let rafId: number | null = null;
    
    const flushUpdates = () => {
      if (pendingZoom !== null) {
        setZoomLocal(pendingZoom);
        updateViewState({ zoom: pendingZoom });
        pendingZoom = null;
      }
      if (pendingPan !== null) {
        setPanLocal(pendingPan);
        updateViewState({ panX: pendingPan.x, panY: pendingPan.y });
        pendingPan = null;
      }
      rafId = null;
    };
    
    const scheduleUpdate = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(flushUpdates);
      }
    };
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Pinch zoom on trackpad - zoom toward cursor
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Current state (use pending values if they exist)
        const currentZoom = pendingZoom ?? zoom;
        const currentPan = pendingPan ?? pan;
        
        // Calculate new zoom
        const zoomFactor = 0.01;
        const delta = -e.deltaY * zoomFactor;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * (1 + delta)));
        
        // Calculate the world point under the cursor before zoom
        // viewBoxX = -pan.x / zoom - viewBoxWidth / 2
        // viewBoxWidth = canvasSize.width / zoom
        // So: worldX at cursor = viewBoxX + (mouseX / canvasSize.width) * viewBoxWidth
        //                      = -pan.x / zoom - canvasSize.width / zoom / 2 + mouseX / zoom
        //                      = (-pan.x - canvasSize.width / 2 + mouseX) / zoom
        const worldX = (-currentPan.x - rect.width / 2 + mouseX) / currentZoom;
        const worldY = (-currentPan.y - rect.height / 2 + mouseY) / currentZoom;
        
        // After zoom, we want the same world point to be under the cursor
        // worldX = (-newPan.x - rect.width / 2 + mouseX) / newZoom
        // Solving for newPan.x:
        // newPan.x = -worldX * newZoom - rect.width / 2 + mouseX
        const newPanX = -worldX * newZoom - rect.width / 2 + mouseX;
        const newPanY = -worldY * newZoom - rect.height / 2 + mouseY;
        
        pendingZoom = newZoom;
        pendingPan = { x: newPanX, y: newPanY };
        scheduleUpdate();
      } else {
        // Two-finger pan on trackpad
        const currentPan = pendingPan ?? pan;
        pendingPan = { x: currentPan.x - e.deltaX, y: currentPan.y - e.deltaY };
        scheduleUpdate();
      }
    };
    
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [updateViewState, zoom, pan]);

  // Cleanup RAF refs on unmount
  useEffect(() => {
    return () => {
      if (mouseMoveRafRef.current !== null) {
        cancelAnimationFrame(mouseMoveRafRef.current);
      }
    };
  }, []);

  // ===========================================================================
  // MOUSE HANDLERS
  // ===========================================================================

  const getSVGPoint = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  // Convert screen point to world coordinates
  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => {
      const worldX = viewBoxX + screenX / zoom;
      const worldY = screenToWorldY(viewBoxY + screenY / zoom);
      return { x: worldX, y: worldY };
    },
    [viewBoxX, viewBoxY, zoom],
  );

  const handleMouseDown = useCallback(
    (
      e: React.MouseEvent,
      panel: Panel,
      action: "drag" | "resize",
      corner?: string,
    ) => {
      e.stopPropagation();
      setDragStart(getSVGPoint(e));
      setPanelStart({
        x: panel.x,
        y: panel.y,
        width: panel.width,
        height: panel.height,
      });
      setDragAxis("free");
      setHasDuplicatedOnDrag(false);

      // Save to history before drag/resize starts (for undo)
      saveToHistory();

      if (action === "drag") {
        const isAlreadySelected = selectedPanelIds.includes(panel.id);

        // Alt+drag = duplicate
        if (e.altKey) {
          // Duplicate all selected panels if this panel is selected, otherwise just this one
          const panelsToDuplicate = isAlreadySelected
            ? panels.filter((p) => selectedPanelIds.includes(p.id))
            : [panel];
          const newPanels = panelsToDuplicate.map((p) => ({
            ...p,
            id: `panel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            label: `${p.label} copy`,
          }));
          useDesignStore.setState({
            panels: [...useDesignStore.getState().panels, ...newPanels],
          });
          selectPanels(newPanels.map((p) => p.id));
          setDragging(newPanels[0].id);
          setDraggingMultiple(newPanels.length > 1);
          // Store start positions for all new panels
          const startPos = new Map<string, { x: number; y: number }>();
          newPanels.forEach((p) => startPos.set(p.id, { x: p.x, y: p.y }));
          setDragStartPositions(startPos);
          setHasDuplicatedOnDrag(true);
        } else {
          // Shift+click = add to selection
          if (e.shiftKey) {
            selectPanel(panel.id, true);
            setDragging(panel.id);
          } else if (isAlreadySelected && selectedPanelIds.length > 1) {
            // Dragging one of multiple selected panels - move all
            setDragging(panel.id);
            setDraggingMultiple(true);
            // Store start positions for all selected panels
            const startPos = new Map<string, { x: number; y: number }>();
            panels
              .filter((p) => selectedPanelIds.includes(p.id))
              .forEach((p) => startPos.set(p.id, { x: p.x, y: p.y }));
            setDragStartPositions(startPos);
          } else {
            // Single selection
            selectPanel(panel.id);
            setDragging(panel.id);
            setDraggingMultiple(false);
          }
        }
      } else if (action === "resize" && corner) {
        selectPanel(panel.id);
        setResizing({ id: panel.id, corner });
      }
    },
    [
      selectPanel,
      selectPanels,
      selectedPanelIds,
      panels,
      getSVGPoint,
      saveToHistory,
    ],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Handle measure tool preview
      if (tool === "measure" && measurePoints.length === 1) {
        const point = getSVGPoint(e);
        const worldPoint = screenToWorld(point.x, point.y);
        // Shift key allows free (diagonal) measurement
        const constrainToStraight = !shiftHeld;
        const snapped = snapMeasurePoint(worldPoint.x, worldPoint.y, constrainToStraight, measurePoints[0]);
        setMeasurePreview({ x: snapped.x, y: snapped.y });
        return;
      }
      
      // Handle sticky note dragging
      if (draggingNote) {
        const point = getSVGPoint(e);
        const dxScreen = point.x - dragStart.x;
        const dyScreen = point.y - dragStart.y;
        const dxWorld = dxScreen / zoom;
        const dyWorld = -dyScreen / zoom; // Invert for Y-up
        updateStickyNote(draggingNote, {
          x: noteStart.x + dxWorld,
          y: noteStart.y + dyWorld,
        });
        return;
      }

      // Handle marquee selection
      if (isMarqueeSelecting) {
        const point = getSVGPoint(e);
        const worldPoint = screenToWorld(point.x, point.y);
        setMarqueeEnd({ x: worldPoint.x, y: worldPoint.y });

        // Find panels within marquee
        const minX = Math.min(marqueeStart.x, worldPoint.x);
        const maxX = Math.max(marqueeStart.x, worldPoint.x);
        const minY = Math.min(marqueeStart.y, worldPoint.y);
        const maxY = Math.max(marqueeStart.y, worldPoint.y);

        const selectedIds = panels
          .filter((p) => {
            const dims = getTrueDimensions(p, settings.thickness);
            const panelMinX = p.x;
            const panelMaxX = p.x + dims.width;
            const panelMinY = p.y;
            const panelMaxY = p.y + dims.height;
            // Check if panel intersects with marquee
            return (
              panelMinX < maxX &&
              panelMaxX > minX &&
              panelMinY < maxY &&
              panelMaxY > minY
            );
          })
          .map((p) => p.id);

        selectPanels(selectedIds);
        return;
      }

      if (isPanning) {
        setPan((p) => ({
          x: p.x + e.clientX - panStart.x,
          y: p.y + e.clientY - panStart.y,
        }));
        setPanStart({ x: e.clientX, y: e.clientY });
        return;
      }
      if (!dragging && !resizing) return;

      const point = getSVGPoint(e);
      let dxWorld = (point.x - dragStart.x) / zoom;
      let dyWorld = -(point.y - dragStart.y) / zoom;

      if (dragging) {
        // Shift key = constrain to axis
        if (e.shiftKey && !isMarqueeSelecting) {
          const threshold = 5 / zoom;
          if (dragAxis === "free") {
            if (
              Math.abs(dxWorld) > threshold ||
              Math.abs(dyWorld) > threshold
            ) {
              setDragAxis(
                Math.abs(dxWorld) > Math.abs(dyWorld)
                  ? "horizontal"
                  : "vertical",
              );
            }
          }
          if (dragAxis === "horizontal") dyWorld = 0;
          else if (dragAxis === "vertical") dxWorld = 0;
        } else {
          if (dragAxis !== "free") setDragAxis("free");
        }

        // Move all selected panels if dragging multiple
        if (draggingMultiple && dragStartPositions.size > 0) {
          const disableSnap = e.ctrlKey || e.metaKey;

          // For multi-select, snap based on the primary dragged panel
          const primaryPanel = panels.find((p) => p.id === dragging);
          if (!primaryPanel) return;

          const trueDims = getTrueDimensions(primaryPanel, settings.thickness);
          const primaryStartPos = dragStartPositions.get(primaryPanel.id);
          if (!primaryStartPos) return;

          const rawX = primaryStartPos.x + dxWorld;
          const rawY = primaryStartPos.y + dyWorld;

          let finalX = rawX,
            finalY = rawY;

          if (disableSnap) {
            setSnapGuides([]);
            finalX = Math.round(rawX / GRID_SIZE) * GRID_SIZE;
            finalY = Math.round(rawY / GRID_SIZE) * GRID_SIZE;
          } else {
            const {
              x: snappedX,
              y: snappedY,
              guides,
            } = findSnapPosition(
              selectedPanelIds,
              rawX,
              rawY,
              trueDims.width,
              trueDims.height,
            );
            setSnapGuides(guides);
            finalX = guides.some((g) => g.type === "vertical")
              ? snappedX
              : Math.round(rawX / GRID_SIZE) * GRID_SIZE;
            finalY = guides.some((g) => g.type === "horizontal")
              ? snappedY
              : Math.round(rawY / GRID_SIZE) * GRID_SIZE;
          }

          // Calculate delta from snapped primary position
          const deltaX = finalX - primaryStartPos.x;
          const deltaY = finalY - primaryStartPos.y;

          // Move all selected panels by the same delta
          panels
            .filter((p) => selectedPanelIds.includes(p.id))
            .forEach((p) => {
              const startPos = dragStartPositions.get(p.id);
              if (startPos) {
                updatePanel(p.id, {
                  x: Math.round((startPos.x + deltaX) / GRID_SIZE) * GRID_SIZE,
                  y: Math.round((startPos.y + deltaY) / GRID_SIZE) * GRID_SIZE,
                });
              }
            });
        } else {
          // Single panel drag with snapping
          const draggedPanel = panels.find((p) => p.id === dragging);
          if (!draggedPanel) return;

          const trueDims = getTrueDimensions(draggedPanel, settings.thickness);
          const rawX = panelStart.x + dxWorld,
            rawY = panelStart.y + dyWorld;

          if (e.ctrlKey || e.metaKey) {
            setSnapGuides([]);
            const finalX = Math.round(rawX / GRID_SIZE) * GRID_SIZE;
            const finalY = Math.round(rawY / GRID_SIZE) * GRID_SIZE;
            updatePanel(dragging, { x: finalX, y: finalY });
          } else {
            const {
              x: snappedX,
              y: snappedY,
              guides,
            } = findSnapPosition(
              [dragging],
              rawX,
              rawY,
              trueDims.width,
              trueDims.height,
            );
            setSnapGuides(guides);
            const finalX = guides.some((g) => g.type === "vertical")
              ? snappedX
              : Math.round(rawX / GRID_SIZE) * GRID_SIZE;
            const finalY = guides.some((g) => g.type === "horizontal")
              ? snappedY
              : Math.round(rawY / GRID_SIZE) * GRID_SIZE;
            updatePanel(dragging, { x: finalX, y: finalY });
          }
        }
      } else if (resizing) {
        const { corner } = resizing;
        let newWidth = panelStart.width,
          newHeight = panelStart.height,
          newX = panelStart.x,
          newY = panelStart.y;
        if (corner.includes("e"))
          newWidth = Math.max(50, panelStart.width + dxWorld);
        if (corner.includes("w")) {
          newWidth = Math.max(50, panelStart.width - dxWorld);
          newX = panelStart.x + panelStart.width - newWidth;
        }
        if (corner.includes("n"))
          newHeight = Math.max(50, panelStart.height + dyWorld);
        if (corner.includes("s")) {
          newHeight = Math.max(50, panelStart.height - dyWorld);
          newY = panelStart.y + panelStart.height - newHeight;
        }
        updatePanel(resizing.id, {
          x: Math.round(newX / GRID_SIZE) * GRID_SIZE,
          y: Math.round(newY / GRID_SIZE) * GRID_SIZE,
          width: Math.round(newWidth / GRID_SIZE) * GRID_SIZE,
          height: Math.round(newHeight / GRID_SIZE) * GRID_SIZE,
        });
      }
    },
    [
      dragging,
      draggingMultiple,
      dragStartPositions,
      resizing,
      dragStart,
      panelStart,
      getSVGPoint,
      screenToWorld,
      updatePanel,
      isPanning,
      panStart,
      zoom,
      panels,
      settings.thickness,
      findSnapPosition,
      isMarqueeSelecting,
      marqueeStart,
      selectPanels,
      selectedPanelIds,
      dragAxis,
      draggingNote,
      noteStart,
      updateStickyNote,
      tool,
      measurePoints,
      shiftHeld,
      snapMeasurePoint,
    ],
  );

  // RAF-wrapped mouse move handler for smoother updates
  const handleMouseMoveThrottled = useCallback(
    (e: React.MouseEvent) => {
      // Store the latest event
      pendingMouseEvent.current = e;
      
      // If we already have a pending RAF, skip scheduling another
      if (mouseMoveRafRef.current !== null) return;
      
      mouseMoveRafRef.current = requestAnimationFrame(() => {
        mouseMoveRafRef.current = null;
        if (pendingMouseEvent.current) {
          handleMouseMove(pendingMouseEvent.current);
        }
      });
    },
    [handleMouseMove],
  );

  const handleMouseUp = useCallback(() => {
    // Cancel any pending RAF on mouse up
    if (mouseMoveRafRef.current !== null) {
      cancelAnimationFrame(mouseMoveRafRef.current);
      mouseMoveRafRef.current = null;
    }
    setDragging(null);
    setDraggingMultiple(false);
    setDragStartPositions(new Map());
    setResizing(null);
    setIsPanning(false);
    setSnapGuides([]);
    setDragAxis("free");
    setHasDuplicatedOnDrag(false);
    setIsMarqueeSelecting(false);
    setDraggingNote(null);
  }, []);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      // If measure tool is active, add measurement point
      if (tool === "measure") {
        const point = getSVGPoint(e);
        const worldPoint = screenToWorld(point.x, point.y);
        
        // Shift key allows free (diagonal) measurement, otherwise constrain to straight
        const constrainToStraight = !shiftHeld;
        
        // Check if clicking directly inside a panel (for panel-to-panel gap measurement)
        const clickedPanelId = findPanelAtPoint(worldPoint.x, worldPoint.y);
        
        if (measurePoints.length === 0) {
          // First click
          if (clickedPanelId) {
            // Clicked inside a panel - store the panel ID for potential gap measurement
            // But also snap to nearest edge point for visual feedback
            const snapped = snapMeasurePoint(worldPoint.x, worldPoint.y, false);
            setMeasurePoints([{ x: snapped.x, y: snapped.y, panelId: clickedPanelId }]);
          } else {
            // Clicked outside panels - snap to panel edges
            const snapped = snapMeasurePoint(worldPoint.x, worldPoint.y, false);
            setMeasurePoints([{ x: snapped.x, y: snapped.y, panelId: snapped.panelId }]);
          }
        } else if (measurePoints.length === 1) {
          // Second click
          const firstPanelId = measurePoints[0].panelId;
          
          // If clicking on two different panels, auto-calculate the gap
          if (firstPanelId && clickedPanelId && firstPanelId !== clickedPanelId) {
            const gap = calculatePanelGap(firstPanelId, clickedPanelId);
            if (gap) {
              setMeasurePoints([
                { x: gap.start.x, y: gap.start.y, panelId: firstPanelId },
                { x: gap.end.x, y: gap.end.y, panelId: clickedPanelId }
              ]);
              setMeasurePreview(null);
              return;
            }
          }
          
          // Otherwise use the snapped point (for edge-to-edge or point measurement)
          const snapped = snapMeasurePoint(worldPoint.x, worldPoint.y, constrainToStraight, measurePoints[0]);
          setMeasurePoints([measurePoints[0], { x: snapped.x, y: snapped.y, panelId: snapped.panelId }]);
          setMeasurePreview(null);
        } else {
          // Third click - start new measurement
          if (clickedPanelId) {
            const snapped = snapMeasurePoint(worldPoint.x, worldPoint.y, false);
            setMeasurePoints([{ x: snapped.x, y: snapped.y, panelId: clickedPanelId }]);
          } else {
            const snapped = snapMeasurePoint(worldPoint.x, worldPoint.y, false);
            setMeasurePoints([{ x: snapped.x, y: snapped.y, panelId: snapped.panelId }]);
          }
        }
        return;
      }
      
      // If sticky note tool is active, add a new note
      if (stickyNoteTool) {
        const point = getSVGPoint(e);
        const worldPoint = screenToWorld(point.x, point.y);
        addStickyNote(worldPoint.x, worldPoint.y);
        setStickyNoteTool(false);
        return;
      }
      if (e.target === svgRef.current) selectPanel(null);
    },
    [selectPanel, stickyNoteTool, tool, measurePoints, shiftHeld, getSVGPoint, screenToWorld, addStickyNote, snapMeasurePoint, calculatePanelGap, findPanelAtPoint],
  );

  // Auto-stretch panel to fit between adjacent panels of opposite orientation
  const handlePanelDoubleClick = useCallback(
    (panel: Panel) => {
      const orientation = panel.orientation || "horizontal";
      const trueDims = getTrueDimensions(panel, settings.thickness);
      
      // Get panel bounds in world coordinates
      const panelLeft = panel.x;
      const panelRight = panel.x + trueDims.width;
      const panelBottom = panel.y;
      const panelTop = panel.y + trueDims.height;
      const panelCenterX = (panelLeft + panelRight) / 2;
      const panelCenterY = (panelBottom + panelTop) / 2;
      
      if (orientation === "horizontal") {
        // Shelf: look for dividers (vertical panels) on left and right
        // Find vertical panels that overlap vertically with this shelf
        const verticalPanels = panels.filter(p => {
          if (p.id === panel.id) return false;
          if ((p.orientation || "horizontal") !== "vertical") return false;
          const dims = getTrueDimensions(p, settings.thickness);
          const pBottom = p.y;
          const pTop = p.y + dims.height;
          // Check vertical overlap - the divider should span the shelf's Y position
          return pBottom <= panelCenterY && pTop >= panelCenterY;
        });
        
        // Find closest divider on left (its right edge is to the left of panel's left edge)
        let leftBound: number | null = null;
        let leftDivider: Panel | null = null;
        verticalPanels.forEach(p => {
          const dims = getTrueDimensions(p, settings.thickness);
          const dividerRight = p.x + dims.width;
          if (dividerRight <= panelLeft + 1) { // +1 for tolerance
            if (leftBound === null || dividerRight > leftBound) {
              leftBound = dividerRight;
              leftDivider = p;
            }
          }
        });
        
        // Find closest divider on right (its left edge is to the right of panel's right edge)
        let rightBound: number | null = null;
        let rightDivider: Panel | null = null;
        verticalPanels.forEach(p => {
          const dividerLeft = p.x;
          if (dividerLeft >= panelRight - 1) { // -1 for tolerance
            if (rightBound === null || dividerLeft < rightBound) {
              rightBound = dividerLeft;
              rightDivider = p;
            }
          }
        });
        
        // Stretch to fit between dividers if found
        if (leftBound !== null || rightBound !== null) {
          saveToHistory();
          const newLeft = leftBound !== null ? leftBound : panelLeft;
          const newRight = rightBound !== null ? rightBound : panelRight;
          const newWidth = newRight - newLeft;
          
          // For horizontal panels, width is the visible dimension
          updatePanel(panel.id, {
            x: newLeft,
            width: newWidth,
          });
        }
      } else if (orientation === "vertical") {
        // Divider: look for shelves (horizontal panels) above and below
        // Find horizontal panels that overlap horizontally with this divider
        const horizontalPanels = panels.filter(p => {
          if (p.id === panel.id) return false;
          if ((p.orientation || "horizontal") !== "horizontal") return false;
          const dims = getTrueDimensions(p, settings.thickness);
          const pLeft = p.x;
          const pRight = p.x + dims.width;
          // Check horizontal overlap - the shelf should span the divider's X position
          return pLeft <= panelCenterX && pRight >= panelCenterX;
        });
        
        // Find closest shelf below (its top edge is below panel's bottom edge)
        let bottomBound: number | null = null;
        horizontalPanels.forEach(p => {
          const dims = getTrueDimensions(p, settings.thickness);
          const shelfTop = p.y + dims.height;
          if (shelfTop <= panelBottom + 1) { // +1 for tolerance
            if (bottomBound === null || shelfTop > bottomBound) {
              bottomBound = shelfTop;
            }
          }
        });
        
        // Find closest shelf above (its bottom edge is above panel's top edge)
        let topBound: number | null = null;
        horizontalPanels.forEach(p => {
          const shelfBottom = p.y;
          if (shelfBottom >= panelTop - 1) { // -1 for tolerance
            if (topBound === null || shelfBottom < topBound) {
              topBound = shelfBottom;
            }
          }
        });
        
        // Stretch to fit between shelves if found
        if (bottomBound !== null || topBound !== null) {
          saveToHistory();
          const newBottom = bottomBound !== null ? bottomBound : panelBottom;
          const newTop = topBound !== null ? topBound : panelTop;
          const newHeight = newTop - newBottom;
          
          // For vertical panels, height is the visible dimension
          updatePanel(panel.id, {
            y: newBottom,
            height: newHeight,
          });
        }
      }
    },
    [panels, settings.thickness, saveToHistory, updatePanel],
  );

  const handleCanvasDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't create panel if clicking on an existing panel or UI element
      const target = e.target as SVGElement;
      if (target.closest("g[data-panel-id]") || target.closest("g[data-note]")) {
        return;
      }
      
      // Create a new panel at the click location
      const point = getSVGPoint(e);
      const worldPoint = screenToWorld(point.x, point.y);
      
      // Center the new panel on the click point (default size is 600x400, but it's a shelf so height is thickness)
      // For a horizontal panel, the visible height is the thickness (18mm default)
      const panelWidth = 600;
      const panelHeight = 400; // This is the depth, visual height will be thickness
      
      addPanel(worldPoint.x - panelWidth / 2, worldPoint.y - settings.thickness / 2);
    },
    [getSVGPoint, screenToWorld, addPanel, settings.thickness],
  );

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || spaceHeld || tool === "pan") {
        e.preventDefault();
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
      } else if (tool === "select" && e.button === 0 && !spaceHeld) {
        // Start marquee selection on empty canvas area
        const target = e.target as SVGElement;
        if (target.tagName === "rect" && !target.closest("g[data-panel]")) {
          const point = getSVGPoint(e);
          const worldPoint = screenToWorld(point.x, point.y);
          setMarqueeStart({ x: worldPoint.x, y: worldPoint.y });
          setMarqueeEnd({ x: worldPoint.x, y: worldPoint.y });
          setIsMarqueeSelecting(true);
          if (!e.shiftKey) selectPanel(null); // Clear selection unless shift held
        }
      }
    },
    [spaceHeld, tool, getSVGPoint, screenToWorld, selectPanel],
  );

  // ===========================================================================
  // KEYBOARD
  // ===========================================================================

  const handleCopy = useCallback(() => {
    const selected = panels.filter((p) => selectedPanelIds.includes(p.id));
    if (selected.length > 0) setClipboard(selected.map((p) => ({ ...p })));
  }, [selectedPanelIds, panels]);

  const handlePaste = useCallback(() => {
    if (clipboard.length === 0) return;
    saveToHistory();
    const newPanels = clipboard.map((p) => ({
      ...p,
      id: `panel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      label: `${p.label} copy`,
      x: p.x + 40,
      y: p.y + 40,
    }));
    useDesignStore.setState({
      panels: [...useDesignStore.getState().panels, ...newPanels],
    });
    selectPanels(newPanels.map((p) => p.id));
  }, [clipboard, selectPanels, saveToHistory]);

  const handleDuplicate = useCallback(() => {
    const selected = panels.filter((p) => selectedPanelIds.includes(p.id));
    if (selected.length === 0) return;
    saveToHistory();
    const newPanels = selected.map((p) => ({
      ...p,
      id: `panel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      label: `${p.label} copy`,
      x: p.x + 40,
      y: p.y + 40,
    }));
    useDesignStore.setState({
      panels: [...useDesignStore.getState().panels, ...newPanels],
    });
    selectPanels(newPanels.map((p) => p.id));
  }, [selectedPanelIds, panels, selectPanels, saveToHistory]);

  const handleCut = useCallback(() => {
    const selected = panels.filter((p) => selectedPanelIds.includes(p.id));
    if (selected.length > 0) {
      setClipboard(selected.map((p) => ({ ...p })));
      saveToHistory();
      deletePanels(selectedPanelIds);
    }
  }, [selectedPanelIds, panels, deletePanels, saveToHistory]);

  // ===========================================================================
  // ALIGNMENT FUNCTIONS
  // ===========================================================================

  const getSelectedPanelsWithBounds = useCallback(() => {
    return panels
      .filter((p) => selectedPanelIds.includes(p.id))
      .map((p) => {
        const dims = getTrueDimensions(p, settings.thickness);
        return {
          ...p,
          right: p.x + dims.width,
          top: p.y + dims.height,
          centerX: p.x + dims.width / 2,
          centerY: p.y + dims.height / 2,
          trueWidth: dims.width,
          trueHeight: dims.height,
        };
      });
  }, [panels, selectedPanelIds, settings.thickness]);

  const handleAlignLeft = useCallback(() => {
    const selected = getSelectedPanelsWithBounds();
    if (selected.length < 2) return;
    saveToHistory();
    const minX = Math.min(...selected.map((p) => p.x));
    selected.forEach((p) => updatePanel(p.id, { x: minX }));
  }, [getSelectedPanelsWithBounds, updatePanel, saveToHistory]);

  const handleAlignCenterH = useCallback(() => {
    const selected = getSelectedPanelsWithBounds();
    if (selected.length < 2) return;
    saveToHistory();
    const minX = Math.min(...selected.map((p) => p.x));
    const maxRight = Math.max(...selected.map((p) => p.right));
    const centerX = (minX + maxRight) / 2;
    selected.forEach((p) => updatePanel(p.id, { x: centerX - p.trueWidth / 2 }));
  }, [getSelectedPanelsWithBounds, updatePanel, saveToHistory]);

  const handleAlignRight = useCallback(() => {
    const selected = getSelectedPanelsWithBounds();
    if (selected.length < 2) return;
    saveToHistory();
    const maxRight = Math.max(...selected.map((p) => p.right));
    selected.forEach((p) => updatePanel(p.id, { x: maxRight - p.trueWidth }));
  }, [getSelectedPanelsWithBounds, updatePanel, saveToHistory]);

  const handleAlignTop = useCallback(() => {
    const selected = getSelectedPanelsWithBounds();
    if (selected.length < 2) return;
    saveToHistory();
    const maxTop = Math.max(...selected.map((p) => p.top));
    selected.forEach((p) => updatePanel(p.id, { y: maxTop - p.trueHeight }));
  }, [getSelectedPanelsWithBounds, updatePanel, saveToHistory]);

  const handleAlignCenterV = useCallback(() => {
    const selected = getSelectedPanelsWithBounds();
    if (selected.length < 2) return;
    saveToHistory();
    const minY = Math.min(...selected.map((p) => p.y));
    const maxTop = Math.max(...selected.map((p) => p.top));
    const centerY = (minY + maxTop) / 2;
    selected.forEach((p) => updatePanel(p.id, { y: centerY - p.trueHeight / 2 }));
  }, [getSelectedPanelsWithBounds, updatePanel, saveToHistory]);

  const handleAlignBottom = useCallback(() => {
    const selected = getSelectedPanelsWithBounds();
    if (selected.length < 2) return;
    saveToHistory();
    const minY = Math.min(...selected.map((p) => p.y));
    selected.forEach((p) => updatePanel(p.id, { y: minY }));
  }, [getSelectedPanelsWithBounds, updatePanel, saveToHistory]);

  const handleDistributeH = useCallback(() => {
    const selected = getSelectedPanelsWithBounds();
    if (selected.length < 3) return;
    saveToHistory();
    const sorted = [...selected].sort((a, b) => a.x - b.x);
    const minX = sorted[0].x;
    const maxRight = sorted[sorted.length - 1].right;
    const totalWidth = sorted.reduce((sum, p) => sum + p.trueWidth, 0);
    const gap = (maxRight - minX - totalWidth) / (sorted.length - 1);
    let currentX = minX;
    sorted.forEach((p, i) => {
      if (i > 0) {
        updatePanel(p.id, { x: currentX });
      }
      currentX += p.trueWidth + gap;
    });
  }, [getSelectedPanelsWithBounds, updatePanel, saveToHistory]);

  const handleDistributeV = useCallback(() => {
    const selected = getSelectedPanelsWithBounds();
    if (selected.length < 3) return;
    saveToHistory();
    const sorted = [...selected].sort((a, b) => a.y - b.y);
    const minY = sorted[0].y;
    const maxTop = sorted[sorted.length - 1].top;
    const totalHeight = sorted.reduce((sum, p) => sum + p.trueHeight, 0);
    const gap = (maxTop - minY - totalHeight) / (sorted.length - 1);
    let currentY = minY;
    sorted.forEach((p, i) => {
      if (i > 0) {
        updatePanel(p.id, { y: currentY });
      }
      currentY += p.trueHeight + gap;
    });
  }, [getSelectedPanelsWithBounds, updatePanel, saveToHistory]);

  const handleMatchWidth = useCallback(() => {
    const selected = getSelectedPanelsWithBounds();
    if (selected.length < 2) return;
    saveToHistory();
    // Match to the first selected panel's width
    const targetWidth = selected[0].width;
    selected.slice(1).forEach((p) => updatePanel(p.id, { width: targetWidth }));
  }, [getSelectedPanelsWithBounds, updatePanel, saveToHistory]);

  const handleMatchHeight = useCallback(() => {
    const selected = getSelectedPanelsWithBounds();
    if (selected.length < 2) return;
    saveToHistory();
    // Match to the first selected panel's height
    const targetHeight = selected[0].height;
    selected.slice(1).forEach((p) => updatePanel(p.id, { height: targetHeight }));
  }, [getSelectedPanelsWithBounds, updatePanel, saveToHistory]);

  // ===========================================================================
  // CONTEXT MENU
  // ===========================================================================

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const contextMenuActions = useMemo(() => {
    return createPanelContextActions({
      hasSelection: selectedPanelIds.length > 0,
      selectionCount: selectedPanelIds.length,
      onCut: handleCut,
      onCopy: handleCopy,
      onPaste: handlePaste,
      onDuplicate: handleDuplicate,
      onDelete: () => {
        if (selectedPanelIds.length === 1) {
          deletePanel(selectedPanelIds[0]);
        } else {
          deletePanels(selectedPanelIds);
        }
      },
      onAlignLeft: handleAlignLeft,
      onAlignCenterH: handleAlignCenterH,
      onAlignRight: handleAlignRight,
      onAlignTop: handleAlignTop,
      onAlignCenterV: handleAlignCenterV,
      onAlignBottom: handleAlignBottom,
      onDistributeH: handleDistributeH,
      onDistributeV: handleDistributeV,
    });
  }, [
    selectedPanelIds,
    handleCut,
    handleCopy,
    handlePaste,
    handleDuplicate,
    deletePanel,
    deletePanels,
    handleAlignLeft,
    handleAlignCenterH,
    handleAlignRight,
    handleAlignTop,
    handleAlignCenterV,
    handleAlignBottom,
    handleDistributeH,
    handleDistributeV,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = (e.target as HTMLElement).tagName === "INPUT";
      // Track modifier keys
      if (e.shiftKey) setShiftHeld(true);
      if (e.altKey) setAltHeld(true);
      if (e.ctrlKey || e.metaKey) setCtrlHeld(true);

      if (e.code === "Space" && !isInput) {
        e.preventDefault();
        setSpaceHeld(true);
      }
      if (e.key === "Escape") {
        selectPanel(null);
        setDragging(null);
        setResizing(null);
        setSnapGuides([]);
        setIsMarqueeSelecting(false);
      }

      // Delete selected panels
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedPanelIds.length > 0 &&
        !isInput
      ) {
        e.preventDefault();
        if (selectedPanelIds.length === 1) {
          deletePanel(selectedPanelIds[0]);
        } else {
          deletePanels(selectedPanelIds);
        }
      }
      if (isInput) return;

      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }

      if (e.key === "=" || e.key === "+") handleZoomIn();
      if (e.key === "-") handleZoomOut();
      if (e.key === "0") handleResetZoom();
      if (e.key === "f") handleFitToContent();
      if (e.key === "v") setTool("select");
      if (e.key === "h") setTool("pan");
      if (e.key === "d" && !e.metaKey && !e.ctrlKey) {
        setTool(tool === "measure" ? "select" : "measure");
        if (tool === "measure") {
          setMeasurePoints([]);
          setMeasurePreview(null);
        }
      }
      if (e.key === "r") setShowRulers((r) => !r);
      if (e.key === "m") setShowMeasurements((m) => !m);
      if (e.key === "n") setStickyNoteTool((n) => !n);
      if (e.key === "Escape" && tool === "measure") {
        setMeasurePoints([]);
        setMeasurePreview(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "c") {
        e.preventDefault();
        handleCopy();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "v") {
        e.preventDefault();
        handlePaste();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        handleDuplicate();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        selectAll();
      }

      // Cut with Cmd+X
      if ((e.metaKey || e.ctrlKey) && e.key === "x") {
        e.preventDefault();
        handleCut();
      }

      // Alignment shortcuts (when multiple panels selected)
      if (selectedPanelIds.length >= 2) {
        // Alt/Option + key for alignment
        if (e.altKey && e.key === "l") {
          e.preventDefault();
          handleAlignLeft();
        }
        if (e.altKey && e.key === "c") {
          e.preventDefault();
          handleAlignCenterH();
        }
        if (e.altKey && e.key === "r") {
          e.preventDefault();
          handleAlignRight();
        }
        if (e.altKey && e.key === "t") {
          e.preventDefault();
          handleAlignTop();
        }
        if (e.altKey && e.key === "m") {
          e.preventDefault();
          handleAlignCenterV();
        }
        if (e.altKey && e.key === "b") {
          e.preventDefault();
          handleAlignBottom();
        }
        // Distribution shortcuts (3+ panels)
        if (selectedPanelIds.length >= 3) {
          if (e.altKey && e.key === "h") {
            e.preventDefault();
            handleDistributeH();
          }
          if (e.altKey && e.key === "v") {
            e.preventDefault();
            handleDistributeV();
          }
        }
      }

      // Arrow key nudge - move all selected panels
      if (
        selectedPanelIds.length > 0 &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        e.preventDefault();
        saveToHistory();
        const amount = e.shiftKey ? NUDGE_AMOUNT_LARGE : NUDGE_AMOUNT;
        selectedPanelIds.forEach((id) => {
          const panel = panels.find((p) => p.id === id);
          if (!panel) return;
          if (e.key === "ArrowUp") updatePanel(id, { y: panel.y + amount });
          if (e.key === "ArrowDown") updatePanel(id, { y: panel.y - amount });
          if (e.key === "ArrowLeft") updatePanel(id, { x: panel.x - amount });
          if (e.key === "ArrowRight") updatePanel(id, { x: panel.x + amount });
        });
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setSpaceHeld(false);
        setIsPanning(false);
      }
      if (!e.shiftKey) setShiftHeld(false);
      if (!e.altKey) setAltHeld(false);
      if (!e.ctrlKey && !e.metaKey) setCtrlHeld(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    selectedPanelIds,
    deletePanels,
    deletePanel,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
    handleFitToContent,
    handleCopy,
    handlePaste,
    handleDuplicate,
    handleCut,
    handleAlignLeft,
    handleAlignCenterH,
    handleAlignRight,
    handleAlignTop,
    handleAlignCenterV,
    handleAlignBottom,
    handleDistributeH,
    handleDistributeV,
    panels,
    updatePanel,
    selectPanel,
    selectAll,
    undo,
    redo,
    saveToHistory,
  ]);

  // ===========================================================================
  // RENDER HELPERS (Memoized for performance)
  // ===========================================================================

  // Memoize grid lines to avoid recalculating on every render
  const gridLines = useMemo(() => {
    const lines: React.ReactNode[] = [];
    
    // Adaptive grid sizing based on zoom level
    let minorGrid: number;
    let majorGrid: number;
    
    if (zoom > 1) {
      minorGrid = 10;
      majorGrid = 50;
    } else if (zoom > 0.5) {
      minorGrid = 10;
      majorGrid = 100;
    } else if (zoom > 0.2) {
      minorGrid = 50;
      majorGrid = 100;
    } else if (zoom > 0.1) {
      minorGrid = 100;
      majorGrid = 500;
    } else {
      minorGrid = 500;
      majorGrid = 1000;
    }
    
    // Limit the number of grid lines to improve performance
    const maxLines = 200;
    const startX = Math.floor(viewBoxX / minorGrid) * minorGrid;
    const endX = viewBoxX + viewBoxWidth + minorGrid;
    const startY = Math.floor(viewBoxY / minorGrid) * minorGrid;
    const endY = viewBoxY + viewBoxHeight + minorGrid;
    
    let lineCount = 0;
    
    // Draw vertical grid lines
    for (let x = startX; x <= endX && lineCount < maxLines; x += minorGrid) {
      const isMajor = x % majorGrid === 0;
      const isAxis = x === 0;
      
      if (isAxis) continue;
      
      lines.push(
        <line
          key={`v${x}`}
          x1={x}
          y1={startY}
          x2={x}
          y2={endY}
          stroke={isMajor ? "#d1d5db" : "#e5e7eb"}
          strokeWidth={(isMajor ? 1 : 0.5) / zoom}
        />,
      );
      lineCount++;
    }
    
    // Draw horizontal grid lines
    for (let y = startY; y <= endY && lineCount < maxLines; y += minorGrid) {
      const worldY = screenToWorldY(y);
      const isMajor = Math.abs(worldY) % majorGrid === 0;
      const isAxis = worldY === 0;
      
      if (isAxis) continue;
      
      lines.push(
        <line
          key={`h${y}`}
          x1={startX}
          y1={y}
          x2={endX}
          y2={y}
          stroke={isMajor ? "#d1d5db" : "#e5e7eb"}
          strokeWidth={(isMajor ? 1 : 0.5) / zoom}
        />,
      );
      lineCount++;
    }
    
    return lines;
  }, [viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight, zoom]);

  const renderGrid = () => gridLines;

  // Memoize axes rendering
  const axesElements = useMemo(() => {
    const screenY0 = worldToScreenY(0);
    const screenX0 = 0;
    
    const elements: React.ReactNode[] = [];
    
    // Y=0 axis (floor line) - horizontal green line
    if (screenY0 >= viewBoxY && screenY0 <= viewBoxY + viewBoxHeight) {
      elements.push(
        <g key="y-axis">
          <line
            x1={viewBoxX}
            y1={screenY0}
            x2={viewBoxX + viewBoxWidth}
            y2={screenY0}
            stroke={AXIS_COLOR}
            strokeWidth={2 / zoom}
          />
          <text
            x={viewBoxX + RULER_SIZE / zoom + 5 / zoom}
            y={screenY0 - 5 / zoom}
            fontSize={11 / zoom}
            fill={AXIS_COLOR}
            fontWeight={600}
          >
            Y = 0 (Floor)
          </text>
        </g>
      );
    }
    
    // X=0 axis - vertical green line
    if (screenX0 >= viewBoxX && screenX0 <= viewBoxX + viewBoxWidth) {
      elements.push(
        <g key="x-axis">
          <line
            x1={screenX0}
            y1={viewBoxY}
            x2={screenX0}
            y2={viewBoxY + viewBoxHeight}
            stroke={AXIS_COLOR}
            strokeWidth={2 / zoom}
          />
          <text
            x={screenX0 + 5 / zoom}
            y={viewBoxY + RULER_SIZE / zoom + 15 / zoom}
            fontSize={11 / zoom}
            fill={AXIS_COLOR}
            fontWeight={600}
          >
            X = 0
          </text>
        </g>
      );
    }
    
    // Origin marker (0,0)
    if (
      screenX0 >= viewBoxX && screenX0 <= viewBoxX + viewBoxWidth &&
      screenY0 >= viewBoxY && screenY0 <= viewBoxY + viewBoxHeight
    ) {
      elements.push(
        <g key="origin">
          <circle
            cx={screenX0}
            cy={screenY0}
            r={6 / zoom}
            fill={AXIS_COLOR}
            stroke="white"
            strokeWidth={2 / zoom}
          />
          <text
            x={screenX0 + 10 / zoom}
            y={screenY0 + 4 / zoom}
            fontSize={10 / zoom}
            fill={AXIS_COLOR}
            fontWeight={700}
          >
            (0, 0)
          </text>
        </g>
      );
    }
    
    return elements;
  }, [viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight, zoom]);

  const renderAxes = () => axesElements;

  // Memoized horizontal ruler
  const horizontalRulerElements = useMemo(() => {
    if (!showRulers) return null;
    
    // Determine tick intervals based on zoom level
    let majorStep: number;
    let minorStep: number;
    
    if (zoom > 1) {
      majorStep = 50;   // 5cm
      minorStep = 10;   // 1cm
    } else if (zoom > 0.5) {
      majorStep = 100;  // 10cm
      minorStep = 10;   // 1cm
    } else if (zoom > 0.2) {
      majorStep = 100;  // 10cm
      minorStep = 50;   // 5cm
    } else if (zoom > 0.1) {
      majorStep = 500;  // 50cm
      minorStep = 100;  // 10cm
    } else {
      majorStep = 1000; // 100cm = 1m
      minorStep = 500;  // 50cm
    }
    
    const start = Math.floor(viewBoxX / minorStep) * minorStep;
    const end = viewBoxX + viewBoxWidth + minorStep;
    const ticks = [];
    
    // Limit number of ticks to prevent performance issues
    const maxTicks = 150;
    const step = Math.max(minorStep, Math.ceil((end - start) / maxTicks / minorStep) * minorStep);
    
    for (let x = start; x <= end; x += step) {
      const isMajor = x % majorStep === 0;
      const isOrigin = x === 0;
      const tickHeight = isMajor ? 14 : 8;
      
      ticks.push(
        <g key={x}>
          <line
            x1={x}
            y1={viewBoxY}
            x2={x}
            y2={viewBoxY + tickHeight / zoom}
            stroke={isOrigin ? AXIS_COLOR : "#666"}
            strokeWidth={(isMajor ? 1.5 : 1) / zoom}
          />
          {isMajor && (
            <text
              x={x + 2 / zoom}
              y={viewBoxY + 20 / zoom}
              fontSize={9 / zoom}
              fill={isOrigin ? AXIS_COLOR : "#666"}
              fontWeight={isOrigin ? 600 : 400}
            >
              {x === 0 ? "0" : x >= 1000 ? `${x / 10}cm` : x}
            </text>
          )}
        </g>
      );
    }
    
    return (
      <g>
        <rect
          x={viewBoxX}
          y={viewBoxY}
          width={viewBoxWidth}
          height={RULER_SIZE / zoom}
          fill="rgba(255,255,255,0.95)"
        />
        {ticks}
      </g>
    );
  }, [showRulers, zoom, viewBoxX, viewBoxY, viewBoxWidth]);

  const renderHorizontalRuler = () => horizontalRulerElements;

  // Memoized vertical ruler
  const verticalRulerElements = useMemo(() => {
    if (!showRulers) return null;
    
    // Same tick intervals as horizontal ruler
    let majorStep: number;
    let minorStep: number;
    
    if (zoom > 1) {
      majorStep = 50;
      minorStep = 10;
    } else if (zoom > 0.5) {
      majorStep = 100;
      minorStep = 10;
    } else if (zoom > 0.2) {
      majorStep = 100;
      minorStep = 50;
    } else if (zoom > 0.1) {
      majorStep = 500;
      minorStep = 100;
    } else {
      majorStep = 1000;
      minorStep = 500;
    }
    
    const start = Math.floor(viewBoxY / minorStep) * minorStep;
    const end = viewBoxY + viewBoxHeight + minorStep;
    const ticks = [];
    
    // Limit number of ticks
    const maxTicks = 150;
    const step = Math.max(minorStep, Math.ceil((end - start) / maxTicks / minorStep) * minorStep);
    
    for (let screenY = start; screenY <= end; screenY += step) {
      const worldY = screenToWorldY(screenY);
      const isMajor = screenY % majorStep === 0;
      const isOrigin = worldY === 0;
      const tickWidth = isMajor ? 14 : 8;
      
      ticks.push(
        <g key={screenY}>
          <line
            x1={viewBoxX}
            y1={screenY}
            x2={viewBoxX + tickWidth / zoom}
            y2={screenY}
            stroke={isOrigin ? AXIS_COLOR : "#666"}
            strokeWidth={(isMajor ? 1.5 : 1) / zoom}
          />
          {isMajor && (
            <text
              x={viewBoxX + 16 / zoom}
              y={screenY + 3 / zoom}
              fontSize={9 / zoom}
              fill={isOrigin ? AXIS_COLOR : "#666"}
              fontWeight={isOrigin ? 600 : 400}
            >
              {worldY === 0 ? "0" : Math.abs(worldY) >= 1000 ? `${worldY / 10}cm` : worldY}
            </text>
          )}
        </g>
      );
    }
    
    return (
      <g>
        <rect
          x={viewBoxX}
          y={viewBoxY}
          width={RULER_SIZE / zoom}
          height={viewBoxHeight}
          fill="rgba(255,255,255,0.95)"
        />
        {ticks}
      </g>
    );
  }, [showRulers, zoom, viewBoxX, viewBoxY, viewBoxHeight]);

  const renderVerticalRuler = () => verticalRulerElements;

  const renderPanel = (panel: Panel) => {
    const isSelected = selectedPanelIds.includes(panel.id);
    const isHovered = hoveredPanelId === panel.id && !isSelected;
    const woodColor = getWoodColorVariants(settings.woodColor || "#E8D4B8");
    const trueDims = getTrueDimensions(panel, settings.thickness);
    const hitArea = getHitArea(panel, settings.thickness);
    const { width, height } = trueDims;
    const orientation = panel.orientation || "horizontal";

    // Screen position: panel.y is BOTTOM, so top in world = panel.y + height
    const screenX = panel.x;
    const screenY = worldToScreenY(panel.y + height);
    const handleSize = 8 / zoom; // Smaller handles

    // Hit area extends around the true panel for easier clicking
    const hitX = screenX - hitArea.offsetX;
    const hitY = screenY - hitArea.offsetY;

    return (
      <g key={panel.id} data-panel-id={panel.id}>
        {/* Invisible hit area for easier clicking on thin panels */}
        <rect
          x={hitX}
          y={hitY}
          width={hitArea.width}
          height={hitArea.height}
          fill="transparent"
          style={{ cursor: spaceHeld || tool === "pan" ? "grab" : tool === "measure" ? "crosshair" : "move" }}
          onMouseDown={(e) => {
            if (!spaceHeld && tool !== "pan" && tool !== "measure") handleMouseDown(e, panel, "drag");
          }}
          onMouseEnter={() => setHoveredPanelId(panel.id)}
          onMouseLeave={() => setHoveredPanelId(null)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            handlePanelDoubleClick(panel);
          }}
        />
        {/* Hover highlight */}
        {isHovered && (
          <rect
            x={screenX - 2 / zoom}
            y={screenY - 2 / zoom}
            width={width + 4 / zoom}
            height={height + 4 / zoom}
            fill="none"
            stroke="#60a5fa"
            strokeWidth={2 / zoom}
            strokeDasharray={`${4 / zoom} ${2 / zoom}`}
            rx={4}
            ry={4}
            pointerEvents="none"
            opacity={0.8}
          />
        )}
        {/* Visible panel at TRUE size */}
        <rect
          x={screenX}
          y={screenY}
          width={width}
          height={height}
          fill={woodColor.base}
          stroke={isSelected ? "#2563eb" : isHovered ? "#60a5fa" : woodColor.dark}
          strokeWidth={isSelected ? 3 / zoom : isHovered ? 2 / zoom : 1.5 / zoom}
          rx={2}
          ry={2}
          pointerEvents="none"
        />
        {/* Orientation indicator - small icon in corner */}
        <text
          x={screenX + 6 / zoom}
          y={screenY + 14 / zoom}
          fontSize={10 / zoom}
          fill="#888"
          pointerEvents="none"
        >
          {orientation === "horizontal"
            ? "═"
            : orientation === "vertical"
              ? "║"
              : "▢"}
        </text>

        {/* Only show resize handles when exactly one panel is selected */}
        {isSelected &&
          selectedPanelIds.length === 1 &&
          (orientation === "back"
            ? ["nw", "ne", "sw", "se", "n", "s", "e", "w"]
            : orientation === "horizontal"
              ? ["e", "w"]
              : ["n", "s"]
          ).map((corner) => {
            // Position handles AT the edge, not extending beyond
            const hs = handleSize;
            let hx = screenX + width / 2 - hs / 2;
            let hy = screenY + height / 2 - hs / 2;
            
            // Position handles at the edges, inset slightly so they don't overflow
            if (corner.includes("e")) hx = screenX + width - hs;
            if (corner.includes("w")) hx = screenX;
            if (corner.includes("n")) hy = screenY;
            if (corner.includes("s")) hy = screenY + height - hs;
            if (corner === "n" || corner === "s") hx = screenX + width / 2 - hs / 2;
            if (corner === "e" || corner === "w") hy = screenY + height / 2 - hs / 2;
            
            return (
              <rect
                key={corner}
                x={hx}
                y={hy}
                width={handleSize}
                height={handleSize}
                fill="white"
                stroke="#2563eb"
                strokeWidth={2 / zoom}
                rx={2}
                style={{
                  cursor:
                    corner.length === 2
                      ? `${corner}-resize`
                      : corner === "n" || corner === "s"
                        ? "ns-resize"
                        : "ew-resize",
                }}
                onMouseDown={(e) => {
                  if (tool !== "measure") handleMouseDown(e, panel, "resize", corner);
                }}
              />
            );
          })}

        {panel.quantity > 1 && (
          <>
            <circle
              cx={screenX + width - 16 / zoom}
              cy={screenY + 16 / zoom}
              r={12 / zoom}
              fill="#dc2626"
              stroke="white"
              strokeWidth={2 / zoom}
            />
            <text
              x={screenX + width - 16 / zoom}
              y={screenY + 20 / zoom}
              textAnchor="middle"
              fontSize={10 / zoom}
              fill="white"
              fontWeight={700}
            >
              ×{panel.quantity}
            </text>
          </>
        )}

        {/* Dimensions - show on selection only */}
        {isSelected && (
          <text
            x={screenX + width / 2}
            y={screenY + height / 2 + 4 / zoom}
            textAnchor="middle"
            fontSize={11 / zoom}
            fill="#1e40af"
            fontWeight={600}
            pointerEvents="none"
          >
            {Math.round(panel.width)} × {Math.round(panel.height)}
          </text>
        )}
      </g>
    );
  };

  const renderSnapGuides = () => {
    const renderedGuides: React.ReactNode[] = [];
    const gapLabels: React.ReactNode[] = [];
    const seenGaps = new Set<string>();

    snapGuides.forEach((guide, i) => {
      const color = guide.isEqualSpacing ? "#10b981" : GUIDE_COLOR; // Green for equal spacing

      renderedGuides.push(
        <line
          key={`guide-${i}`}
          x1={guide.type === "vertical" ? guide.position : guide.start}
          y1={
            guide.type === "horizontal"
              ? worldToScreenY(guide.position)
              : worldToScreenY(guide.end)
          }
          x2={guide.type === "vertical" ? guide.position : guide.end}
          y2={
            guide.type === "horizontal"
              ? worldToScreenY(guide.position)
              : worldToScreenY(guide.start)
          }
          stroke={color}
          strokeWidth={(guide.isEqualSpacing ? 1.5 : 1) / zoom}
          strokeDasharray={
            guide.isEqualSpacing ? "none" : `${4 / zoom},${4 / zoom}`
          }
        />,
      );

      // Show gap measurement for equal spacing (avoid duplicates)
      if (guide.isEqualSpacing && guide.gapSize !== undefined) {
        const gapKey = `${guide.type}-${Math.round(guide.gapSize)}`;
        if (!seenGaps.has(gapKey)) {
          seenGaps.add(gapKey);
          const labelX =
            guide.type === "vertical"
              ? guide.position + 5 / zoom
              : viewBoxX + viewBoxWidth / 2;
          const labelY =
            guide.type === "horizontal"
              ? worldToScreenY(guide.position) + 15 / zoom
              : viewBoxY + 50 / zoom;

          gapLabels.push(
            <g key={`gap-label-${i}`}>
              <rect
                x={labelX - 2 / zoom}
                y={labelY - 12 / zoom}
                width={50 / zoom}
                height={16 / zoom}
                fill="#10b981"
                rx={3 / zoom}
              />
              <text
                x={labelX + 23 / zoom}
                y={labelY - 1 / zoom}
                fontSize={10 / zoom}
                fill="white"
                textAnchor="middle"
                fontWeight={600}
              >
                {Math.round(guide.gapSize)}mm
              </text>
            </g>,
          );
        }
      }
    });

    return [...renderedGuides, ...gapLabels];
  };

  const renderMarqueeSelection = () => {
    if (!isMarqueeSelecting || !marqueeStart || !marqueeEnd) return null;
    const x = Math.min(marqueeStart.x, marqueeEnd.x);
    // Convert world Y to screen Y for rendering
    const worldYMin = Math.min(marqueeStart.y, marqueeEnd.y);
    const worldYMax = Math.max(marqueeStart.y, marqueeEnd.y);
    const width = Math.abs(marqueeEnd.x - marqueeStart.x);
    const height = Math.abs(marqueeEnd.y - marqueeStart.y);
    // Screen Y is inverted: higher world Y = lower screen Y
    const screenY = worldToScreenY(worldYMax);
    return (
      <rect
        x={x}
        y={screenY}
        width={width}
        height={height}
        fill="rgba(37, 99, 235, 0.1)"
        stroke="#2563eb"
        strokeWidth={1 / zoom}
        strokeDasharray={`${4 / zoom},${4 / zoom}`}
        pointerEvents="none"
      />
    );
  };

  const noteClickRef = useRef<{
    noteId: string;
    timeout: NodeJS.Timeout;
  } | null>(null);

  const handleNoteMouseDown = useCallback(
    (e: React.MouseEvent, note: StickyNoteType) => {
      if (editingNote === note.id) return; // Don't drag while editing
      e.stopPropagation();

      // Check for double-click manually
      if (noteClickRef.current?.noteId === note.id) {
        // This is a double-click
        clearTimeout(noteClickRef.current.timeout);
        noteClickRef.current = null;
        setEditingNote(note.id);
        setNoteInputValue(note.text);
        return;
      }

      // Single click - start drag after a short delay
      const timeout = setTimeout(() => {
        noteClickRef.current = null;
        setDraggingNote(note.id);
        setDragStart(getSVGPoint(e));
        setNoteStart({ x: note.x, y: note.y });
      }, 200);

      noteClickRef.current = { noteId: note.id, timeout };
    },
    [getSVGPoint, editingNote],
  );

  const handleNoteDoubleClick = useCallback(
    (e: React.MouseEvent, note: StickyNoteType) => {
      e.stopPropagation();
      // Clear any pending drag
      if (noteClickRef.current) {
        clearTimeout(noteClickRef.current.timeout);
        noteClickRef.current = null;
      }
      setEditingNote(note.id);
      setNoteInputValue(note.text);
    },
    [],
  );

  const handleNoteSave = useCallback(() => {
    if (editingNote) {
      updateStickyNote(editingNote, { text: noteInputValue });
      setEditingNote(null);
    }
  }, [editingNote, noteInputValue, updateStickyNote]);

  const handleNoteBlur = useCallback(() => {
    // Save when clicking away
    if (editingNote) {
      updateStickyNote(editingNote, { text: noteInputValue });
      setEditingNote(null);
    }
  }, [editingNote, noteInputValue, updateStickyNote]);

  const renderStickyNotes = () => {
    const NOTE_WIDTH = 140;
    const NOTE_HEIGHT = 100;
    const FONT_SIZE = 12; // Larger text
    const NOTE_COLOR = "#fef08a"; // Consistent yellow color

    return stickyNotes.map((note) => {
      const screenX = note.x;
      const screenY = worldToScreenY(note.y);
      const isEditing = editingNote === note.id;

      return (
        <g key={note.id}>
          {/* Note shadow */}
          <rect
            x={screenX + 3 / zoom}
            y={screenY + 3 / zoom}
            width={NOTE_WIDTH / zoom}
            height={NOTE_HEIGHT / zoom}
            fill="rgba(0,0,0,0.15)"
            rx={4 / zoom}
          />
          {/* Note background - clickable area */}
          <rect
            x={screenX}
            y={screenY}
            width={NOTE_WIDTH / zoom}
            height={NOTE_HEIGHT / zoom}
            fill={NOTE_COLOR}
            stroke={isEditing ? "#3b82f6" : "#d97706"}
            strokeWidth={isEditing ? 2 / zoom : 1 / zoom}
            rx={4 / zoom}
            style={{ cursor: isEditing ? "text" : "pointer" }}
            onMouseDown={(e) => !isEditing && handleNoteMouseDown(e, note)}
            onDoubleClick={(e) => handleNoteDoubleClick(e, note)}
          />
          {/* Delete button - hide when editing */}
          {!isEditing && (
            <g
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                deleteStickyNote(note.id);
              }}
            >
              <circle
                cx={screenX + NOTE_WIDTH / zoom - 10 / zoom}
                cy={screenY + 10 / zoom}
                r={10 / zoom}
                fill="rgba(0,0,0,0.1)"
              />
              <text
                x={screenX + NOTE_WIDTH / zoom - 10 / zoom}
                y={screenY + 14 / zoom}
                fontSize={12 / zoom}
                fill="#666"
                textAnchor="middle"
              >
                ×
              </text>
            </g>
          )}
          {/* Note content */}
          <foreignObject
            x={screenX + 6 / zoom}
            y={screenY + 6 / zoom}
            width={(NOTE_WIDTH - 12) / zoom}
            height={(NOTE_HEIGHT - 12) / zoom}
            style={{ pointerEvents: isEditing ? "auto" : "none" }}
          >
            {isEditing ? (
              <textarea
                value={noteInputValue}
                onChange={(e) => setNoteInputValue(e.target.value)}
                onBlur={handleNoteBlur}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape") {
                    setEditingNote(null);
                  }
                }}
                autoFocus
                style={{
                  width: "100%",
                  height: "100%",
                  fontSize: `${FONT_SIZE / zoom}px`,
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  color: "#1f2937",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  resize: "none",
                  padding: 0,
                  margin: 0,
                  lineHeight: 1.4,
                }}
                placeholder="Type your note..."
              />
            ) : (
              <div
                style={{
                  fontSize: `${FONT_SIZE / zoom}px`,
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  color: "#1f2937",
                  overflow: "hidden",
                  wordBreak: "break-word",
                  lineHeight: 1.4,
                  height: "100%",
                }}
              >
                {note.text || (
                  <span style={{ color: "#92400e", fontStyle: "italic" }}>
                    Double-click to edit...
                  </span>
                )}
              </div>
            )}
          </foreignObject>
        </g>
      );
    });
  };

  // Render bounding box around multi-selection
  const renderSelectionBounds = () => {
    if (selectedPanelIds.length < 2) return null;

    const selectedPanels = panels.filter((p) =>
      selectedPanelIds.includes(p.id)
    );
    if (selectedPanels.length === 0) return null;

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

    selectedPanels.forEach((p) => {
      const dims = getTrueDimensions(p, settings.thickness);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + dims.width);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y + dims.height);
    });

    const padding = 8 / zoom;

    return (
      <g>
        {/* Selection bounding box */}
        <rect
          x={minX - padding}
          y={worldToScreenY(maxY) - padding}
          width={maxX - minX + padding * 2}
          height={maxY - minY + padding * 2}
          fill="none"
          stroke="#2563eb"
          strokeWidth={1 / zoom}
          strokeDasharray={`${6 / zoom} ${3 / zoom}`}
          opacity={0.6}
          rx={4 / zoom}
          pointerEvents="none"
        />
        {/* Selection info badge */}
        <g>
          <rect
            x={minX - padding}
            y={worldToScreenY(maxY) - padding - 24 / zoom}
            width={120 / zoom}
            height={20 / zoom}
            fill="#2563eb"
            rx={4 / zoom}
            opacity={0.9}
          />
          <text
            x={minX - padding + 8 / zoom}
            y={worldToScreenY(maxY) - padding - 10 / zoom}
            fontSize={10 / zoom}
            fill="white"
            fontWeight={500}
          >
            {selectedPanelIds.length} panels selected
          </text>
        </g>
      </g>
    );
  };

  const getCursor = () => {
    if (isPanning) return "grabbing";
    if (spaceHeld || tool === "pan") return "grab";
    if (stickyNoteTool) return "crosshair";
    if (tool === "measure") return "crosshair";
    return "default";
  };

  // Calculate measurements between selected panel and neighbors/floor
  const getMeasurements = useMemo(() => {
    if (!showMeasurements) return [];

    const measurements: {
      id: string;
      type: "gap" | "position";
      axis: "x" | "y";
      direction: "before" | "after" | "floor";
      value: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      labelX: number;
      labelY: number;
      panelId: string; // The panel that will move when editing
      neighborId?: string;
    }[] = [];

    // Get all panel bounds
    const panelBounds = panels.map((p) => {
      const dims = getTrueDimensions(p, settings.thickness);
      return {
        id: p.id,
        left: p.x,
        right: p.x + dims.width,
        bottom: p.y,
        top: p.y + dims.height,
        centerX: p.x + dims.width / 2,
        centerY: p.y + dims.height / 2,
        width: dims.width,
        height: dims.height,
      };
    });

    // For each panel, find gaps to floor and neighbors
    panelBounds.forEach((panel) => {
      // Distance to floor
      if (panel.bottom > 0 && panel.bottom < 2000) {
        measurements.push({
          id: `${panel.id}-floor`,
          type: "gap",
          axis: "y",
          direction: "floor",
          value: panel.bottom,
          x1: panel.centerX,
          y1: 0,
          x2: panel.centerX,
          y2: panel.bottom,
          labelX: panel.centerX,
          labelY: panel.bottom / 2,
          panelId: panel.id,
        });
      }

      // Find horizontally aligned neighbors (overlapping in Y)
      const horizontalNeighbors = panelBounds.filter(
        (p) =>
          p.id !== panel.id && p.top > panel.bottom && p.bottom < panel.top,
      );

      // Gap to panel on the right (only add from left panel's perspective to avoid duplicates)
      const rightNeighbor = horizontalNeighbors
        .filter((p) => p.left > panel.right)
        .sort((a, b) => a.left - b.left)[0];

      if (rightNeighbor) {
        const gap = rightNeighbor.left - panel.right;
        if (gap > 0 && gap < 2000) {
          const avgY =
            (Math.max(panel.bottom, rightNeighbor.bottom) +
              Math.min(panel.top, rightNeighbor.top)) /
            2;
          measurements.push({
            id: `${panel.id}-right-${rightNeighbor.id}`,
            type: "gap",
            axis: "x",
            direction: "after",
            value: gap,
            x1: panel.right,
            y1: avgY,
            x2: rightNeighbor.left,
            y2: avgY,
            labelX: panel.right + gap / 2,
            labelY: avgY,
            panelId: rightNeighbor.id, // Right panel moves
            neighborId: panel.id,
          });
        }
      }

      // Find vertically aligned neighbors (overlapping in X)
      const verticalNeighbors = panelBounds.filter(
        (p) =>
          p.id !== panel.id && p.right > panel.left && p.left < panel.right,
      );

      // Gap to panel above (only add from bottom panel's perspective)
      const aboveNeighbor = verticalNeighbors
        .filter((p) => p.bottom > panel.top)
        .sort((a, b) => a.bottom - b.bottom)[0];

      if (aboveNeighbor) {
        const gap = aboveNeighbor.bottom - panel.top;
        if (gap > 0 && gap < 2000) {
          const avgX =
            (Math.max(panel.left, aboveNeighbor.left) +
              Math.min(panel.right, aboveNeighbor.right)) /
            2;
          measurements.push({
            id: `${panel.id}-above-${aboveNeighbor.id}`,
            type: "gap",
            axis: "y",
            direction: "after",
            value: gap,
            x1: avgX,
            y1: panel.top,
            x2: avgX,
            y2: aboveNeighbor.bottom,
            labelX: avgX,
            labelY: panel.top + gap / 2,
            panelId: aboveNeighbor.id, // Top panel moves
            neighborId: panel.id,
          });
        }
      }
    });

    return measurements;
  }, [showMeasurements, panels, settings.thickness]);

  const handleMeasurementDoubleClick = useCallback(
    (measurement: (typeof getMeasurements)[0], e: React.MouseEvent) => {
      e.stopPropagation();
      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      setEditingMeasurement({
        type: measurement.type,
        panelId: measurement.panelId,
        axis: measurement.axis,
        direction: measurement.direction,
        currentValue: measurement.value,
        position: { x: screenX, y: screenY },
      });
      setMeasurementInputValue(Math.round(measurement.value).toString());
    },
    [],
  );

  const handleMeasurementSubmit = useCallback(() => {
    if (!editingMeasurement) return;

    const newValue = parseFloat(measurementInputValue);
    if (isNaN(newValue) || newValue < 0) {
      setEditingMeasurement(null);
      return;
    }

    const panel = panels.find((p) => p.id === editingMeasurement.panelId);
    if (!panel) {
      setEditingMeasurement(null);
      return;
    }

    saveToHistory();

    const delta = newValue - editingMeasurement.currentValue;

    // Movement logic:
    // - For floor distance: panel moves up/down to reach the new height
    // - For vertical gaps (between shelves): top panel moves up/down
    // - For horizontal gaps (between sides): right panel moves left/right

    if (editingMeasurement.axis === "y") {
      if (editingMeasurement.direction === "floor") {
        // Change distance to floor - set absolute position
        updatePanel(panel.id, { y: newValue });
      } else {
        // Gap between panels - move the designated panel (top one)
        // If gap increases, panel moves up. If gap decreases, panel moves down.
        updatePanel(panel.id, { y: panel.y + delta });
      }
    } else {
      // Horizontal gap - move the designated panel (right one)
      // If gap increases, panel moves right. If gap decreases, panel moves left.
      updatePanel(panel.id, { x: panel.x + delta });
    }

    setEditingMeasurement(null);
  }, [
    editingMeasurement,
    measurementInputValue,
    panels,
    updatePanel,
    saveToHistory,
  ]);

  const renderMeasurements = () => {
    if (!showMeasurements) return null;

    const labelWidth = 50 / zoom;
    const labelHeight = 20 / zoom;

    // First pass: calculate initial label positions
    const labelPositions = getMeasurements.map((m, index) => {
      const screenLabelY = worldToScreenY(m.labelY);
      const isVertical = m.axis === "y";
      const isFloor = m.direction === "floor";

      let x = m.labelX;
      let y = screenLabelY;

      // For floor measurements, alternate left/right based on index
      if (isFloor) {
        const floorIndex = getMeasurements.filter(
          (mm, i) => i < index && mm.direction === "floor",
        ).length;
        x = m.x1 + (floorIndex % 2 === 0 ? 25 / zoom : -25 / zoom);
      } else if (isVertical) {
        // Vertical gaps: offset right from the line
        x = m.x1 + 35 / zoom;
      }
      // Horizontal gaps: keep label centered on the line

      return { m, x, y, index };
    });

    // Second pass: detect and resolve overlaps
    const resolvedPositions = [...labelPositions];
    const padding = 8 / zoom;

    for (let i = 0; i < resolvedPositions.length; i++) {
      for (let j = i + 1; j < resolvedPositions.length; j++) {
        const a = resolvedPositions[i];
        const b = resolvedPositions[j];

        // Check if labels overlap
        const overlapX = Math.abs(a.x - b.x) < labelWidth + padding;
        const overlapY = Math.abs(a.y - b.y) < labelHeight + padding;

        if (overlapX && overlapY) {
          // Push them apart
          if (a.m.axis === b.m.axis) {
            // Same axis - offset perpendicular to the measurement
            if (a.m.axis === "y") {
              // Vertical measurements - spread horizontally
              b.x += labelWidth + padding;
            } else {
              // Horizontal measurements - spread vertically
              b.y -= labelHeight + padding;
            }
          } else {
            // Different axes - offset the later one
            b.y -= labelHeight + padding;
          }
        }
      }
    }

    return resolvedPositions.map(
      ({ m, x: adjustedLabelX, y: adjustedLabelY }) => {
        const screenY1 = worldToScreenY(m.y1);
        const screenY2 = worldToScreenY(m.y2);
        const isVertical = m.axis === "y";

        // Check if this measurement is relevant to a selected panel
        const isRelevant =
          selectedPanelIds.includes(m.panelId) ||
          (m.neighborId && selectedPanelIds.includes(m.neighborId));
        const opacity = isRelevant ? 1 : 0.35;

        return (
          <g key={m.id} style={{ opacity }}>
            {/* Measurement line */}
            <line
              x1={m.x1}
              y1={screenY1}
              x2={m.x2}
              y2={screenY2}
              stroke={DISTANCE_COLOR}
              strokeWidth={1.5 / zoom}
              strokeDasharray={`${3 / zoom},${3 / zoom}`}
            />
            {/* End caps */}
            {isVertical ? (
              <>
                <line
                  x1={m.x1 - 6 / zoom}
                  y1={screenY1}
                  x2={m.x1 + 6 / zoom}
                  y2={screenY1}
                  stroke={DISTANCE_COLOR}
                  strokeWidth={1.5 / zoom}
                />
                <line
                  x1={m.x2 - 6 / zoom}
                  y1={screenY2}
                  x2={m.x2 + 6 / zoom}
                  y2={screenY2}
                  stroke={DISTANCE_COLOR}
                  strokeWidth={1.5 / zoom}
                />
              </>
            ) : (
              <>
                <line
                  x1={m.x1}
                  y1={screenY1 - 6 / zoom}
                  x2={m.x1}
                  y2={screenY1 + 6 / zoom}
                  stroke={DISTANCE_COLOR}
                  strokeWidth={1.5 / zoom}
                />
                <line
                  x1={m.x2}
                  y1={screenY2 - 6 / zoom}
                  x2={m.x2}
                  y2={screenY2 + 6 / zoom}
                  stroke={DISTANCE_COLOR}
                  strokeWidth={1.5 / zoom}
                />
              </>
            )}
            {/* Leader line to label if offset significantly */}
            {Math.abs(adjustedLabelX - m.labelX) > 30 / zoom ||
            Math.abs(adjustedLabelY - worldToScreenY(m.labelY)) > 30 / zoom ? (
              <line
                x1={m.labelX}
                y1={worldToScreenY(m.labelY)}
                x2={adjustedLabelX}
                y2={adjustedLabelY}
                stroke={DISTANCE_COLOR}
                strokeWidth={0.5 / zoom}
                opacity={0.5}
              />
            ) : null}
            {/* Label background (clickable) */}
            <rect
              x={adjustedLabelX - 25 / zoom}
              y={adjustedLabelY - 10 / zoom}
              width={labelWidth}
              height={labelHeight}
              fill={DISTANCE_COLOR}
              rx={4 / zoom}
              style={{ cursor: "pointer" }}
              onDoubleClick={(e) => handleMeasurementDoubleClick(m, e)}
            />
            {/* Label text */}
            <text
              x={adjustedLabelX}
              y={adjustedLabelY + 4 / zoom}
              fontSize={11 / zoom}
              fill="white"
              textAnchor="middle"
              fontWeight={600}
              style={{ pointerEvents: "none" }}
            >
              {Math.round(m.value)}
            </text>
          </g>
        );
      },
    );
  };

  // Render custom measure tool line
  const renderMeasureTool = () => {
    if (tool !== "measure") return null;
    
    const lineWidth = 2 / zoom;
    const dotRadius = 5 / zoom;
    const snapIndicatorRadius = 8 / zoom;
    const fontSize = 12 / zoom;
    
    // Calculate end point (either second click or preview)
    const startPoint = measurePoints[0];
    const endPoint = measurePoints[1] || measurePreview;
    
    // Check if points are snapped to panels
    const isStartSnapped = startPoint ? snapMeasurePoint(startPoint.x, startPoint.y, false).snapped : false;
    const isEndSnapped = endPoint ? snapMeasurePoint(endPoint.x, endPoint.y, false).snapped : false;
    
    // Convert to screen Y
    const startScreenY = startPoint ? worldToScreenY(startPoint.y) : 0;
    const endScreenY = endPoint ? worldToScreenY(endPoint.y) : startScreenY;
    
    // Calculate distance
    const distance = endPoint && startPoint
      ? Math.sqrt(
          Math.pow(endPoint.x - startPoint.x, 2) + 
          Math.pow(endPoint.y - startPoint.y, 2)
        )
      : 0;
    
    // Calculate horizontal and vertical components
    const deltaX = endPoint && startPoint ? Math.abs(endPoint.x - startPoint.x) : 0;
    const deltaY = endPoint && startPoint ? Math.abs(endPoint.y - startPoint.y) : 0;
    
    // Determine if constrained to straight line
    const isStraightLine = startPoint && endPoint && (deltaX < 1 || deltaY < 1);
    
    // Label position (midpoint)
    const labelX = endPoint && startPoint ? (startPoint.x + endPoint.x) / 2 : (startPoint?.x || 0);
    const labelY = endPoint ? (startScreenY + endScreenY) / 2 : startScreenY;
    
    return (
      <g className="measure-tool">
        {/* Snap indicators for all panel corners/edges when measuring */}
        {measurePoints.length < 2 && panels.map((panel) => {
          const dims = getTrueDimensions(panel, settings.thickness);
          const points = [
            { x: panel.x, y: panel.y },
            { x: panel.x + dims.width, y: panel.y },
            { x: panel.x, y: panel.y + dims.height },
            { x: panel.x + dims.width, y: panel.y + dims.height },
            { x: panel.x + dims.width / 2, y: panel.y },
            { x: panel.x + dims.width / 2, y: panel.y + dims.height },
            { x: panel.x, y: panel.y + dims.height / 2 },
            { x: panel.x + dims.width, y: panel.y + dims.height / 2 },
          ];
          
          return points.map((pt, i) => (
            <circle
              key={`snap-${panel.id}-${i}`}
              cx={pt.x}
              cy={worldToScreenY(pt.y)}
              r={3 / zoom}
              fill="none"
              stroke="#10b981"
              strokeWidth={1 / zoom}
              opacity={0.4}
            />
          ));
        })}
        
        {/* Start point */}
        {startPoint && (
          <>
            {isStartSnapped && (
              <circle
                cx={startPoint.x}
                cy={startScreenY}
                r={snapIndicatorRadius}
                fill="none"
                stroke="#10b981"
                strokeWidth={2 / zoom}
                opacity={0.5}
              />
            )}
            <circle
              cx={startPoint.x}
              cy={startScreenY}
              r={dotRadius}
              fill="#10b981"
              stroke="white"
              strokeWidth={2 / zoom}
            />
          </>
        )}
        
        {/* Line to end point or preview */}
        {startPoint && endPoint && (
          <>
            <line
              x1={startPoint.x}
              y1={startScreenY}
              x2={endPoint.x}
              y2={endScreenY}
              stroke="#10b981"
              strokeWidth={lineWidth}
              strokeDasharray={measurePoints.length < 2 ? `${5 / zoom} ${3 / zoom}` : "none"}
            />
            
            {/* End point with snap indicator */}
            {isEndSnapped && (
              <circle
                cx={endPoint.x}
                cy={endScreenY}
                r={snapIndicatorRadius}
                fill="none"
                stroke="#10b981"
                strokeWidth={2 / zoom}
                opacity={0.5}
              />
            )}
            <circle
              cx={endPoint.x}
              cy={endScreenY}
              r={dotRadius}
              fill="#10b981"
              stroke="white"
              strokeWidth={2 / zoom}
              opacity={measurePoints.length < 2 ? 0.7 : 1}
            />
            
            {/* Distance label */}
            <g transform={`translate(${labelX}, ${labelY})`}>
              {/* Only show extended label with dimensions if it's a diagonal (both deltas > 10) */}
              {(() => {
                const showDimensions = measurePoints.length === 2 && deltaX > 10 && deltaY > 10;
                return (
                  <>
                    <rect
                      x={-40 / zoom}
                      y={showDimensions ? -24 / zoom : -12 / zoom}
                      width={80 / zoom}
                      height={showDimensions ? 44 / zoom : 24 / zoom}
                      fill="#10b981"
                      rx={4 / zoom}
                    />
                    <text
                      x={0}
                      y={showDimensions ? -8 / zoom : 4 / zoom}
                      fontSize={fontSize}
                      fill="white"
                      textAnchor="middle"
                      fontWeight={600}
                    >
                      {Math.round(distance)} mm
                    </text>
                    {showDimensions && (
                      <text
                        x={0}
                        y={10 / zoom}
                        fontSize={fontSize * 0.85}
                        fill="rgba(255,255,255,0.8)"
                        textAnchor="middle"
                      >
                        {Math.round(deltaX)}×{Math.round(deltaY)}
                      </text>
                    )}
                  </>
                );
              })()}
            </g>
          </>
        )}
        
        {/* Instructions - show when no points yet */}
        {!startPoint && (
          <text
            x={viewBoxX + 20 / zoom}
            y={viewBoxY + 30 / zoom}
            fontSize={fontSize}
            fill="#10b981"
          >
            Click panel edges to measure • Hold ⇧ for diagonal
          </text>
        )}
      </g>
    );
  };

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-50">
      {/* Floating Dark Toolbar - Bottom Center */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1.5 bg-slate-800 rounded-xl shadow-lg">
        {/* Add Panel Buttons */}
        <button
          onClick={() => addPanel(undefined, undefined, "horizontal")}
          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-md transition-colors flex items-center gap-1"
          title="Add Horizontal Panel (Shelf)"
        >
          <GripHorizontal size={16} />
          <span className="text-xs">Shelf</span>
        </button>
        <button
          onClick={() => addPanel(undefined, undefined, "vertical")}
          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-md transition-colors flex items-center gap-1"
          title="Add Vertical Panel (Divider)"
        >
          <GripVertical size={16} />
          <span className="text-xs">Divider</span>
        </button>
        <button
          onClick={() => addPanel(undefined, undefined, "back")}
          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-md transition-colors flex items-center gap-1"
          title="Add Back Panel"
        >
          <Square size={16} />
          <span className="text-xs">Back</span>
        </button>
        <div className="w-px h-5 bg-slate-600 mx-1" />
        
        {/* Tool Selection */}
        <div className="flex items-center bg-slate-700 rounded-lg p-0.5">
          <button
            onClick={() => setTool("select")}
            className={`p-1.5 rounded-md transition-colors ${tool === "select" ? "bg-white text-slate-800" : "text-slate-300 hover:text-white"}`}
            title="Select (V)"
          >
            <MousePointer2 size={16} />
          </button>
          <button
            onClick={() => setTool("pan")}
            className={`p-1.5 rounded-md transition-colors ${tool === "pan" ? "bg-white text-slate-800" : "text-slate-300 hover:text-white"}`}
            title="Pan (H)"
          >
            <Hand size={16} />
          </button>
          <button
            onClick={() => {
              if (tool === "measure") {
                setTool("select");
                setMeasurePoints([]);
                setMeasurePreview(null);
              } else {
                setTool("measure");
              }
            }}
            className={`p-1.5 rounded-md transition-colors ${tool === "measure" ? "bg-green-500 text-white" : "text-slate-300 hover:text-white"}`}
            title="Measure Distance (D)"
          >
            <RulerIcon size={16} />
          </button>
        </div>
        <div className="w-px h-5 bg-slate-600 mx-1" />
        
        {/* Undo/Redo */}
        <button
          onClick={undo}
          disabled={!canUndo}
          className={`p-1.5 rounded-md transition-colors ${canUndo ? "text-slate-300 hover:text-white hover:bg-slate-700" : "text-slate-600 cursor-not-allowed"}`}
          title="Undo (⌘Z)"
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className={`p-1.5 rounded-md transition-colors ${canRedo ? "text-slate-300 hover:text-white hover:bg-slate-700" : "text-slate-600 cursor-not-allowed"}`}
          title="Redo (⌘⇧Z)"
        >
          <Redo2 size={16} />
        </button>
        <div className="w-px h-5 bg-slate-600 mx-1" />
        
        {/* Zoom Controls */}
        <button
          onClick={handleZoomOut}
          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>
        <span className="text-xs text-slate-300 w-10 text-center font-mono">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={handleZoomIn}
          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={handleFitToContent}
          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
          title="Fit to Content (F)"
        >
          <Maximize size={16} />
        </button>
        <div className="w-px h-5 bg-slate-600 mx-1" />
        
        {/* View Options */}
        <button
          onClick={() => setShowRulers(!showRulers)}
          className={`p-1.5 rounded-md transition-colors ${showRulers ? "bg-slate-600 text-white" : "text-slate-300 hover:text-white hover:bg-slate-700"}`}
          title="Toggle Rulers (R)"
        >
          <Ruler size={16} />
        </button>
        <button
          onClick={() => setShowMeasurements(!showMeasurements)}
          className={`p-1.5 rounded-md transition-colors ${showMeasurements ? "bg-blue-500 text-white" : "text-slate-300 hover:text-white hover:bg-slate-700"}`}
          title="Show Measurements (M)"
        >
          <Move size={16} />
        </button>
        <button
          onClick={() => setStickyNoteTool(!stickyNoteTool)}
          className={`p-1.5 rounded-md transition-colors ${stickyNoteTool ? "bg-yellow-400 text-slate-800" : "text-slate-300 hover:text-white hover:bg-slate-700"}`}
          title="Add Note (N)"
        >
          <StickyNote size={16} />
        </button>
      </div>

      {/* Alignment Toolbar - shows when multiple panels selected */}
      <AlignmentToolbar
        selectionCount={selectedPanelIds.length}
        onAlignLeft={handleAlignLeft}
        onAlignCenterH={handleAlignCenterH}
        onAlignRight={handleAlignRight}
        onAlignTop={handleAlignTop}
        onAlignCenterV={handleAlignCenterV}
        onAlignBottom={handleAlignBottom}
        onDistributeH={handleDistributeH}
        onDistributeV={handleDistributeV}
        onMatchWidth={handleMatchWidth}
        onMatchHeight={handleMatchHeight}
      />

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextMenuActions}
          onClose={closeContextMenu}
        />
      )}

      {/* Measurement Input Overlay */}
      {editingMeasurement && (
        <div
          className="absolute z-30"
          style={{
            left: editingMeasurement.position.x - 40,
            top: editingMeasurement.position.y - 15,
          }}
        >
          <div className="flex items-center gap-1 bg-white rounded-lg shadow-xl border border-slate-200 p-1">
            <input
              type="number"
              value={measurementInputValue}
              onChange={(e) => setMeasurementInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleMeasurementSubmit();
                if (e.key === "Escape") setEditingMeasurement(null);
              }}
              autoFocus
              className="w-20 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="mm"
            />
            <button
              onClick={handleMeasurementSubmit}
              className="px-2 py-1 bg-blue-500 text-white text-xs font-medium rounded hover:bg-blue-600"
            >
              Set
            </button>
            <button
              onClick={() => setEditingMeasurement(null)}
              className="px-2 py-1 text-slate-500 text-xs hover:text-slate-700"
            >
              ✕
            </button>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 text-center">
            {editingMeasurement.direction === "floor"
              ? "Distance to floor"
              : editingMeasurement.axis === "x"
                ? editingMeasurement.direction === "before"
                  ? "Gap to left"
                  : "Gap to right"
                : editingMeasurement.direction === "before"
                  ? "Gap below"
                  : "Gap above"}
          </div>
        </div>
      )}

      {/* Sticky Note Tool Hint */}
      {stickyNoteTool && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 bg-yellow-100 text-yellow-800 text-sm px-3 py-1.5 rounded-lg shadow-lg border border-yellow-300">
          Click anywhere to place a sticky note
        </div>
      )}

      {/* Status Bar - Bottom Left */}
      {calculateGaps && (
        <div className="absolute bottom-4 left-4 z-20 text-xs bg-slate-800 text-slate-300 rounded-lg px-3 py-1.5 shadow-lg font-mono">
          <span className="text-slate-500">x:</span>
          {Math.round(calculateGaps.panel.x)}{" "}
          <span className="text-slate-500">y:</span>
          {Math.round(calculateGaps.panel.y)}
          <span className="mx-2 text-slate-600">|</span>
          <span className="text-slate-500">w:</span>
          {Math.round(calculateGaps.visible.width)}{" "}
          <span className="text-slate-500">h:</span>
          {Math.round(calculateGaps.visible.height)}
        </div>
      )}

      {/* Scale Indicator - Bottom Left (when no panel selected) */}
      {!calculateGaps && (
        <div className="absolute bottom-4 left-4 z-20 text-xs bg-white/90 backdrop-blur text-slate-600 rounded-lg px-3 py-2 shadow-lg border border-slate-200">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div 
                className="h-1 bg-slate-400 rounded-full" 
                style={{ width: `${Math.max(20, 100 * zoom)}px` }}
              />
            </div>
            <span className="font-mono">
              = {zoom > 0.5 ? "10cm" : zoom > 0.2 ? "10cm" : zoom > 0.1 ? "50cm" : "1m"}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Grid: {zoom > 0.5 ? "1cm" : zoom > 0.2 ? "5cm" : zoom > 0.1 ? "10cm" : "50cm"} · All values in mm
          </div>
        </div>
      )}

      {/* Modifier Hints - Above toolbar when dragging */}
      <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
        {dragging && shiftHeld && (
          <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded-lg shadow-lg">
            ⇧ Constrain
          </span>
        )}
        {dragging && ctrlHeld && (
          <span className="text-xs bg-orange-500 text-white px-2 py-1 rounded-lg shadow-lg">
            ⌘ Free Move
          </span>
        )}
        {hasDuplicatedOnDrag && (
          <span className="text-xs bg-green-500 text-white px-2 py-1 rounded-lg shadow-lg">
            ⌥ Duplicated
          </span>
        )}
        {snapGuides.some((g) => g.isEqualSpacing) && (
          <span className="text-xs bg-emerald-500 text-white px-2 py-1 rounded-lg shadow-lg">
            ↔ Equal Spacing
          </span>
        )}
      </div>

      {/* Keyboard Hints - Top Right (small, unobtrusive) */}
      {!dragging && !resizing && (
        <div className="absolute top-4 right-4 z-20 text-[10px] text-slate-400 bg-white/80 backdrop-blur rounded-lg px-2 py-1.5 shadow">
          <span><span className="text-slate-500 font-medium">Dbl-click</span> add</span>
          <span className="text-slate-300 mx-1">·</span>
          <span><span className="text-slate-500 font-medium">⇧</span> straight</span>
          <span className="text-slate-300 mx-1">·</span>
          <span><span className="text-slate-500 font-medium">⌥</span> copy</span>
        </div>
      )}

      {/* Canvas */}
      <div 
        ref={containerRef} 
        className="w-full h-full" 
        onContextMenu={handleContextMenu}
      >
        <svg
          ref={svgRef}
          width={canvasSize.width || "100%"}
          height={canvasSize.height || "100%"}
          viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
          onMouseMove={handleMouseMoveThrottled}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onMouseDown={handleCanvasMouseDown}
          onClick={handleCanvasClick}
          onDoubleClick={handleCanvasDoubleClick}
          style={{ 
            cursor: getCursor(),
            willChange: dragging || isPanning ? 'transform' : 'auto',
          }}
        >
          <rect
            x={viewBoxX - 1000}
            y={viewBoxY - 1000}
            width={viewBoxWidth + 2000}
            height={viewBoxHeight + 2000}
            fill="#f1f5f9"
            onClick={() => clearSelection()}
          />
          {renderGrid()}
          {renderAxes()}
          {panels.map(renderPanel)}
          {renderSelectionBounds()}
          {renderSnapGuides()}
          {renderMeasurements()}
          {renderMeasureTool()}
          {renderStickyNotes()}
          {renderMarqueeSelection()}
          {panels.length === 0 && stickyNotes.length === 0 && (
            <g>
              {/* Empty state illustration */}
              <rect
                x={viewBoxX + viewBoxWidth / 2 - 60 / zoom}
                y={viewBoxY + viewBoxHeight / 2 - 80 / zoom}
                width={120 / zoom}
                height={80 / zoom}
                rx={8 / zoom}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth={2 / zoom}
                strokeDasharray={`${8 / zoom} ${4 / zoom}`}
              />
              <text
                x={viewBoxX + viewBoxWidth / 2}
                y={viewBoxY + viewBoxHeight / 2 + 20 / zoom}
                textAnchor="middle"
                fontSize={14 / zoom}
                fill="#64748b"
                fontWeight="500"
              >
                Start designing your furniture
              </text>
              <text
                x={viewBoxX + viewBoxWidth / 2}
                y={viewBoxY + viewBoxHeight / 2 + 45 / zoom}
                textAnchor="middle"
                fontSize={11 / zoom}
                fill="#94a3b8"
              >
                Click "Add Panel" above or press N
              </text>
            </g>
          )}
          {renderVerticalRuler()}
          {renderHorizontalRuler()}
          {showRulers && (
            <rect
              x={viewBoxX}
              y={viewBoxY}
              width={RULER_SIZE / zoom}
              height={RULER_SIZE / zoom}
              fill="rgba(241,245,249,0.95)"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
