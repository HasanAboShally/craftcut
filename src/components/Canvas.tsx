import { Hand, Maximize, MousePointer2, Ruler, ZoomIn, ZoomOut } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDesignStore } from "../stores/designStore";
import type { Panel } from "../types";

const GRID_SIZE = 20;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;
const DEFAULT_ZOOM = 0.3;
const NUDGE_AMOUNT = 10;
const NUDGE_AMOUNT_LARGE = 50;
const SNAP_THRESHOLD = 15; // pixels for snapping
const RULER_SIZE = 24; // pixels for ruler width/height

// Helper to generate wood color variants from a base color
function getWoodColorVariants(baseColor: string) {
  // Convert hex to RGB, then darken for grain and dark variants
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

// Guide line colors
const GUIDE_COLOR = "#f43f5e"; // Rose/red for alignment guides
const DISTANCE_COLOR = "#3b82f6"; // Blue for distance indicators
const MIN_VISUAL_HEIGHT = 80; // Minimum visual height in 2D for easier grabbing

// Get TRUE visible dimensions of panel in front view based on orientation
// Returns { width, height } as seen from the front - used for calculations and 3D
function getTrueVisibleDimensions(
  panel: Panel,
  thickness: number,
): { width: number; height: number } {
  const orientation = panel.orientation || "horizontal";

  switch (orientation) {
    case "horizontal":
      // Shelf: you see the front edge - panel.width wide, thickness tall
      return { width: panel.width, height: thickness };
    case "vertical":
      // Side/divider: you see the front edge - thickness wide, panel.height tall
      return { width: thickness, height: panel.height };
    case "back":
      // Back panel: you see the face - panel.width × panel.height
      return { width: panel.width, height: panel.height };
    default:
      return { width: panel.width, height: panel.height };
  }
}

// Get visible dimensions for 2D canvas display with minimum size for usability
// This makes thin panels (like horizontal shelves) easier to click and drag
function getVisibleDimensions(
  panel: Panel,
  thickness: number,
): { width: number; height: number; actualHeight: number } {
  const trueDims = getTrueVisibleDimensions(panel, thickness);
  return {
    width: Math.max(MIN_VISUAL_HEIGHT, trueDims.width),
    height: Math.max(MIN_VISUAL_HEIGHT, trueDims.height),
    actualHeight: trueDims.height, // Keep track of actual for display
  };
}

// Snap guide types
interface SnapGuide {
  type: "vertical" | "horizontal";
  position: number;
  start: number;
  end: number;
  label?: string;
}

interface DistanceIndicator {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  distance: number;
  orientation: "horizontal" | "vertical";
}

export default function Canvas() {
  const {
    panels,
    selectedPanelId,
    selectPanel,
    updatePanel,
    deletePanel,
    settings,
  } = useDesignStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [dragging, setDragging] = useState<string | null>(null);
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
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [clipboard, setClipboard] = useState<Panel | null>(null);
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [distanceIndicators, setDistanceIndicators] = useState<
    DistanceIndicator[]
  >([]);
  const [showRulers, setShowRulers] = useState(true);

  // Calculate gaps between selected panel and adjacent panels (use TRUE dimensions for accuracy)
  const calculateGaps = useMemo(() => {
    if (!selectedPanelId) return null;
    
    const selectedPanel = panels.find(p => p.id === selectedPanelId);
    if (!selectedPanel) return null;
    
    const selectedVisible = getTrueVisibleDimensions(selectedPanel, settings.thickness);
    const selectedLeft = selectedPanel.x;
    const selectedRight = selectedPanel.x + selectedVisible.width;
    const selectedTop = selectedPanel.y;
    const selectedBottom = selectedPanel.y + selectedVisible.height;
    
    // Find closest panels in each direction
    let gapAbove: { distance: number; panelLabel: string } | null = null;
    let gapBelow: { distance: number; panelLabel: string } | null = null;
    let gapLeft: { distance: number; panelLabel: string } | null = null;
    let gapRight: { distance: number; panelLabel: string } | null = null;
    
    for (const panel of panels) {
      if (panel.id === selectedPanelId) continue;
      
      const visible = getTrueVisibleDimensions(panel, settings.thickness);
      const left = panel.x;
      const right = panel.x + visible.width;
      const top = panel.y;
      const bottom = panel.y + visible.height;
      
      // Check horizontal overlap for vertical gaps
      const hasHorizontalOverlap = 
        Math.max(selectedLeft, left) < Math.min(selectedRight, right);
      
      // Check vertical overlap for horizontal gaps  
      const hasVerticalOverlap = 
        Math.max(selectedTop, top) < Math.min(selectedBottom, bottom);
      
      if (hasHorizontalOverlap) {
        // Panel above (its bottom is above our top)
        if (bottom <= selectedTop) {
          const distance = selectedTop - bottom;
          if (!gapAbove || distance < gapAbove.distance) {
            gapAbove = { distance, panelLabel: panel.label };
          }
        }
        // Panel below (its top is below our bottom)
        if (top >= selectedBottom) {
          const distance = top - selectedBottom;
          if (!gapBelow || distance < gapBelow.distance) {
            gapBelow = { distance, panelLabel: panel.label };
          }
        }
      }
      
      if (hasVerticalOverlap) {
        // Panel to the left (its right is left of our left)
        if (right <= selectedLeft) {
          const distance = selectedLeft - right;
          if (!gapLeft || distance < gapLeft.distance) {
            gapLeft = { distance, panelLabel: panel.label };
          }
        }
        // Panel to the right (its left is right of our right)
        if (left >= selectedRight) {
          const distance = left - selectedRight;
          if (!gapRight || distance < gapRight.distance) {
            gapRight = { distance, panelLabel: panel.label };
          }
        }
      }
    }
    
    return {
      panel: selectedPanel,
      visible: selectedVisible,
      gapAbove,
      gapBelow,
      gapLeft,
      gapRight,
    };
  }, [selectedPanelId, panels, settings.thickness]);

  // Get all snap points from other panels (use TRUE dimensions for accuracy)
  const getSnapPoints = useCallback(
    (excludeId: string) => {
      const points: { x: number[]; y: number[] } = { x: [], y: [] };
      const panelBounds: {
        left: number;
        right: number;
        top: number;
        bottom: number;
        cx: number;
        cy: number;
      }[] = [];

      panels.forEach((p) => {
        if (p.id === excludeId) return;
        const visible = getTrueVisibleDimensions(p, settings.thickness);

        const left = p.x;
        const right = p.x + visible.width;
        const top = p.y;
        const bottom = p.y + visible.height;
        const cx = p.x + visible.width / 2;
        const cy = p.y + visible.height / 2;

        panelBounds.push({ left, right, top, bottom, cx, cy });

        // Left, center, right edges
        points.x.push(left);
        points.x.push(cx);
        points.x.push(right);

        // Top, center, bottom edges
        points.y.push(top);
        points.y.push(cy);
        points.y.push(bottom);
      });

      // Add equal spacing points (midpoints between adjacent panels)
      // Sort panels by position to find neighbors
      const sortedByX = [...panelBounds].sort((a, b) => a.left - b.left);
      const sortedByY = [...panelBounds].sort((a, b) => a.top - b.top);

      // X midpoints between horizontally adjacent panels
      for (let i = 0; i < sortedByX.length - 1; i++) {
        const gap = sortedByX[i + 1].left - sortedByX[i].right;
        if (gap > 0 && gap < 500) {
          // Midpoint of the gap
          points.x.push(sortedByX[i].right + gap / 2);
        }
      }

      // Y midpoints between vertically adjacent panels
      for (let i = 0; i < sortedByY.length - 1; i++) {
        const gap = sortedByY[i + 1].top - sortedByY[i].bottom;
        if (gap > 0 && gap < 500) {
          // Midpoint of the gap
          points.y.push(sortedByY[i].bottom + gap / 2);
        }
      }

      return points;
    },
    [panels, settings.thickness],
  );

  // Find snap position and generate guides
  const findSnapPosition = useCallback(
    (
      panelId: string,
      rawX: number,
      rawY: number,
      panelWidth: number,
      panelHeight: number,
    ): {
      x: number;
      y: number;
      guides: SnapGuide[];
      distances: DistanceIndicator[];
    } => {
      const snapPoints = getSnapPoints(panelId);
      const guides: SnapGuide[] = [];
      const distances: DistanceIndicator[] = [];

      let snappedX = rawX;
      let snappedY = rawY;

      // Current panel edges and center
      const edges = {
        left: rawX,
        centerX: rawX + panelWidth / 2,
        right: rawX + panelWidth,
        top: rawY,
        centerY: rawY + panelHeight / 2,
        bottom: rawY + panelHeight,
      };

      // Check X snapping (left, center, right edges)
      let minXDiff = SNAP_THRESHOLD;
      ["left", "centerX", "right"].forEach((edgeName) => {
        const edgeValue = edges[edgeName as keyof typeof edges];
        snapPoints.x.forEach((snapX) => {
          const diff = Math.abs(edgeValue - snapX);
          if (diff < minXDiff) {
            minXDiff = diff;
            // Adjust position based on which edge snapped
            if (edgeName === "left") snappedX = snapX;
            else if (edgeName === "centerX") snappedX = snapX - panelWidth / 2;
            else if (edgeName === "right") snappedX = snapX - panelWidth;

            // Add vertical guide
            guides.push({
              type: "vertical",
              position: snapX,
              start: Math.min(rawY, 0),
              end: Math.max(rawY + panelHeight, 2000),
            });
          }
        });
      });

      // Check Y snapping (top, center, bottom edges)
      let minYDiff = SNAP_THRESHOLD;
      ["top", "centerY", "bottom"].forEach((edgeName) => {
        const edgeValue = edges[edgeName as keyof typeof edges];
        snapPoints.y.forEach((snapY) => {
          const diff = Math.abs(edgeValue - snapY);
          if (diff < minYDiff) {
            minYDiff = diff;
            // Adjust position based on which edge snapped
            if (edgeName === "top") snappedY = snapY;
            else if (edgeName === "centerY") snappedY = snapY - panelHeight / 2;
            else if (edgeName === "bottom") snappedY = snapY - panelHeight;

            // Add horizontal guide
            guides.push({
              type: "horizontal",
              position: snapY,
              start: Math.min(rawX, 0),
              end: Math.max(rawX + panelWidth, 2000),
            });
          }
        });
      });

      // Calculate distance to nearest panels
      panels.forEach((p) => {
        if (p.id === panelId) return;
        const visible = getVisibleDimensions(p, settings.thickness);

        // Horizontal distance (left/right)
        if (snappedY < p.y + visible.height && snappedY + panelHeight > p.y) {
          // Overlapping vertically
          if (snappedX + panelWidth <= p.x) {
            // Current panel is to the left
            const dist = p.x - (snappedX + panelWidth);
            if (dist < 200) {
              distances.push({
                x1: snappedX + panelWidth,
                y1:
                  Math.max(snappedY, p.y) +
                  Math.min(panelHeight, visible.height) / 2,
                x2: p.x,
                y2:
                  Math.max(snappedY, p.y) +
                  Math.min(panelHeight, visible.height) / 2,
                distance: Math.round(dist),
                orientation: "horizontal",
              });
            }
          } else if (snappedX >= p.x + visible.width) {
            // Current panel is to the right
            const dist = snappedX - (p.x + visible.width);
            if (dist < 200) {
              distances.push({
                x1: p.x + visible.width,
                y1:
                  Math.max(snappedY, p.y) +
                  Math.min(panelHeight, visible.height) / 2,
                x2: snappedX,
                y2:
                  Math.max(snappedY, p.y) +
                  Math.min(panelHeight, visible.height) / 2,
                distance: Math.round(dist),
                orientation: "horizontal",
              });
            }
          }
        }

        // Vertical distance (top/bottom)
        if (snappedX < p.x + visible.width && snappedX + panelWidth > p.x) {
          // Overlapping horizontally
          if (snappedY + panelHeight <= p.y) {
            // Current panel is above
            const dist = p.y - (snappedY + panelHeight);
            if (dist < 200) {
              distances.push({
                x1:
                  Math.max(snappedX, p.x) +
                  Math.min(panelWidth, visible.width) / 2,
                y1: snappedY + panelHeight,
                x2:
                  Math.max(snappedX, p.x) +
                  Math.min(panelWidth, visible.width) / 2,
                y2: p.y,
                distance: Math.round(dist),
                orientation: "vertical",
              });
            }
          } else if (snappedY >= p.y + visible.height) {
            // Current panel is below
            const dist = snappedY - (p.y + visible.height);
            if (dist < 200) {
              distances.push({
                x1:
                  Math.max(snappedX, p.x) +
                  Math.min(panelWidth, visible.width) / 2,
                y1: p.y + visible.height,
                x2:
                  Math.max(snappedX, p.x) +
                  Math.min(panelWidth, visible.width) / 2,
                y2: snappedY,
                distance: Math.round(dist),
                orientation: "vertical",
              });
            }
          }
        }
      });

      return { x: snappedX, y: snappedY, guides, distances };
    },
    [getSnapPoints, panels, settings.thickness],
  );

  // Resize observer to track container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setCanvasSize({ width, height });
        }
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(DEFAULT_ZOOM);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleFitToContent = useCallback(() => {
    if (panels.length === 0) {
      handleResetZoom();
      return;
    }
    // Calculate bounding box of all panels
    const minX = Math.min(...panels.map((p) => p.x));
    const minY = Math.min(...panels.map((p) => p.y));
    const maxX = Math.max(...panels.map((p) => p.x + p.width));
    const maxY = Math.max(...panels.map((p) => p.y + p.height));
    const contentWidth = maxX - minX + 100;
    const contentHeight = maxY - minY + 100;

    const fitZoom = Math.min(
      canvasSize.width / contentWidth,
      canvasSize.height / contentHeight,
      1,
    );
    setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom)));
    setPan({
      x:
        -(minX - 50) * fitZoom +
        (canvasSize.width - contentWidth * fitZoom) / 2,
      y:
        -(minY - 50) * fitZoom +
        (canvasSize.height - contentHeight * fitZoom) / 2,
    });
  }, [panels, handleResetZoom, canvasSize]);

  // Copy selected panel
  const handleCopy = useCallback(() => {
    if (!selectedPanelId) return;
    const panel = panels.find((p) => p.id === selectedPanelId);
    if (panel) {
      setClipboard({ ...panel });
    }
  }, [selectedPanelId, panels]);

  // Paste copied panel
  const handlePaste = useCallback(() => {
    if (!clipboard) return;
    const newPanel: Panel = {
      ...clipboard,
      id: `panel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      label: `${clipboard.label} copy`,
      x: clipboard.x + 40,
      y: clipboard.y + 40,
    };
    // Add to store manually
    useDesignStore.getState().panels.push(newPanel);
    useDesignStore.setState({ panels: [...useDesignStore.getState().panels] });
    selectPanel(newPanel.id);
  }, [clipboard, selectPanel]);

  // Duplicate selected panel (Ctrl+D)
  const handleDuplicate = useCallback(() => {
    if (!selectedPanelId) return;
    const panel = panels.find((p) => p.id === selectedPanelId);
    if (!panel) return;

    const newPanel: Panel = {
      ...panel,
      id: `panel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      label: `${panel.label} copy`,
      x: panel.x + 40,
      y: panel.y + 40,
    };
    useDesignStore.getState().panels.push(newPanel);
    useDesignStore.setState({ panels: [...useDesignStore.getState().panels] });
    selectPanel(newPanel.id);
  }, [selectedPanelId, panels, selectPanel]);

  // Mouse wheel zoom (Figma-style: Ctrl/Cmd + scroll = zoom, plain scroll = pan)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta)));
      } else {
        // Pan (Figma-style scroll)
        setPan((p) => ({
          x: p.x - e.deltaX,
          y: p.y - e.deltaY,
        }));
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  const getSVGPoint = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const handleMouseDown = useCallback(
    (
      e: React.MouseEvent,
      panel: Panel,
      action: "drag" | "resize",
      corner?: string,
    ) => {
      e.stopPropagation();
      selectPanel(panel.id);
      const point = getSVGPoint(e);
      setDragStart(point);
      setPanelStart({
        x: panel.x,
        y: panel.y,
        width: panel.width,
        height: panel.height,
      });

      if (action === "drag") {
        setDragging(panel.id);
      } else if (action === "resize" && corner) {
        setResizing({ id: panel.id, corner });
      }
    },
    [selectPanel, getSVGPoint],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Handle canvas panning
      if (isPanning) {
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
        setPanStart({ x: e.clientX, y: e.clientY });
        return;
      }

      if (!dragging && !resizing) return;
      const point = getSVGPoint(e);
      const dx = (point.x - dragStart.x) / zoom;
      const dy = (point.y - dragStart.y) / zoom;

      if (dragging) {
        const draggedPanel = panels.find((p) => p.id === dragging);
        if (!draggedPanel) return;

        // Use TRUE dimensions for snapping calculations
        const visible = getTrueVisibleDimensions(draggedPanel, settings.thickness);
        const rawX = panelStart.x + dx;
        const rawY = panelStart.y + dy;

        // Apply smart snapping
        const {
          x: snappedX,
          y: snappedY,
          guides,
          distances,
        } = findSnapPosition(
          dragging,
          rawX,
          rawY,
          visible.width,
          visible.height,
        );

        // Update guides and distances
        setSnapGuides(guides);
        setDistanceIndicators(distances);

        // If no snap, fall back to grid snap
        const finalX = guides.some((g) => g.type === "vertical")
          ? snappedX
          : Math.round(rawX / GRID_SIZE) * GRID_SIZE;
        const finalY = guides.some((g) => g.type === "horizontal")
          ? snappedY
          : Math.round(rawY / GRID_SIZE) * GRID_SIZE;

        updatePanel(dragging, {
          x: finalX,
          y: finalY,
        });
      } else if (resizing) {
        const { corner } = resizing;
        let newWidth = panelStart.width;
        let newHeight = panelStart.height;
        let newX = panelStart.x;
        let newY = panelStart.y;

        if (corner.includes("e"))
          newWidth = Math.max(50, panelStart.width + dx);
        if (corner.includes("w")) {
          newWidth = Math.max(50, panelStart.width - dx);
          newX = panelStart.x + (panelStart.width - newWidth);
        }
        if (corner.includes("s"))
          newHeight = Math.max(50, panelStart.height + dy);
        if (corner.includes("n")) {
          newHeight = Math.max(50, panelStart.height - dy);
          newY = panelStart.y + (panelStart.height - newHeight);
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
      resizing,
      dragStart,
      panelStart,
      getSVGPoint,
      updatePanel,
      isPanning,
      panStart,
      zoom,
      panels,
      settings.thickness,
      findSnapPosition,
    ],
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
    setIsPanning(false);
    setSnapGuides([]);
    setDistanceIndicators([]);
  }, []);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === svgRef.current) {
        selectPanel(null);
      }
    },
    [selectPanel],
  );

  // Handle canvas mouse down for panning (Space + drag or middle mouse or hand tool)
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || spaceHeld || tool === "pan") {
        // Middle mouse button, space held, or hand tool
        e.preventDefault();
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
      }
    },
    [spaceHeld, tool],
  );

  // Figma-style keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = (e.target as HTMLElement).tagName === "INPUT";

      // Space for panning (hold)
      if (e.code === "Space" && !isInput) {
        e.preventDefault();
        setSpaceHeld(true);
      }

      // Escape to deselect
      if (e.key === "Escape") {
        selectPanel(null);
      }

      // Delete/Backspace to delete
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedPanelId &&
        !isInput
      ) {
        e.preventDefault();
        deletePanel(selectedPanelId);
      }

      // Zoom shortcuts
      if (isInput) return;

      if (e.key === "=" || e.key === "+") handleZoomIn();
      if (e.key === "-") handleZoomOut();
      if (e.key === "0") handleResetZoom();
      if (e.key === "1") setZoom(1); // 100%
      if (e.key === "2") setZoom(0.5); // 50%

      // Tool shortcuts (Figma-style)
      if (e.key === "v" || e.key === "V") setTool("select");
      if (e.key === "h" || e.key === "H") setTool("pan");

      // Copy/Paste/Duplicate
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

      // Arrow keys to nudge selected panel
      if (
        selectedPanelId &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        e.preventDefault();
        const panel = panels.find((p) => p.id === selectedPanelId);
        if (!panel) return;

        const amount = e.shiftKey ? NUDGE_AMOUNT_LARGE : NUDGE_AMOUNT;
        const updates: Partial<Panel> = {};

        if (e.key === "ArrowUp") updates.y = panel.y - amount;
        if (e.key === "ArrowDown") updates.y = panel.y + amount;
        if (e.key === "ArrowLeft") updates.x = panel.x - amount;
        if (e.key === "ArrowRight") updates.x = panel.x + amount;

        updatePanel(selectedPanelId, updates);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setSpaceHeld(false);
        setIsPanning(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    selectedPanelId,
    deletePanel,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
    handleCopy,
    handlePaste,
    handleDuplicate,
    panels,
    updatePanel,
    selectPanel,
  ]);

  // Calculate viewBox based on zoom and pan (needed for rendering functions)
  const viewBoxWidth = canvasSize.width / zoom;
  const viewBoxHeight = canvasSize.height / zoom;
  const viewBoxX = -pan.x / zoom;
  const viewBoxY = -pan.y / zoom;

  const renderGrid = () => {
    const lines = [];
    // Calculate visible area based on canvas size and zoom
    const viewWidth = canvasSize.width / zoom;
    const viewHeight = canvasSize.height / zoom;

    // Calculate the visible viewport bounds
    const startX =
      Math.floor(-pan.x / zoom / GRID_SIZE) * GRID_SIZE - GRID_SIZE;
    const startY =
      Math.floor(-pan.y / zoom / GRID_SIZE) * GRID_SIZE - GRID_SIZE;
    const endX = startX + viewWidth + GRID_SIZE * 3;
    const endY = startY + viewHeight + GRID_SIZE * 3;

    for (let x = startX; x <= endX; x += GRID_SIZE) {
      lines.push(
        <line
          key={`v${x}`}
          x1={x}
          y1={startY}
          x2={x}
          y2={endY}
          stroke="#ddd"
          strokeWidth={1 / zoom}
        />,
      );
    }
    for (let y = startY; y <= endY; y += GRID_SIZE) {
      lines.push(
        <line
          key={`h${y}`}
          x1={startX}
          y1={y}
          x2={endX}
          y2={y}
          stroke="#ddd"
          strokeWidth={1 / zoom}
        />,
      );
    }
    return lines;
  };

  // Render horizontal ruler (top)
  const renderHorizontalRuler = () => {
    if (!showRulers) return null;
    
    const elements = [];
    const rulerStep = zoom > 0.5 ? 50 : zoom > 0.2 ? 100 : 200; // mm between major ticks
    const minorStep = rulerStep / 5;
    
    // Calculate visible range in mm
    const startMm = Math.floor(viewBoxX / rulerStep) * rulerStep - rulerStep;
    const endMm = viewBoxX + viewBoxWidth + rulerStep;
    
    // Major ticks with labels
    for (let mm = startMm; mm <= endMm; mm += rulerStep) {
      if (mm < 0) continue;
      elements.push(
        <g key={`htick-${mm}`}>
          <line
            x1={mm}
            y1={viewBoxY}
            x2={mm}
            y2={viewBoxY + 12 / zoom}
            stroke="#666"
            strokeWidth={1 / zoom}
          />
          <text
            x={mm + 3 / zoom}
            y={viewBoxY + 20 / zoom}
            fontSize={9 / zoom}
            fill="#666"
          >
            {mm}
          </text>
        </g>
      );
    }
    
    // Minor ticks
    for (let mm = startMm; mm <= endMm; mm += minorStep) {
      if (mm < 0 || mm % rulerStep === 0) continue;
      elements.push(
        <line
          key={`hminor-${mm}`}
          x1={mm}
          y1={viewBoxY}
          x2={mm}
          y2={viewBoxY + 6 / zoom}
          stroke="#999"
          strokeWidth={0.5 / zoom}
        />
      );
    }
    
    return (
      <g className="ruler-horizontal">
        {/* Ruler background */}
        <rect
          x={viewBoxX}
          y={viewBoxY}
          width={viewBoxWidth}
          height={RULER_SIZE / zoom}
          fill="rgba(255,255,255,0.95)"
        />
        {elements}
        {/* Bottom border */}
        <line
          x1={viewBoxX}
          y1={viewBoxY + RULER_SIZE / zoom}
          x2={viewBoxX + viewBoxWidth}
          y2={viewBoxY + RULER_SIZE / zoom}
          stroke="#ccc"
          strokeWidth={1 / zoom}
        />
      </g>
    );
  };

  // Render vertical ruler (left)
  const renderVerticalRuler = () => {
    if (!showRulers) return null;
    
    const elements = [];
    const rulerStep = zoom > 0.5 ? 50 : zoom > 0.2 ? 100 : 200; // mm between major ticks
    const minorStep = rulerStep / 5;
    
    // Calculate visible range in mm
    const startMm = Math.floor(viewBoxY / rulerStep) * rulerStep - rulerStep;
    const endMm = viewBoxY + viewBoxHeight + rulerStep;
    
    // Major ticks with labels
    for (let mm = startMm; mm <= endMm; mm += rulerStep) {
      if (mm < 0) continue;
      elements.push(
        <g key={`vtick-${mm}`}>
          <line
            x1={viewBoxX}
            y1={mm}
            x2={viewBoxX + 12 / zoom}
            y2={mm}
            stroke="#666"
            strokeWidth={1 / zoom}
          />
          <text
            x={viewBoxX + 14 / zoom}
            y={mm + 3 / zoom}
            fontSize={9 / zoom}
            fill="#666"
          >
            {mm}
          </text>
        </g>
      );
    }
    
    // Minor ticks
    for (let mm = startMm; mm <= endMm; mm += minorStep) {
      if (mm < 0 || mm % rulerStep === 0) continue;
      elements.push(
        <line
          key={`vminor-${mm}`}
          x1={viewBoxX}
          y1={mm}
          x2={viewBoxX + 6 / zoom}
          y2={mm}
          stroke="#999"
          strokeWidth={0.5 / zoom}
        />
      );
    }
    
    return (
      <g className="ruler-vertical">
        {/* Ruler background */}
        <rect
          x={viewBoxX}
          y={viewBoxY}
          width={RULER_SIZE / zoom}
          height={viewBoxHeight}
          fill="rgba(255,255,255,0.95)"
        />
        {elements}
        {/* Right border */}
        <line
          x1={viewBoxX + RULER_SIZE / zoom}
          y1={viewBoxY}
          x2={viewBoxX + RULER_SIZE / zoom}
          y2={viewBoxY + viewBoxHeight}
          stroke="#ccc"
          strokeWidth={1 / zoom}
        />
      </g>
    );
  };

  // Render position indicator for selected panel
  const renderSelectedPanelIndicator = () => {
    if (!calculateGaps) return null;
    
    const { panel, visible, gapAbove, gapBelow, gapLeft, gapRight } = calculateGaps;
    const elements = [];
    
    // Gap indicators - lines showing distance to adjacent panels
    const indicatorColor = "#8b5cf6"; // Purple for gap indicators
    
    // Gap above
    if (gapAbove && gapAbove.distance > 0) {
      const x = panel.x + visible.width / 2;
      const y1 = panel.y;
      const y2 = panel.y - gapAbove.distance;
      
      elements.push(
        <g key="gap-above">
          <line x1={x} y1={y1} x2={x} y2={y2} stroke={indicatorColor} strokeWidth={2 / zoom} strokeDasharray={`${4/zoom},${4/zoom}`} />
          <line x1={x - 8/zoom} y1={y1} x2={x + 8/zoom} y2={y1} stroke={indicatorColor} strokeWidth={2/zoom} />
          <line x1={x - 8/zoom} y1={y2} x2={x + 8/zoom} y2={y2} stroke={indicatorColor} strokeWidth={2/zoom} />
          <rect x={x - 25/zoom} y={(y1+y2)/2 - 10/zoom} width={50/zoom} height={20/zoom} fill={indicatorColor} rx={4/zoom} />
          <text x={x} y={(y1+y2)/2 + 4/zoom} textAnchor="middle" fontSize={11/zoom} fill="white" fontWeight={600}>
            {Math.round(gapAbove.distance)}
          </text>
        </g>
      );
    }
    
    // Gap below
    if (gapBelow && gapBelow.distance > 0) {
      const x = panel.x + visible.width / 2;
      const y1 = panel.y + visible.height;
      const y2 = y1 + gapBelow.distance;
      
      elements.push(
        <g key="gap-below">
          <line x1={x} y1={y1} x2={x} y2={y2} stroke={indicatorColor} strokeWidth={2 / zoom} strokeDasharray={`${4/zoom},${4/zoom}`} />
          <line x1={x - 8/zoom} y1={y1} x2={x + 8/zoom} y2={y1} stroke={indicatorColor} strokeWidth={2/zoom} />
          <line x1={x - 8/zoom} y1={y2} x2={x + 8/zoom} y2={y2} stroke={indicatorColor} strokeWidth={2/zoom} />
          <rect x={x - 25/zoom} y={(y1+y2)/2 - 10/zoom} width={50/zoom} height={20/zoom} fill={indicatorColor} rx={4/zoom} />
          <text x={x} y={(y1+y2)/2 + 4/zoom} textAnchor="middle" fontSize={11/zoom} fill="white" fontWeight={600}>
            {Math.round(gapBelow.distance)}
          </text>
        </g>
      );
    }
    
    // Gap left
    if (gapLeft && gapLeft.distance > 0) {
      const y = panel.y + visible.height / 2;
      const x1 = panel.x;
      const x2 = panel.x - gapLeft.distance;
      
      elements.push(
        <g key="gap-left">
          <line x1={x1} y1={y} x2={x2} y2={y} stroke={indicatorColor} strokeWidth={2 / zoom} strokeDasharray={`${4/zoom},${4/zoom}`} />
          <line x1={x1} y1={y - 8/zoom} x2={x1} y2={y + 8/zoom} stroke={indicatorColor} strokeWidth={2/zoom} />
          <line x1={x2} y1={y - 8/zoom} x2={x2} y2={y + 8/zoom} stroke={indicatorColor} strokeWidth={2/zoom} />
          <rect x={(x1+x2)/2 - 25/zoom} y={y - 10/zoom} width={50/zoom} height={20/zoom} fill={indicatorColor} rx={4/zoom} />
          <text x={(x1+x2)/2} y={y + 4/zoom} textAnchor="middle" fontSize={11/zoom} fill="white" fontWeight={600}>
            {Math.round(gapLeft.distance)}
          </text>
        </g>
      );
    }
    
    // Gap right
    if (gapRight && gapRight.distance > 0) {
      const y = panel.y + visible.height / 2;
      const x1 = panel.x + visible.width;
      const x2 = x1 + gapRight.distance;
      
      elements.push(
        <g key="gap-right">
          <line x1={x1} y1={y} x2={x2} y2={y} stroke={indicatorColor} strokeWidth={2 / zoom} strokeDasharray={`${4/zoom},${4/zoom}`} />
          <line x1={x1} y1={y - 8/zoom} x2={x1} y2={y + 8/zoom} stroke={indicatorColor} strokeWidth={2/zoom} />
          <line x1={x2} y1={y - 8/zoom} x2={x2} y2={y + 8/zoom} stroke={indicatorColor} strokeWidth={2/zoom} />
          <rect x={(x1+x2)/2 - 25/zoom} y={y - 10/zoom} width={50/zoom} height={20/zoom} fill={indicatorColor} rx={4/zoom} />
          <text x={(x1+x2)/2} y={y + 4/zoom} textAnchor="middle" fontSize={11/zoom} fill="white" fontWeight={600}>
            {Math.round(gapRight.distance)}
          </text>
        </g>
      );
    }
    
    return <>{elements}</>;
  };

  // Render the ground line (Y=0 reference)
  const renderGroundLine = () => {
    if (viewBoxY > 0 || viewBoxY + viewBoxHeight < 0) return null;
    
    return (
      <g className="ground-line">
        <line
          x1={viewBoxX}
          y1={0}
          x2={viewBoxX + viewBoxWidth}
          y2={0}
          stroke="#10b981"
          strokeWidth={2 / zoom}
          strokeDasharray={`${8/zoom},${4/zoom}`}
        />
        <rect
          x={viewBoxX + 5/zoom}
          y={-14/zoom}
          width={60/zoom}
          height={16/zoom}
          fill="#10b981"
          rx={3/zoom}
        />
        <text
          x={viewBoxX + 35/zoom}
          y={-2/zoom}
          textAnchor="middle"
          fontSize={10/zoom}
          fill="white"
          fontWeight={600}
        >
          Y = 0
        </text>
      </g>
    );
  };

  const renderPanel = (panel: Panel, index: number) => {
    const isSelected = panel.id === selectedPanelId;
    const woodColor = getWoodColorVariants(settings.woodColor || "#E8D4B8");
    const x = panel.x;
    const y = panel.y;

    // Get visible dimensions based on orientation (enlarged for usability)
    const visible = getVisibleDimensions(panel, settings.thickness);
    const width = visible.width;
    const height = visible.height;
    const actualHeight = visible.actualHeight; // True dimension
    const orientation = panel.orientation || "horizontal";
    const isEnlarged = height > actualHeight; // Check if we enlarged it for display

    const handleSize = 12 / zoom;
    const patternId = `wood-${panel.id}`;
    const grainCount = Math.max(2, Math.floor(width / 80));

    // Determine if grain should be horizontal or vertical based on orientation
    const isVerticalGrain = orientation === "vertical";

    return (
      <g key={panel.id}>
        {/* Wood grain pattern definition */}
        <defs>
          <pattern
            id={patternId}
            patternUnits="userSpaceOnUse"
            width={width}
            height={height}
            x={x}
            y={y}
          >
            {/* Base wood color */}
            <rect width={width} height={height} fill={woodColor.base} />

            {/* Wood grain lines */}
            {Array.from({ length: grainCount }).map((_, i) => {
              const lineX =
                (width / grainCount) * (i + 0.5) + Math.sin(i * 2) * 10;
              const curve = Math.sin(i * 1.5) * 15;
              return (
                <path
                  key={i}
                  d={`M ${lineX} 0 Q ${lineX + curve} ${height / 2} ${lineX} ${height}`}
                  stroke={woodColor.grain}
                  strokeWidth={2 + Math.random() * 2}
                  fill="none"
                  opacity={0.4 + Math.random() * 0.2}
                />
              );
            })}

            {/* Subtle horizontal grain texture */}
            {Array.from({ length: Math.floor(height / 40) }).map((_, i) => (
              <line
                key={`h${i}`}
                x1={0}
                y1={i * 40 + Math.random() * 20}
                x2={width}
                y2={i * 40 + Math.random() * 20}
                stroke={woodColor.grain}
                strokeWidth={1}
                opacity={0.15}
              />
            ))}
          </pattern>
        </defs>

        {/* Panel rectangle with wood texture */}
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={`url(#${patternId})`}
          stroke={isSelected ? "#2563eb" : woodColor.dark}
          strokeWidth={isSelected ? 4 / zoom : 2 / zoom}
          rx={3}
          ry={3}
          style={{ cursor: spaceHeld || tool === "pan" ? "grab" : "move" }}
          onMouseDown={(e) => {
            if (!spaceHeld && tool !== "pan") {
              handleMouseDown(e, panel, "drag");
            }
          }}
        />

        {/* Edge highlight (top and left) */}
        <line
          x1={x + 2}
          y1={y + 2}
          x2={x + width - 2}
          y2={y + 2}
          stroke="rgba(255,255,255,0.3)"
          strokeWidth={2 / zoom}
        />
        <line
          x1={x + 2}
          y1={y + 2}
          x2={x + 2}
          y2={y + height - 2}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth={2 / zoom}
        />

        {/* Edge shadow (bottom and right) */}
        <line
          x1={x + 2}
          y1={y + height - 2}
          x2={x + width - 2}
          y2={y + height - 2}
          stroke="rgba(0,0,0,0.15)"
          strokeWidth={2 / zoom}
        />
        <line
          x1={x + width - 2}
          y1={y + 2}
          x2={x + width - 2}
          y2={y + height - 2}
          stroke="rgba(0,0,0,0.1)"
          strokeWidth={2 / zoom}
        />

        {/* Label - adaptive based on panel size */}
        {width >= 80 && height >= 30 ? (
          // Standard label for larger panels
          <>
            <rect
              x={x + width / 2 - Math.min(width * 0.4, 100)}
              y={y + height / 2 - 20}
              width={Math.min(width * 0.8, 200)}
              height={height >= 60 ? 40 : 24}
              fill="rgba(255,255,255,0.9)"
              rx={4}
            />
            <text
              x={x + width / 2}
              y={y + height / 2 - (height >= 60 ? 5 : 2)}
              textAnchor="middle"
              fontSize={Math.min(16, Math.max(10, Math.min(width, height) / 8))}
              fill="#1f2937"
              pointerEvents="none"
              fontWeight={600}
            >
              {panel.label}
            </text>
            {height >= 60 && (
              <text
                x={x + width / 2}
                y={y + height / 2 + 12}
                textAnchor="middle"
                fontSize={Math.min(12, Math.max(8, width / 16))}
                fill="#6b7280"
                pointerEvents="none"
              >
                {panel.width} × {panel.height} mm
              </text>
            )}
            {/* Show actual thickness for enlarged panels */}
            {isEnlarged && (
              <text
                x={x + width / 2}
                y={y + height - 6}
                textAnchor="middle"
                fontSize={9}
                fill="#9333ea"
                pointerEvents="none"
              >
                (actual: {actualHeight}mm)
              </text>
            )}
          </>
        ) : (
          // Compact label for thin panels (shelves, sides) - now bigger so show label
          <>
            <title>
              {panel.label}: {panel.width} × {panel.height} mm ({orientation}) - Visual height enlarged for easier selection
            </title>
            {/* Background for label */}
            <rect
              x={x + width / 2 - 60}
              y={y + height / 2 - 10}
              width={120}
              height={20}
              fill="rgba(255,255,255,0.9)"
              rx={3}
            />
            <text
              x={x + width / 2}
              y={y + height / 2 + 4}
              textAnchor="middle"
              fontSize={11}
              fill="#1f2937"
              pointerEvents="none"
              fontWeight={500}
            >
              {panel.label} {isEnlarged && `(${actualHeight}mm)`}
            </text>
          </>
        )}

        {/* Orientation indicator for non-back panels */}
        {orientation !== "back" && (
          <text
            x={x + 8}
            y={y + Math.min(height - 4, 16)}
            fontSize={10}
            fill={isSelected ? "#2563eb" : "#888"}
            pointerEvents="none"
          >
            {orientation === "horizontal" ? "═" : "║"}
          </text>
        )}

        {/* Quantity badge */}
        {panel.quantity > 1 && (
          <>
            <circle
              cx={x + width - 25}
              cy={y + 25}
              r={20}
              fill="#dc2626"
              stroke="white"
              strokeWidth={2 / zoom}
            />
            <text
              x={x + width - 25}
              y={y + 32}
              textAnchor="middle"
              fontSize={16}
              fill="white"
              fontWeight={700}
              pointerEvents="none"
            >
              ×{panel.quantity}
            </text>
          </>
        )}

        {/* Resize handles (only when selected) */}
        {isSelected && (
          <>
            {/* For horizontal panels: only width is resizable (e, w handles) */}
            {/* For vertical panels: only height is resizable (n, s handles) */}
            {/* For back panels: both width and height are resizable */}
            {(orientation === "back"
              ? ["nw", "ne", "sw", "se", "n", "s", "e", "w"]
              : orientation === "horizontal"
                ? ["e", "w"] // Only width resizable
                : ["n", "s"]
            ) // Only height resizable
              .map((corner) => {
                let hx = x + width / 2 - handleSize / 2;
                let hy = y + height / 2 - handleSize / 2;

                if (corner.includes("e")) hx = x + width - handleSize / 2;
                if (corner.includes("w")) hx = x - handleSize / 2;
                if (corner.includes("s")) hy = y + height - handleSize / 2;
                if (corner.includes("n")) hy = y - handleSize / 2;

                // For edge handles, center them
                if (corner === "n" || corner === "s")
                  hx = x + width / 2 - handleSize / 2;
                if (corner === "e" || corner === "w")
                  hy = y + height / 2 - handleSize / 2;

                const cursor =
                  corner.length === 2
                    ? `${corner}-resize`
                    : corner === "n" || corner === "s"
                      ? "ns-resize"
                      : "ew-resize";

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
                    style={{ cursor }}
                    onMouseDown={(e) =>
                      handleMouseDown(e, panel, "resize", corner)
                    }
                  />
                );
              })}
          </>
        )}
      </g>
    );
  };

  // Determine cursor based on current state
  const getCursor = () => {
    if (isPanning) return "grabbing";
    if (spaceHeld || tool === "pan") return "grab";
    return "default";
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-1">
          {/* Tool selector */}
          <div className="flex items-center bg-white rounded border border-gray-200 mr-2">
            <button
              onClick={() => setTool("select")}
              className={`p-1.5 rounded-l transition-colors ${tool === "select" ? "bg-blue-100 text-blue-600" : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"}`}
              title="Select tool (V)"
            >
              <MousePointer2 size={16} />
            </button>
            <button
              onClick={() => setTool("pan")}
              className={`p-1.5 rounded-r transition-colors ${tool === "pan" ? "bg-blue-100 text-blue-600" : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"}`}
              title="Pan tool (H) - or hold Space"
            >
              <Hand size={16} />
            </button>
          </div>

          <div className="w-px h-6 bg-gray-200 mx-1" />

          {/* Zoom controls */}
          <button
            onClick={handleZoomOut}
            className="p-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded transition-colors"
            title="Zoom out (-)"
          >
            <ZoomOut size={18} />
          </button>
          <span className="text-sm text-gray-600 min-w-[52px] text-center font-medium">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded transition-colors"
            title="Zoom in (+)"
          >
            <ZoomIn size={18} />
          </button>
          <button
            onClick={handleFitToContent}
            className="p-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded transition-colors ml-1"
            title="Fit to content"
          >
            <Maximize size={18} />
          </button>

          <div className="w-px h-6 bg-gray-200 mx-2" />

          {/* Ruler toggle */}
          <button
            onClick={() => setShowRulers(!showRulers)}
            className={`p-1.5 rounded transition-colors ${showRulers ? "bg-blue-100 text-blue-600" : "text-gray-600 hover:text-gray-800 hover:bg-gray-200"}`}
            title="Toggle rulers"
          >
            <Ruler size={18} />
          </button>
        </div>

        {/* Position info panel */}
        {calculateGaps && (
          <div className="flex items-center gap-3 text-xs bg-white border border-gray-200 rounded px-2 py-1 shadow-sm">
            <div className="flex items-center gap-2 border-r border-gray-200 pr-3">
              <span className="text-gray-500 font-medium">Position</span>
              <span className="font-mono text-gray-700">
                ({Math.round(calculateGaps.panel.x)}, {Math.round(calculateGaps.panel.y)})
              </span>
            </div>
            <div className="flex items-center gap-2 border-r border-gray-200 pr-3">
              <span className="text-gray-500 font-medium">Size</span>
              <span className="font-mono text-gray-700">
                {Math.round(calculateGaps.visible.width)} × {Math.round(calculateGaps.visible.height)} mm
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 font-medium">Bottom edge</span>
              <span className="font-mono text-gray-700">
                Y = {Math.round(calculateGaps.panel.y + calculateGaps.visible.height)}
              </span>
            </div>
            {(calculateGaps.gapAbove || calculateGaps.gapBelow || calculateGaps.gapLeft || calculateGaps.gapRight) && (
              <>
                <div className="w-px h-4 bg-gray-300" />
                <div className="flex items-center gap-2">
                  <span className="text-purple-600 font-medium">Clearance</span>
                  <div className="flex items-center gap-1.5">
                    {calculateGaps.gapAbove && (
                      <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
                        ↑ {Math.round(calculateGaps.gapAbove.distance)}mm
                      </span>
                    )}
                    {calculateGaps.gapBelow && (
                      <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
                        ↓ {Math.round(calculateGaps.gapBelow.distance)}mm
                      </span>
                    )}
                    {calculateGaps.gapLeft && (
                      <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
                        ← {Math.round(calculateGaps.gapLeft.distance)}mm
                      </span>
                    )}
                    {calculateGaps.gapRight && (
                      <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
                        → {Math.round(calculateGaps.gapRight.distance)}mm
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-gray-400">
          {clipboard && <span className="text-green-600">📋 Copied</span>}
          <span className="hidden sm:inline">
            ⌘C copy • ⌘V paste • ⌘D duplicate • Space+drag pan
          </span>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden">
        <svg
          ref={svgRef}
          width={canvasSize.width || "100%"}
          height={canvasSize.height || "100%"}
          viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onMouseDown={handleCanvasMouseDown}
          onClick={handleCanvasClick}
          style={{ cursor: getCursor() }}
        >
          {/* Background that covers entire visible area - click to deselect */}
          <rect
            x={viewBoxX - 100}
            y={viewBoxY - 100}
            width={viewBoxWidth + 200}
            height={viewBoxHeight + 200}
            fill="#f3f4f6"
            onClick={() => selectPanel(null)}
            style={{ cursor: "default" }}
          />
          {renderGrid()}
          {panels.map((panel, index) => renderPanel(panel, index))}

          {/* Snap guides */}
          {snapGuides.map((guide, i) => (
            <line
              key={`guide-${i}`}
              x1={guide.type === "vertical" ? guide.position : guide.start}
              y1={guide.type === "horizontal" ? guide.position : guide.start}
              x2={guide.type === "vertical" ? guide.position : guide.end}
              y2={guide.type === "horizontal" ? guide.position : guide.end}
              stroke={GUIDE_COLOR}
              strokeWidth={1 / zoom}
              strokeDasharray={`${4 / zoom},${4 / zoom}`}
            />
          ))}

          {/* Distance indicators */}
          {distanceIndicators.map((dist, i) => (
            <g key={`dist-${i}`}>
              {/* Line between elements */}
              <line
                x1={dist.x1}
                y1={dist.y1}
                x2={dist.x2}
                y2={dist.y2}
                stroke={DISTANCE_COLOR}
                strokeWidth={1 / zoom}
              />
              {/* End caps */}
              {dist.orientation === "horizontal" ? (
                <>
                  <line
                    x1={dist.x1}
                    y1={dist.y1 - 6 / zoom}
                    x2={dist.x1}
                    y2={dist.y1 + 6 / zoom}
                    stroke={DISTANCE_COLOR}
                    strokeWidth={1 / zoom}
                  />
                  <line
                    x1={dist.x2}
                    y1={dist.y2 - 6 / zoom}
                    x2={dist.x2}
                    y2={dist.y2 + 6 / zoom}
                    stroke={DISTANCE_COLOR}
                    strokeWidth={1 / zoom}
                  />
                </>
              ) : (
                <>
                  <line
                    x1={dist.x1 - 6 / zoom}
                    y1={dist.y1}
                    x2={dist.x1 + 6 / zoom}
                    y2={dist.y1}
                    stroke={DISTANCE_COLOR}
                    strokeWidth={1 / zoom}
                  />
                  <line
                    x1={dist.x2 - 6 / zoom}
                    y1={dist.y2}
                    x2={dist.x2 + 6 / zoom}
                    y2={dist.y2}
                    stroke={DISTANCE_COLOR}
                    strokeWidth={1 / zoom}
                  />
                </>
              )}
              {/* Distance label */}
              <rect
                x={(dist.x1 + dist.x2) / 2 - 20 / zoom}
                y={(dist.y1 + dist.y2) / 2 - 8 / zoom}
                width={40 / zoom}
                height={16 / zoom}
                fill={DISTANCE_COLOR}
                rx={3 / zoom}
              />
              <text
                x={(dist.x1 + dist.x2) / 2}
                y={(dist.y1 + dist.y2) / 2 + 4 / zoom}
                textAnchor="middle"
                fontSize={10 / zoom}
                fill="white"
                fontWeight={600}
              >
                {dist.distance}
              </text>
            </g>
          ))}

          {panels.length === 0 && (
            <text
              x={viewBoxX + viewBoxWidth / 2}
              y={viewBoxY + viewBoxHeight / 2}
              textAnchor="middle"
              fontSize={16 / zoom}
              fill="#9ca3af"
            >
              Click "Add Panel" to start designing your furniture
            </text>
          )}

          {/* Ground line (Y=0 reference) */}
          {renderGroundLine()}

          {/* Gap indicators for selected panel */}
          {renderSelectedPanelIndicator()}

          {/* Rulers - rendered last to be on top */}
          {renderVerticalRuler()}
          {renderHorizontalRuler()}
          
          {/* Ruler corner box */}
          {showRulers && (
            <rect
              x={viewBoxX}
              y={viewBoxY}
              width={RULER_SIZE / zoom}
              height={RULER_SIZE / zoom}
              fill="rgba(255,255,255,0.95)"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
