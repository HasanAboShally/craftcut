import { Hand, Maximize, MousePointer2, Move, Printer, Redo2, Ruler, StickyNote, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDesignStore } from "../stores/designStore";
import type { Panel, StickyNote as StickyNoteType } from "../types";
import PrintView from "./PrintView";

// =============================================================================
// COORDINATE SYSTEM: Y-UP (like real-world furniture)
// =============================================================================
// - World coords: Y=0 is floor, positive Y goes UP
// - Panel.y stores the BOTTOM edge of the panel (lowest Y value)
// - Panel.x stores the LEFT edge of the panel
// - Screen coords (SVG): Y=0 is top, positive Y goes DOWN
// - Conversion: screenY = -worldY (simple negation)
// =============================================================================

const GRID_SIZE = 20;
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
  const darken = (val: number, amount: number) => Math.max(0, Math.floor(val * (1 - amount)));
  const toHex = (val: number) => val.toString(16).padStart(2, "0");
  return {
    base: baseColor,
    grain: `#${toHex(darken(r, 0.1))}${toHex(darken(g, 0.1))}${toHex(darken(b, 0.1))}`,
    dark: `#${toHex(darken(r, 0.25))}${toHex(darken(g, 0.25))}${toHex(darken(b, 0.25))}`,
  };
}

function getTrueDimensions(panel: Panel, thickness: number): { width: number; height: number } {
  const orientation = panel.orientation || "horizontal";
  switch (orientation) {
    case "horizontal": return { width: panel.width, height: thickness };
    case "vertical": return { width: thickness, height: panel.height };
    case "back": return { width: panel.width, height: panel.height };
    default: return { width: panel.width, height: panel.height };
  }
}

// Get expanded hit area for easier clicking on thin panels
function getHitArea(panel: Panel, thickness: number): { width: number; height: number; offsetX: number; offsetY: number } {
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
  const { panels, selectedPanelIds, selectPanel, selectPanels, selectAll, clearSelection, updatePanel, deletePanel, deletePanels, settings, undo, redo, saveToHistory, canUndo, canRedo, stickyNotes, addStickyNote, updateStickyNote, deleteStickyNote, viewState, updateViewState } = useDesignStore();
  
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAutoCentered = useRef(false);
  
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [dragging, setDragging] = useState<string | null>(null);
  const [draggingMultiple, setDraggingMultiple] = useState(false);
  const [dragStartPositions, setDragStartPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [resizing, setResizing] = useState<{ id: string; corner: string } | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [panelStart, setPanelStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  
  // Use viewState from store for zoom/pan persistence
  const [zoom, setZoomLocal] = useState(viewState.zoom);
  const [pan, setPanLocal] = useState({ x: viewState.panX, y: viewState.panY });
  
  // Sync local state changes back to store
  const setZoom = useCallback((newZoom: number | ((prev: number) => number)) => {
    setZoomLocal(prev => {
      const value = typeof newZoom === 'function' ? newZoom(prev) : newZoom;
      updateViewState({ zoom: value });
      return value;
    });
  }, [updateViewState]);
  
  const setPan = useCallback((newPan: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => {
    setPanLocal(prev => {
      const value = typeof newPan === 'function' ? newPan(prev) : newPan;
      updateViewState({ panX: value.x, panY: value.y });
      return value;
    });
  }, [updateViewState]);
  
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [altHeld, setAltHeld] = useState(false);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const [clipboard, setClipboard] = useState<Panel[]>([]);
  const [tool, setTool] = useState<"select" | "pan">("select");
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
  const [dragAxis, setDragAxis] = useState<"free" | "horizontal" | "vertical">("free");
  const [hasDuplicatedOnDrag, setHasDuplicatedOnDrag] = useState(false);
  
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
  
  // Print view
  const [showPrintView, setShowPrintView] = useState(false);

  // ViewBox in screen coordinates
  const viewBoxWidth = canvasSize.width / zoom;
  const viewBoxHeight = canvasSize.height / zoom;
  const viewBoxX = -pan.x / zoom - viewBoxWidth / 2;
  const viewBoxY = -pan.y / zoom - viewBoxHeight / 2;
  
  // For backward compatibility - get first selected panel
  const selectedPanelId = selectedPanelIds.length === 1 ? selectedPanelIds[0] : null;

  // ===========================================================================
  // GAP CALCULATIONS
  // ===========================================================================
  
  const calculateGaps = useMemo(() => {
    if (!selectedPanelId) return null;
    const selectedPanel = panels.find(p => p.id === selectedPanelId);
    if (!selectedPanel) return null;
    const visible = getTrueDimensions(selectedPanel, settings.thickness);
    return { panel: selectedPanel, visible };
  }, [selectedPanelId, panels, settings.thickness]);

  // ===========================================================================
  // SNAPPING
  // ===========================================================================
  
  const getSnapPoints = useCallback((excludeIds: string[]) => {
    const points: { x: number[]; y: number[] } = { x: [], y: [] };
    const panelEdges: { id: string; left: number; right: number; bottom: number; top: number; width: number; height: number }[] = [];
    
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
      
      panelEdges.push({ id: p.id, left, right, bottom, top, width: trueDims.width, height: trueDims.height });
    });
    points.y.push(0); // Floor
    
    return { points, panelEdges };
  }, [panels, settings.thickness]);

  // Find equal spacing positions between panels
  const findEqualSpacingSnaps = useCallback((
    excludeIds: string[],
    panelWidth: number,
    panelHeight: number,
    rawX: number,
    rawY: number
  ) => {
    const { panelEdges } = getSnapPoints(excludeIds);
    const snaps: { axis: "x" | "y"; position: number; gap: number; guides: SnapGuide[] }[] = [];
    
    // For X-axis: find panels that are horizontally aligned (overlapping in Y)
    // and calculate equal spacing positions
    const panelBottom = rawY;
    const panelTop = rawY + panelHeight;
    
    // Get panels that overlap vertically with the dragged panel
    const horizontalNeighbors = panelEdges
      .filter(p => p.top > panelBottom && p.bottom < panelTop)
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
        
        if (Math.abs(leftGap - rightGap) < 1) { // Truly centered
          snaps.push({
            axis: "x",
            position: centerX,
            gap: leftGap,
            guides: [
              { type: "vertical", position: gapStart, start: -2000, end: 2000, isEqualSpacing: true, gapSize: leftGap },
              { type: "vertical", position: centerX, start: -2000, end: 2000, isEqualSpacing: true, gapSize: leftGap },
              { type: "vertical", position: centerX + panelWidth, start: -2000, end: 2000, isEqualSpacing: true, gapSize: rightGap },
              { type: "vertical", position: gapEnd, start: -2000, end: 2000, isEqualSpacing: true, gapSize: rightGap },
            ]
          });
        }
      }
    }
    
    // For Y-axis: find panels that are vertically aligned (overlapping in X)
    const panelLeft = rawX;
    const panelRight = rawX + panelWidth;
    
    const verticalNeighbors = panelEdges
      .filter(p => p.right > panelLeft && p.left < panelRight)
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
              { type: "horizontal", position: gapStart, start: -2000, end: 2000, isEqualSpacing: true, gapSize: bottomGap },
              { type: "horizontal", position: centerY, start: -2000, end: 2000, isEqualSpacing: true, gapSize: bottomGap },
              { type: "horizontal", position: centerY + panelHeight, start: -2000, end: 2000, isEqualSpacing: true, gapSize: topGap },
              { type: "horizontal", position: gapEnd, start: -2000, end: 2000, isEqualSpacing: true, gapSize: topGap },
            ]
          });
        }
      }
    }
    
    // Also find positions that match existing gaps (distribute evenly)
    // Look for repeated gap patterns
    const xGaps: number[] = [];
    for (let i = 0; i < horizontalNeighbors.length - 1; i++) {
      xGaps.push(horizontalNeighbors[i + 1].left - horizontalNeighbors[i].right);
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
            guides: [{ type: "vertical", position: snapRight, start: -2000, end: 2000, isEqualSpacing: true, gapSize: commonGap }]
          });
        }
        // Position to create same gap to the left of this panel
        const snapLeft = panel.left - panelWidth - commonGap;
        if (Math.abs(rawX - snapLeft) < SNAP_THRESHOLD / zoom) {
          snaps.push({
            axis: "x",
            position: snapLeft,
            gap: commonGap,
            guides: [{ type: "vertical", position: snapLeft + panelWidth, start: -2000, end: 2000, isEqualSpacing: true, gapSize: commonGap }]
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
            guides: [{ type: "horizontal", position: snapAbove, start: -2000, end: 2000, isEqualSpacing: true, gapSize: commonGap }]
          });
        }
        const snapBelow = panel.bottom - panelHeight - commonGap;
        if (Math.abs(rawY - snapBelow) < SNAP_THRESHOLD / zoom) {
          snaps.push({
            axis: "y",
            position: snapBelow,
            gap: commonGap,
            guides: [{ type: "horizontal", position: snapBelow + panelHeight, start: -2000, end: 2000, isEqualSpacing: true, gapSize: commonGap }]
          });
        }
      }
    }
    
    return snaps;
  }, [getSnapPoints, zoom]);

  const findSnapPosition = useCallback((excludeIds: string[], rawX: number, rawY: number, panelWidth: number, panelHeight: number) => {
    const { points: snapPoints } = getSnapPoints(excludeIds);
    const guides: SnapGuide[] = [];
    let snappedX = rawX, snappedY = rawY;

    const edges = {
      left: rawX, centerX: rawX + panelWidth / 2, right: rawX + panelWidth,
      bottom: rawY, centerY: rawY + panelHeight / 2, top: rawY + panelHeight,
    };

    let minXDiff = SNAP_THRESHOLD / zoom;
    (["left", "centerX", "right"] as const).forEach((edge) => {
      snapPoints.x.forEach((snapX) => {
        const diff = Math.abs(edges[edge] - snapX);
        if (diff < minXDiff) {
          minXDiff = diff;
          snappedX = edge === "left" ? snapX : edge === "centerX" ? snapX - panelWidth / 2 : snapX - panelWidth;
          guides.push({ type: "vertical", position: snapX, start: -2000, end: 2000 });
        }
      });
    });

    let minYDiff = SNAP_THRESHOLD / zoom;
    (["bottom", "centerY", "top"] as const).forEach((edge) => {
      snapPoints.y.forEach((snapY) => {
        const diff = Math.abs(edges[edge] - snapY);
        if (diff < minYDiff) {
          minYDiff = diff;
          snappedY = edge === "bottom" ? snapY : edge === "centerY" ? snapY - panelHeight / 2 : snapY - panelHeight;
          guides.push({ type: "horizontal", position: snapY, start: -2000, end: 2000 });
        }
      });
    });
    
    // Check equal spacing snaps - these take priority when close
    const equalSnaps = findEqualSpacingSnaps(excludeIds, panelWidth, panelHeight, rawX, rawY);
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
  }, [getSnapPoints, findEqualSpacingSnaps, zoom]);

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

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP)), []);
  const handleResetZoom = useCallback(() => { setZoom(DEFAULT_ZOOM); setPan({ x: 0, y: 0 }); }, []);

  const handleFitToContent = useCallback(() => {
    if (panels.length === 0) { handleResetZoom(); return; }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    panels.forEach(p => {
      const dims = getTrueDimensions(p, settings.thickness);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + dims.width);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y + dims.height);
    });
    const contentWidth = maxX - minX + 100, contentHeight = maxY - minY + 100;
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    const fitZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(canvasSize.width / contentWidth, canvasSize.height / contentHeight, 1)));
    setZoom(fitZoom);
    setPan({ x: -centerX * fitZoom, y: centerY * fitZoom });
  }, [panels, handleResetZoom, canvasSize, settings.thickness]);

  useEffect(() => {
    if (hasAutoCentered.current || panels.length === 0 || canvasSize.width === 0) return;
    const timer = setTimeout(() => { handleFitToContent(); hasAutoCentered.current = true; }, 100);
    return () => clearTimeout(timer);
  }, [panels.length, canvasSize, handleFitToContent]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Pinch zoom on trackpad - use proportional zoom for smoother experience
        // Smaller delta for finer control, proportional to current zoom
        const zoomFactor = 0.01; // Much smaller for trackpad pinch
        const delta = -e.deltaY * zoomFactor;
        setZoomLocal((z) => {
          const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * (1 + delta)));
          updateViewState({ zoom: newZoom });
          return newZoom;
        });
      } else {
        // Two-finger pan on trackpad
        setPanLocal((p) => {
          const newPan = { x: p.x - e.deltaX, y: p.y - e.deltaY };
          updateViewState({ panX: newPan.x, panY: newPan.y });
          return newPan;
        });
      }
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [updateViewState]);

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
  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    const worldX = viewBoxX + screenX / zoom;
    const worldY = screenToWorldY(viewBoxY + screenY / zoom);
    return { x: worldX, y: worldY };
  }, [viewBoxX, viewBoxY, zoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent, panel: Panel, action: "drag" | "resize", corner?: string) => {
    e.stopPropagation();
    setDragStart(getSVGPoint(e));
    setPanelStart({ x: panel.x, y: panel.y, width: panel.width, height: panel.height });
    setDragAxis("free");
    setHasDuplicatedOnDrag(false);
    
    // Save to history before drag/resize starts (for undo)
    saveToHistory();
    
    if (action === "drag") {
      const isAlreadySelected = selectedPanelIds.includes(panel.id);
      
      // Alt+drag = duplicate
      if (e.altKey) {
        // Duplicate all selected panels if this panel is selected, otherwise just this one
        const panelsToDuplicate = isAlreadySelected ? panels.filter(p => selectedPanelIds.includes(p.id)) : [panel];
        const newPanels = panelsToDuplicate.map(p => ({
          ...p,
          id: `panel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          label: `${p.label} copy`,
        }));
        useDesignStore.setState({ panels: [...useDesignStore.getState().panels, ...newPanels] });
        selectPanels(newPanels.map(p => p.id));
        setDragging(newPanels[0].id);
        setDraggingMultiple(newPanels.length > 1);
        // Store start positions for all new panels
        const startPos = new Map<string, { x: number; y: number }>();
        newPanels.forEach(p => startPos.set(p.id, { x: p.x, y: p.y }));
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
          panels.filter(p => selectedPanelIds.includes(p.id)).forEach(p => startPos.set(p.id, { x: p.x, y: p.y }));
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
  }, [selectPanel, selectPanels, selectedPanelIds, panels, getSVGPoint, saveToHistory]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
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
      
      const selectedIds = panels.filter(p => {
        const dims = getTrueDimensions(p, settings.thickness);
        const panelMinX = p.x;
        const panelMaxX = p.x + dims.width;
        const panelMinY = p.y;
        const panelMaxY = p.y + dims.height;
        // Check if panel intersects with marquee
        return panelMinX < maxX && panelMaxX > minX && panelMinY < maxY && panelMaxY > minY;
      }).map(p => p.id);
      
      selectPanels(selectedIds);
      return;
    }
    
    if (isPanning) {
      setPan((p) => ({ x: p.x + e.clientX - panStart.x, y: p.y + e.clientY - panStart.y }));
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
          if (Math.abs(dxWorld) > threshold || Math.abs(dyWorld) > threshold) {
            setDragAxis(Math.abs(dxWorld) > Math.abs(dyWorld) ? "horizontal" : "vertical");
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
        const primaryPanel = panels.find(p => p.id === dragging);
        if (!primaryPanel) return;
        
        const trueDims = getTrueDimensions(primaryPanel, settings.thickness);
        const primaryStartPos = dragStartPositions.get(primaryPanel.id);
        if (!primaryStartPos) return;
        
        const rawX = primaryStartPos.x + dxWorld;
        const rawY = primaryStartPos.y + dyWorld;
        
        let finalX = rawX, finalY = rawY;
        
        if (disableSnap) {
          setSnapGuides([]);
          finalX = Math.round(rawX / GRID_SIZE) * GRID_SIZE;
          finalY = Math.round(rawY / GRID_SIZE) * GRID_SIZE;
        } else {
          const { x: snappedX, y: snappedY, guides } = findSnapPosition(selectedPanelIds, rawX, rawY, trueDims.width, trueDims.height);
          setSnapGuides(guides);
          finalX = guides.some(g => g.type === "vertical") ? snappedX : Math.round(rawX / GRID_SIZE) * GRID_SIZE;
          finalY = guides.some(g => g.type === "horizontal") ? snappedY : Math.round(rawY / GRID_SIZE) * GRID_SIZE;
        }
        
        // Calculate delta from snapped primary position
        const deltaX = finalX - primaryStartPos.x;
        const deltaY = finalY - primaryStartPos.y;
        
        // Move all selected panels by the same delta
        panels.filter(p => selectedPanelIds.includes(p.id)).forEach(p => {
          const startPos = dragStartPositions.get(p.id);
          if (startPos) {
            updatePanel(p.id, { 
              x: Math.round((startPos.x + deltaX) / GRID_SIZE) * GRID_SIZE, 
              y: Math.round((startPos.y + deltaY) / GRID_SIZE) * GRID_SIZE 
            });
          }
        });
      } else {
        // Single panel drag with snapping
        const draggedPanel = panels.find((p) => p.id === dragging);
        if (!draggedPanel) return;
        
        const trueDims = getTrueDimensions(draggedPanel, settings.thickness);
        const rawX = panelStart.x + dxWorld, rawY = panelStart.y + dyWorld;
        
        if (e.ctrlKey || e.metaKey) {
          setSnapGuides([]);
          const finalX = Math.round(rawX / GRID_SIZE) * GRID_SIZE;
          const finalY = Math.round(rawY / GRID_SIZE) * GRID_SIZE;
          updatePanel(dragging, { x: finalX, y: finalY });
        } else {
          const { x: snappedX, y: snappedY, guides } = findSnapPosition([dragging], rawX, rawY, trueDims.width, trueDims.height);
          setSnapGuides(guides);
          const finalX = guides.some(g => g.type === "vertical") ? snappedX : Math.round(rawX / GRID_SIZE) * GRID_SIZE;
          const finalY = guides.some(g => g.type === "horizontal") ? snappedY : Math.round(rawY / GRID_SIZE) * GRID_SIZE;
          updatePanel(dragging, { x: finalX, y: finalY });
        }
      }
    } else if (resizing) {
      const { corner } = resizing;
      let newWidth = panelStart.width, newHeight = panelStart.height, newX = panelStart.x, newY = panelStart.y;
      if (corner.includes("e")) newWidth = Math.max(50, panelStart.width + dxWorld);
      if (corner.includes("w")) { newWidth = Math.max(50, panelStart.width - dxWorld); newX = panelStart.x + panelStart.width - newWidth; }
      if (corner.includes("n")) newHeight = Math.max(50, panelStart.height + dyWorld);
      if (corner.includes("s")) { newHeight = Math.max(50, panelStart.height - dyWorld); newY = panelStart.y + panelStart.height - newHeight; }
      updatePanel(resizing.id, {
        x: Math.round(newX / GRID_SIZE) * GRID_SIZE, y: Math.round(newY / GRID_SIZE) * GRID_SIZE,
        width: Math.round(newWidth / GRID_SIZE) * GRID_SIZE, height: Math.round(newHeight / GRID_SIZE) * GRID_SIZE,
      });
    }
  }, [dragging, draggingMultiple, dragStartPositions, resizing, dragStart, panelStart, getSVGPoint, screenToWorld, updatePanel, isPanning, panStart, zoom, panels, settings.thickness, findSnapPosition, isMarqueeSelecting, marqueeStart, selectPanels, selectedPanelIds, dragAxis, draggingNote, noteStart, updateStickyNote]);

  const handleMouseUp = useCallback(() => {
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
  
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    // If sticky note tool is active, add a new note
    if (stickyNoteTool) {
      const point = getSVGPoint(e);
      const worldPoint = screenToWorld(point.x, point.y);
      addStickyNote(worldPoint.x, worldPoint.y);
      setStickyNoteTool(false);
      return;
    }
    if (e.target === svgRef.current) selectPanel(null);
  }, [selectPanel, stickyNoteTool, getSVGPoint, screenToWorld, addStickyNote]);
  
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
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
  }, [spaceHeld, tool, getSVGPoint, screenToWorld, selectPanel]);

  // ===========================================================================
  // KEYBOARD
  // ===========================================================================
  
  const handleCopy = useCallback(() => {
    const selected = panels.filter(p => selectedPanelIds.includes(p.id));
    if (selected.length > 0) setClipboard(selected.map(p => ({ ...p })));
  }, [selectedPanelIds, panels]);
  
  const handlePaste = useCallback(() => {
    if (clipboard.length === 0) return;
    saveToHistory();
    const newPanels = clipboard.map(p => ({
      ...p,
      id: `panel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      label: `${p.label} copy`,
      x: p.x + 40,
      y: p.y + 40,
    }));
    useDesignStore.setState({ panels: [...useDesignStore.getState().panels, ...newPanels] });
    selectPanels(newPanels.map(p => p.id));
  }, [clipboard, selectPanels, saveToHistory]);
  
  const handleDuplicate = useCallback(() => {
    const selected = panels.filter(p => selectedPanelIds.includes(p.id));
    if (selected.length === 0) return;
    saveToHistory();
    const newPanels = selected.map(p => ({
      ...p,
      id: `panel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      label: `${p.label} copy`,
      x: p.x + 40,
      y: p.y + 40,
    }));
    useDesignStore.setState({ panels: [...useDesignStore.getState().panels, ...newPanels] });
    selectPanels(newPanels.map(p => p.id));
  }, [selectedPanelIds, panels, selectPanels, saveToHistory]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = (e.target as HTMLElement).tagName === "INPUT";
      // Track modifier keys
      if (e.shiftKey) setShiftHeld(true);
      if (e.altKey) setAltHeld(true);
      if (e.ctrlKey || e.metaKey) setCtrlHeld(true);
      
      if (e.code === "Space" && !isInput) { e.preventDefault(); setSpaceHeld(true); }
      if (e.key === "Escape") { selectPanel(null); setDragging(null); setResizing(null); setSnapGuides([]); setIsMarqueeSelecting(false); }
      
      // Delete selected panels
      if ((e.key === "Delete" || e.key === "Backspace") && selectedPanelIds.length > 0 && !isInput) {
        e.preventDefault();
        if (selectedPanelIds.length === 1) {
          deletePanel(selectedPanelIds[0]);
        } else {
          deletePanels(selectedPanelIds);
        }
      }
      if (isInput) return;
      
      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) { e.preventDefault(); redo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "y") { e.preventDefault(); redo(); }
      
      if (e.key === "=" || e.key === "+") handleZoomIn();
      if (e.key === "-") handleZoomOut();
      if (e.key === "0") handleResetZoom();
      if (e.key === "f") handleFitToContent();
      if (e.key === "v") setTool("select");
      if (e.key === "h") setTool("pan");
      if (e.key === "r") setShowRulers(r => !r);
      if (e.key === "m") setShowMeasurements(m => !m);
      if (e.key === "n") setStickyNoteTool(n => !n);
      if (e.key === "p" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setShowPrintView(true); }
      if ((e.metaKey || e.ctrlKey) && e.key === "c") { e.preventDefault(); handleCopy(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "v") { e.preventDefault(); handlePaste(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "d") { e.preventDefault(); handleDuplicate(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "a") { e.preventDefault(); selectAll(); }
      
      // Arrow key nudge - move all selected panels
      if (selectedPanelIds.length > 0 && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        saveToHistory();
        const amount = e.shiftKey ? NUDGE_AMOUNT_LARGE : NUDGE_AMOUNT;
        selectedPanelIds.forEach(id => {
          const panel = panels.find(p => p.id === id);
          if (!panel) return;
          if (e.key === "ArrowUp") updatePanel(id, { y: panel.y + amount });
          if (e.key === "ArrowDown") updatePanel(id, { y: panel.y - amount });
          if (e.key === "ArrowLeft") updatePanel(id, { x: panel.x - amount });
          if (e.key === "ArrowRight") updatePanel(id, { x: panel.x + amount });
        });
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") { setSpaceHeld(false); setIsPanning(false); }
      if (!e.shiftKey) setShiftHeld(false);
      if (!e.altKey) setAltHeld(false);
      if (!e.ctrlKey && !e.metaKey) setCtrlHeld(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => { window.removeEventListener("keydown", handleKeyDown); window.removeEventListener("keyup", handleKeyUp); };
  }, [selectedPanelIds, deletePanels, deletePanel, handleZoomIn, handleZoomOut, handleResetZoom, handleFitToContent, handleCopy, handlePaste, handleDuplicate, panels, updatePanel, selectPanel, selectAll, undo, redo, saveToHistory]);

  // ===========================================================================
  // RENDER HELPERS
  // ===========================================================================
  
  const renderGrid = () => {
    const lines = [];
    const startX = Math.floor(viewBoxX / GRID_SIZE) * GRID_SIZE;
    const endX = viewBoxX + viewBoxWidth + GRID_SIZE;
    const startY = Math.floor(viewBoxY / GRID_SIZE) * GRID_SIZE;
    const endY = viewBoxY + viewBoxHeight + GRID_SIZE;
    for (let x = startX; x <= endX; x += GRID_SIZE) lines.push(<line key={`v${x}`} x1={x} y1={startY} x2={x} y2={endY} stroke="#e5e5e5" strokeWidth={1 / zoom} />);
    for (let y = startY; y <= endY; y += GRID_SIZE) lines.push(<line key={`h${y}`} x1={startX} y1={y} x2={endX} y2={y} stroke="#e5e5e5" strokeWidth={1 / zoom} />);
    return lines;
  };

  const renderHorizontalRuler = () => {
    if (!showRulers) return null;
    const step = zoom > 0.5 ? 50 : zoom > 0.2 ? 100 : 200;
    const start = Math.floor(viewBoxX / step) * step;
    return (
      <g>
        <rect x={viewBoxX} y={viewBoxY} width={viewBoxWidth} height={RULER_SIZE / zoom} fill="rgba(255,255,255,0.95)" />
        {Array.from({ length: Math.ceil(viewBoxWidth / step) + 2 }).map((_, i) => {
          const x = start + i * step;
          return (
            <g key={x}>
              <line x1={x} y1={viewBoxY} x2={x} y2={viewBoxY + 12 / zoom} stroke="#666" strokeWidth={1 / zoom} />
              <text x={x + 2 / zoom} y={viewBoxY + 20 / zoom} fontSize={9 / zoom} fill="#666">{x}</text>
            </g>
          );
        })}
      </g>
    );
  };

  const renderVerticalRuler = () => {
    if (!showRulers) return null;
    const step = zoom > 0.5 ? 50 : zoom > 0.2 ? 100 : 200;
    const start = Math.floor(viewBoxY / step) * step;
    return (
      <g>
        <rect x={viewBoxX} y={viewBoxY} width={RULER_SIZE / zoom} height={viewBoxHeight} fill="rgba(255,255,255,0.95)" />
        {Array.from({ length: Math.ceil(viewBoxHeight / step) + 2 }).map((_, i) => {
          const screenY = start + i * step;
          const worldY = screenToWorldY(screenY);
          return (
            <g key={screenY}>
              <line x1={viewBoxX} y1={screenY} x2={viewBoxX + 12 / zoom} y2={screenY} stroke="#666" strokeWidth={1 / zoom} />
              <text x={viewBoxX + 14 / zoom} y={screenY + 3 / zoom} fontSize={9 / zoom} fill="#666">{worldY}</text>
            </g>
          );
        })}
      </g>
    );
  };

  const renderFloorLine = () => {
    const screenY = worldToScreenY(0);
    if (screenY < viewBoxY || screenY > viewBoxY + viewBoxHeight) return null;
    return (
      <g>
        <line x1={viewBoxX} y1={screenY} x2={viewBoxX + viewBoxWidth} y2={screenY} stroke="#10b981" strokeWidth={2 / zoom} strokeDasharray={`${8/zoom},${4/zoom}`} />
        <text x={viewBoxX + RULER_SIZE / zoom + 5 / zoom} y={screenY - 5 / zoom} fontSize={11 / zoom} fill="#10b981" fontWeight={600}>Floor (Y=0)</text>
      </g>
    );
  };

  const renderPanel = (panel: Panel) => {
    const isSelected = selectedPanelIds.includes(panel.id);
    const woodColor = getWoodColorVariants(settings.woodColor || "#E8D4B8");
    const trueDims = getTrueDimensions(panel, settings.thickness);
    const hitArea = getHitArea(panel, settings.thickness);
    const { width, height } = trueDims;
    const orientation = panel.orientation || "horizontal";

    // Screen position: panel.y is BOTTOM, so top in world = panel.y + height
    const screenX = panel.x;
    const screenY = worldToScreenY(panel.y + height);
    const handleSize = 12 / zoom;
    
    // Hit area extends around the true panel for easier clicking
    const hitX = screenX - hitArea.offsetX;
    const hitY = screenY - hitArea.offsetY;

    return (
      <g key={panel.id} data-panel-id={panel.id}>
        {/* Invisible hit area for easier clicking on thin panels */}
        <rect
          x={hitX} y={hitY} width={hitArea.width} height={hitArea.height}
          fill="transparent"
          style={{ cursor: spaceHeld || tool === "pan" ? "grab" : "move" }}
          onMouseDown={(e) => { if (!spaceHeld && tool !== "pan") handleMouseDown(e, panel, "drag"); }}
        />
        {/* Visible panel at TRUE size */}
        <rect
          x={screenX} y={screenY} width={width} height={height}
          fill={woodColor.base}
          stroke={isSelected ? "#2563eb" : woodColor.dark}
          strokeWidth={isSelected ? 3 / zoom : 1.5 / zoom}
          rx={2} ry={2}
          pointerEvents="none"
        />
        {/* Orientation indicator - small icon in corner */}
        <text x={screenX + 6 / zoom} y={screenY + 14 / zoom} fontSize={10 / zoom} fill="#888" pointerEvents="none">{orientation === "horizontal" ? "═" : orientation === "vertical" ? "║" : "▢"}</text>
        
        {/* Only show resize handles when exactly one panel is selected */}
        {isSelected && selectedPanelIds.length === 1 && (orientation === "back" ? ["nw", "ne", "sw", "se", "n", "s", "e", "w"] : orientation === "horizontal" ? ["e", "w"] : ["n", "s"]).map((corner) => {
          let hx = screenX + width / 2 - handleSize / 2, hy = screenY + height / 2 - handleSize / 2;
          if (corner.includes("e")) hx = screenX + width - handleSize / 2;
          if (corner.includes("w")) hx = screenX - handleSize / 2;
          if (corner.includes("n")) hy = screenY - handleSize / 2;
          if (corner.includes("s")) hy = screenY + height - handleSize / 2;
          if (corner === "n" || corner === "s") hx = screenX + width / 2 - handleSize / 2;
          if (corner === "e" || corner === "w") hy = screenY + height / 2 - handleSize / 2;
          return <rect key={corner} x={hx} y={hy} width={handleSize} height={handleSize} fill="white" stroke="#2563eb" strokeWidth={2 / zoom} rx={2} style={{ cursor: corner.length === 2 ? `${corner}-resize` : corner === "n" || corner === "s" ? "ns-resize" : "ew-resize" }} onMouseDown={(e) => handleMouseDown(e, panel, "resize", corner)} />;
        })}
        
        {panel.quantity > 1 && (
          <>
            <circle cx={screenX + width - 16 / zoom} cy={screenY + 16 / zoom} r={12 / zoom} fill="#dc2626" stroke="white" strokeWidth={2 / zoom} />
            <text x={screenX + width - 16 / zoom} y={screenY + 20 / zoom} textAnchor="middle" fontSize={10 / zoom} fill="white" fontWeight={700}>×{panel.quantity}</text>
          </>
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
          y1={guide.type === "horizontal" ? worldToScreenY(guide.position) : worldToScreenY(guide.end)}
          x2={guide.type === "vertical" ? guide.position : guide.end}
          y2={guide.type === "horizontal" ? worldToScreenY(guide.position) : worldToScreenY(guide.start)}
          stroke={color} 
          strokeWidth={(guide.isEqualSpacing ? 1.5 : 1) / zoom} 
          strokeDasharray={guide.isEqualSpacing ? "none" : `${4 / zoom},${4 / zoom}`}
        />
      );
      
      // Show gap measurement for equal spacing (avoid duplicates)
      if (guide.isEqualSpacing && guide.gapSize !== undefined) {
        const gapKey = `${guide.type}-${Math.round(guide.gapSize)}`;
        if (!seenGaps.has(gapKey)) {
          seenGaps.add(gapKey);
          const labelX = guide.type === "vertical" ? guide.position + 5 / zoom : viewBoxX + viewBoxWidth / 2;
          const labelY = guide.type === "horizontal" ? worldToScreenY(guide.position) + 15 / zoom : viewBoxY + 50 / zoom;
          
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
            </g>
          );
        }
      }
    });
    
    return [...renderedGuides, ...gapLabels];
  };

  const renderMarqueeSelection = () => {
    if (!isMarqueeSelecting || !marqueeStart || !marqueeEnd) return null;
    const x = Math.min(marqueeStart.x, marqueeEnd.x);
    const y = Math.min(marqueeStart.y, marqueeEnd.y);
    const width = Math.abs(marqueeEnd.x - marqueeStart.x);
    const height = Math.abs(marqueeEnd.y - marqueeStart.y);
    return (
      <rect
        x={x} y={y} width={width} height={height}
        fill="rgba(37, 99, 235, 0.1)"
        stroke="#2563eb"
        strokeWidth={1 / zoom}
        strokeDasharray={`${4 / zoom},${4 / zoom}`}
        pointerEvents="none"
      />
    );
  };

  const noteClickRef = useRef<{ noteId: string; timeout: NodeJS.Timeout } | null>(null);
  
  const handleNoteMouseDown = useCallback((e: React.MouseEvent, note: StickyNoteType) => {
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
  }, [getSVGPoint, editingNote]);

  const handleNoteDoubleClick = useCallback((e: React.MouseEvent, note: StickyNoteType) => {
    e.stopPropagation();
    // Clear any pending drag
    if (noteClickRef.current) {
      clearTimeout(noteClickRef.current.timeout);
      noteClickRef.current = null;
    }
    setEditingNote(note.id);
    setNoteInputValue(note.text);
  }, []);

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
    
    return stickyNotes.map(note => {
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
              onClick={(e) => { e.stopPropagation(); deleteStickyNote(note.id); }}
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
                {note.text || <span style={{ color: "#92400e", fontStyle: "italic" }}>Double-click to edit...</span>}
              </div>
            )}
          </foreignObject>
        </g>
      );
    });
  };

  const getCursor = () => {
    if (isPanning) return "grabbing";
    if (spaceHeld || tool === "pan") return "grab";
    if (stickyNoteTool) return "crosshair";
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
      x1: number; y1: number;
      x2: number; y2: number;
      labelX: number; labelY: number;
      panelId: string; // The panel that will move when editing
      neighborId?: string;
    }[] = [];
    
    // Get all panel bounds
    const panelBounds = panels.map(p => {
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
    panelBounds.forEach(panel => {
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
      const horizontalNeighbors = panelBounds.filter(p => 
        p.id !== panel.id && p.top > panel.bottom && p.bottom < panel.top
      );
      
      // Gap to panel on the right (only add from left panel's perspective to avoid duplicates)
      const rightNeighbor = horizontalNeighbors
        .filter(p => p.left > panel.right)
        .sort((a, b) => a.left - b.left)[0];
      
      if (rightNeighbor) {
        const gap = rightNeighbor.left - panel.right;
        if (gap > 0 && gap < 2000) {
          const avgY = (Math.max(panel.bottom, rightNeighbor.bottom) + Math.min(panel.top, rightNeighbor.top)) / 2;
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
      const verticalNeighbors = panelBounds.filter(p => 
        p.id !== panel.id && p.right > panel.left && p.left < panel.right
      );
      
      // Gap to panel above (only add from bottom panel's perspective)
      const aboveNeighbor = verticalNeighbors
        .filter(p => p.bottom > panel.top)
        .sort((a, b) => a.bottom - b.bottom)[0];
      
      if (aboveNeighbor) {
        const gap = aboveNeighbor.bottom - panel.top;
        if (gap > 0 && gap < 2000) {
          const avgX = (Math.max(panel.left, aboveNeighbor.left) + Math.min(panel.right, aboveNeighbor.right)) / 2;
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

  const handleMeasurementDoubleClick = useCallback((measurement: typeof getMeasurements[0], e: React.MouseEvent) => {
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
  }, []);

  const handleMeasurementSubmit = useCallback(() => {
    if (!editingMeasurement) return;
    
    const newValue = parseFloat(measurementInputValue);
    if (isNaN(newValue) || newValue < 0) {
      setEditingMeasurement(null);
      return;
    }
    
    const panel = panels.find(p => p.id === editingMeasurement.panelId);
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
  }, [editingMeasurement, measurementInputValue, panels, updatePanel, saveToHistory]);

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
        const floorIndex = getMeasurements.filter((mm, i) => i < index && mm.direction === "floor").length;
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
              b.x += (labelWidth + padding);
            } else {
              // Horizontal measurements - spread vertically
              b.y -= (labelHeight + padding);
            }
          } else {
            // Different axes - offset the later one
            b.y -= (labelHeight + padding);
          }
        }
      }
    }
    
    return resolvedPositions.map(({ m, x: adjustedLabelX, y: adjustedLabelY }) => {
      const screenY1 = worldToScreenY(m.y1);
      const screenY2 = worldToScreenY(m.y2);
      const isVertical = m.axis === "y";
      
      // Check if this measurement is relevant to a selected panel
      const isRelevant = selectedPanelIds.includes(m.panelId) || 
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
              <line x1={m.x1 - 6 / zoom} y1={screenY1} x2={m.x1 + 6 / zoom} y2={screenY1} stroke={DISTANCE_COLOR} strokeWidth={1.5 / zoom} />
              <line x1={m.x2 - 6 / zoom} y1={screenY2} x2={m.x2 + 6 / zoom} y2={screenY2} stroke={DISTANCE_COLOR} strokeWidth={1.5 / zoom} />
            </>
          ) : (
            <>
              <line x1={m.x1} y1={screenY1 - 6 / zoom} x2={m.x1} y2={screenY1 + 6 / zoom} stroke={DISTANCE_COLOR} strokeWidth={1.5 / zoom} />
              <line x1={m.x2} y1={screenY2 - 6 / zoom} x2={m.x2} y2={screenY2 + 6 / zoom} stroke={DISTANCE_COLOR} strokeWidth={1.5 / zoom} />
            </>
          )}
          {/* Leader line to label if offset significantly */}
          {Math.abs(adjustedLabelX - m.labelX) > 30 / zoom || Math.abs(adjustedLabelY - worldToScreenY(m.labelY)) > 30 / zoom ? (
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
    });
  };

  // ===========================================================================
  // RENDER
  // ===========================================================================
  
  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-50">
      {/* Floating Dark Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1.5 bg-slate-800 rounded-xl shadow-lg">
        <div className="flex items-center bg-slate-700 rounded-lg p-0.5">
          <button onClick={() => setTool("select")} className={`p-1.5 rounded-md transition-colors ${tool === "select" ? "bg-white text-slate-800" : "text-slate-300 hover:text-white"}`} title="Select (V)"><MousePointer2 size={16} /></button>
          <button onClick={() => setTool("pan")} className={`p-1.5 rounded-md transition-colors ${tool === "pan" ? "bg-white text-slate-800" : "text-slate-300 hover:text-white"}`} title="Pan (H)"><Hand size={16} /></button>
        </div>
        <div className="w-px h-5 bg-slate-600 mx-1" />
        <button onClick={undo} disabled={!canUndo} className={`p-1.5 rounded-md transition-colors ${canUndo ? "text-slate-300 hover:text-white hover:bg-slate-700" : "text-slate-600 cursor-not-allowed"}`} title="Undo (⌘Z)"><Undo2 size={16} /></button>
        <button onClick={redo} disabled={!canRedo} className={`p-1.5 rounded-md transition-colors ${canRedo ? "text-slate-300 hover:text-white hover:bg-slate-700" : "text-slate-600 cursor-not-allowed"}`} title="Redo (⌘⇧Z)"><Redo2 size={16} /></button>
        <div className="w-px h-5 bg-slate-600 mx-1" />
        <button onClick={handleZoomOut} className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-md transition-colors"><ZoomOut size={16} /></button>
        <span className="text-xs text-slate-300 w-10 text-center font-mono">{Math.round(zoom * 100)}%</span>
        <button onClick={handleZoomIn} className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-md transition-colors"><ZoomIn size={16} /></button>
        <button onClick={handleFitToContent} className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-md transition-colors" title="Fit (F)"><Maximize size={16} /></button>
        <div className="w-px h-5 bg-slate-600 mx-1" />
        <button onClick={() => setShowRulers(!showRulers)} className={`p-1.5 rounded-md transition-colors ${showRulers ? "bg-slate-600 text-white" : "text-slate-300 hover:text-white hover:bg-slate-700"}`} title="Rulers (R)"><Ruler size={16} /></button>
        <button onClick={() => setShowMeasurements(!showMeasurements)} className={`p-1.5 rounded-md transition-colors ${showMeasurements ? "bg-blue-500 text-white" : "text-slate-300 hover:text-white hover:bg-slate-700"}`} title="Measurements (M)"><Move size={16} /></button>
        <button onClick={() => setStickyNoteTool(!stickyNoteTool)} className={`p-1.5 rounded-md transition-colors ${stickyNoteTool ? "bg-yellow-400 text-slate-800" : "text-slate-300 hover:text-white hover:bg-slate-700"}`} title="Add Note (N)"><StickyNote size={16} /></button>
        <div className="w-px h-5 bg-slate-600 mx-1" />
        <button onClick={() => setShowPrintView(true)} className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-md transition-colors" title="Print Plans (P)"><Printer size={16} /></button>
      </div>

      {/* Measurement Input Overlay */}
      {editingMeasurement && (
        <div 
          className="absolute z-30"
          style={{ 
            left: editingMeasurement.position.x - 40, 
            top: editingMeasurement.position.y - 15 
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
            {editingMeasurement.direction === "floor" ? "Distance to floor" : 
             editingMeasurement.axis === "x" ? 
               (editingMeasurement.direction === "before" ? "Gap to left" : "Gap to right") :
               (editingMeasurement.direction === "before" ? "Gap below" : "Gap above")}
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
          <span className="text-slate-500">x:</span>{Math.round(calculateGaps.panel.x)} <span className="text-slate-500">y:</span>{Math.round(calculateGaps.panel.y)}
          <span className="mx-2 text-slate-600">|</span>
          <span className="text-slate-500">w:</span>{Math.round(calculateGaps.visible.width)} <span className="text-slate-500">h:</span>{Math.round(calculateGaps.visible.height)}
        </div>
      )}

      {/* Modifier Hints - Bottom Center */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
        {dragging && shiftHeld && <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded-lg shadow-lg">⇧ Constrain</span>}
        {dragging && ctrlHeld && <span className="text-xs bg-orange-500 text-white px-2 py-1 rounded-lg shadow-lg">⌘ Free Move</span>}
        {hasDuplicatedOnDrag && <span className="text-xs bg-green-500 text-white px-2 py-1 rounded-lg shadow-lg">⌥ Duplicated</span>}
        {snapGuides.some(g => g.isEqualSpacing) && <span className="text-xs bg-emerald-500 text-white px-2 py-1 rounded-lg shadow-lg">↔ Equal Spacing</span>}
      </div>

      {/* Keyboard Hints - Bottom Right */}
      {!dragging && !resizing && (
        <div className="absolute bottom-4 right-4 z-20 text-[10px] text-slate-400 bg-white/80 backdrop-blur rounded-lg px-2 py-1 shadow">
          <span className="text-slate-500">⇧</span> straight · <span className="text-slate-500">⌥</span> copy · <span className="text-slate-500">⌘</span> no-snap
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} className="w-full h-full">
        <svg ref={svgRef} width={canvasSize.width || "100%"} height={canvasSize.height || "100%"} viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onMouseDown={handleCanvasMouseDown} onClick={handleCanvasClick} style={{ cursor: getCursor() }}>
          <rect x={viewBoxX - 1000} y={viewBoxY - 1000} width={viewBoxWidth + 2000} height={viewBoxHeight + 2000} fill="#f1f5f9" onClick={() => clearSelection()} />
          {renderGrid()}
          {renderFloorLine()}
          {panels.map(renderPanel)}
          {renderSnapGuides()}
          {renderMeasurements()}
          {renderStickyNotes()}
          {renderMarqueeSelection()}
          {panels.length === 0 && stickyNotes.length === 0 && <text x={viewBoxX + viewBoxWidth / 2} y={viewBoxY + viewBoxHeight / 2} textAnchor="middle" fontSize={16 / zoom} fill="#94a3b8">Click "Add Panel" to start designing</text>}
          {renderVerticalRuler()}
          {renderHorizontalRuler()}
          {showRulers && <rect x={viewBoxX} y={viewBoxY} width={RULER_SIZE / zoom} height={RULER_SIZE / zoom} fill="rgba(241,245,249,0.95)" />}
        </svg>
      </div>
      
      {/* Print View Modal */}
      {showPrintView && <PrintView onClose={() => setShowPrintView(false)} />}
    </div>
  );
}
