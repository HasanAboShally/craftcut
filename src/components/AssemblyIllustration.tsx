/**
 * IKEA-style Assembly Step Illustration
 * 
 * Shows cumulative assembly progress with the current panel highlighted
 * and labeled with a letter. Previous panels shown in gray, current in black.
 */

import React, { useMemo } from "react";
import type { Panel, Settings } from "../types";

interface AssemblyIllustrationProps {
  panels: Panel[];
  cumulativePanelIds: string[];
  currentPanelId: string;
  letterLabels: Map<string, string>;
  settings: Settings;
  size?: number;
}

// Get true dimensions based on orientation
function getTrueDimensions(panel: Panel, thickness: number): { width: number; height: number; depth: number } {
  const orientation = panel.orientation || "horizontal";
  switch (orientation) {
    case "horizontal": 
      return { width: panel.width, height: thickness, depth: panel.depth || 400 };
    case "vertical": 
      return { width: thickness, height: panel.height, depth: panel.depth || 400 };
    case "back": 
      return { width: panel.width, height: panel.height, depth: thickness };
    default: 
      return { width: panel.width, height: thickness, depth: panel.depth || 400 };
  }
}

// Isometric projection helpers
const ISO_ANGLE = Math.PI / 6; // 30 degrees
const COS_ISO = Math.cos(ISO_ANGLE);
const SIN_ISO = Math.sin(ISO_ANGLE);

function toIsometric(x: number, y: number, z: number): { x: number; y: number } {
  return {
    x: (x - z) * COS_ISO,
    y: y + (x + z) * SIN_ISO,
  };
}

export default function AssemblyIllustration({
  panels,
  cumulativePanelIds,
  currentPanelId,
  letterLabels,
  settings,
  size = 180,
}: AssemblyIllustrationProps) {
  const { visiblePanels, bounds, scale, offset } = useMemo(() => {
    // Filter to only cumulative panels
    const visible = panels.filter(p => cumulativePanelIds.includes(p.id));
    
    if (visible.length === 0) {
      return { 
        visiblePanels: [], 
        bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 100 },
        scale: 1,
        offset: { x: 0, y: 0 }
      };
    }
    
    // Calculate 3D bounds
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    visible.forEach(p => {
      const dims = getTrueDimensions(p, settings.thickness);
      const panelDepth = p.depth || settings.furnitureDepth;
      const z = p.orientation === "back" ? settings.furnitureDepth - settings.thickness : 0;
      
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + dims.width);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y + dims.height);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z + (p.orientation === "back" ? settings.thickness : panelDepth));
    });
    
    // Add padding
    const padding = 20;
    const totalWidth = maxX - minX;
    const totalHeight = maxY - minY;
    const totalDepth = maxZ - minZ;
    
    // Calculate isometric bounding box
    const corners = [
      toIsometric(0, 0, 0),
      toIsometric(totalWidth, 0, 0),
      toIsometric(0, totalHeight, 0),
      toIsometric(totalWidth, totalHeight, 0),
      toIsometric(0, 0, totalDepth),
      toIsometric(totalWidth, 0, totalDepth),
      toIsometric(0, totalHeight, totalDepth),
      toIsometric(totalWidth, totalHeight, totalDepth),
    ];
    
    const isoMinX = Math.min(...corners.map(c => c.x));
    const isoMaxX = Math.max(...corners.map(c => c.x));
    const isoMinY = Math.min(...corners.map(c => c.y));
    const isoMaxY = Math.max(...corners.map(c => c.y));
    
    const isoWidth = isoMaxX - isoMinX;
    const isoHeight = isoMaxY - isoMinY;
    
    const scaleVal = Math.min(
      (size - padding * 2) / isoWidth,
      (size - padding * 2) / isoHeight
    );
    
    return {
      visiblePanels: visible,
      bounds: { minX, maxX, minY, maxY, minZ, maxZ },
      scale: scaleVal,
      offset: {
        x: size / 2 - (isoMinX + isoWidth / 2) * scaleVal,
        y: size / 2 - (isoMinY + isoHeight / 2) * scaleVal,
      }
    };
  }, [panels, cumulativePanelIds, settings, size]);

  // Transform a 3D point to SVG coordinates
  const transform = (x: number, y: number, z: number) => {
    const relX = x - bounds.minX;
    const relY = y - bounds.minY;
    const relZ = z - bounds.minZ;
    const iso = toIsometric(relX, relY, relZ);
    return {
      x: iso.x * scale + offset.x,
      y: size - (iso.y * scale + offset.y), // Flip Y for SVG
    };
  };

  // Render a panel as isometric box
  const renderPanel = (panel: Panel, isCurrent: boolean) => {
    const dims = getTrueDimensions(panel, settings.thickness);
    const panelDepth = panel.depth || settings.furnitureDepth;
    const orientation = panel.orientation || "horizontal";
    
    let z: number;
    if (orientation === "back") {
      z = settings.furnitureDepth - settings.thickness;
    } else {
      const zAlign = panel.zAlign || "front";
      switch (zAlign) {
        case "front": z = 0; break;
        case "back": z = settings.furnitureDepth - panelDepth; break;
        case "center": z = (settings.furnitureDepth - panelDepth) / 2; break;
        default: z = 0;
      }
    }
    
    const actualDepth = orientation === "back" ? settings.thickness : panelDepth;
    
    // 8 corners of the box
    const corners = {
      fbl: transform(panel.x, panel.y, z), // front-bottom-left
      fbr: transform(panel.x + dims.width, panel.y, z),
      ftl: transform(panel.x, panel.y + dims.height, z),
      ftr: transform(panel.x + dims.width, panel.y + dims.height, z),
      bbl: transform(panel.x, panel.y, z + actualDepth),
      bbr: transform(panel.x + dims.width, panel.y, z + actualDepth),
      btl: transform(panel.x, panel.y + dims.height, z + actualDepth),
      btr: transform(panel.x + dims.width, panel.y + dims.height, z + actualDepth),
    };
    
    // Colors
    const fillFront = isCurrent ? "#fff" : "#f5f5f5";
    const fillTop = isCurrent ? "#fff" : "#e8e8e8";
    const fillSide = isCurrent ? "#fff" : "#ddd";
    const stroke = isCurrent ? "#000" : "#888";
    const strokeWidth = isCurrent ? 1.5 : 0.75;
    
    // Determine which faces are visible (simplified for isometric)
    // Front face, top face, right side face
    const frontFace = `M${corners.fbl.x},${corners.fbl.y} L${corners.fbr.x},${corners.fbr.y} L${corners.ftr.x},${corners.ftr.y} L${corners.ftl.x},${corners.ftl.y} Z`;
    const topFace = `M${corners.ftl.x},${corners.ftl.y} L${corners.ftr.x},${corners.ftr.y} L${corners.btr.x},${corners.btr.y} L${corners.btl.x},${corners.btl.y} Z`;
    const rightFace = `M${corners.fbr.x},${corners.fbr.y} L${corners.bbr.x},${corners.bbr.y} L${corners.btr.x},${corners.btr.y} L${corners.ftr.x},${corners.ftr.y} Z`;
    
    // Label position (center of front face)
    const labelPos = {
      x: (corners.fbl.x + corners.ftr.x) / 2,
      y: (corners.fbl.y + corners.ftr.y) / 2,
    };
    
    const letter = letterLabels.get(panel.id) || "?";
    
    return (
      <g key={panel.id}>
        {/* Right side (if visible) */}
        <path d={rightFace} fill={fillSide} stroke={stroke} strokeWidth={strokeWidth} />
        {/* Top face */}
        <path d={topFace} fill={fillTop} stroke={stroke} strokeWidth={strokeWidth} />
        {/* Front face */}
        <path d={frontFace} fill={fillFront} stroke={stroke} strokeWidth={strokeWidth} />
        
        {/* Letter label */}
        <text
          x={labelPos.x}
          y={labelPos.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={isCurrent ? 14 : 10}
          fontWeight={isCurrent ? "bold" : "normal"}
          fill={isCurrent ? "#000" : "#666"}
        >
          {letter}
        </text>
        
        {/* Arrow pointing to current panel */}
        {isCurrent && (
          <>
            <line
              x1={labelPos.x + 25}
              y1={labelPos.y - 25}
              x2={labelPos.x + 8}
              y2={labelPos.y - 8}
              stroke="#000"
              strokeWidth={1.5}
              markerEnd="url(#arrowhead)"
            />
          </>
        )}
      </g>
    );
  };

  // Sort panels by depth (back to front) for proper rendering
  const sortedPanels = useMemo(() => {
    return [...visiblePanels].sort((a, b) => {
      const zA = a.orientation === "back" ? settings.furnitureDepth : 0;
      const zB = b.orientation === "back" ? settings.furnitureDepth : 0;
      // Render back panels first, then by Y position
      if (zA !== zB) return zA - zB;
      return a.y - b.y;
    });
  }, [visiblePanels, settings.furnitureDepth]);

  if (visiblePanels.length === 0) {
    return (
      <svg width={size} height={size} className="bg-white border border-gray-200 rounded">
        <text x={size/2} y={size/2} textAnchor="middle" fill="#999" fontSize={12}>
          No panels
        </text>
      </svg>
    );
  }

  return (
    <svg width={size} height={size} className="bg-white border border-gray-200 rounded">
      <defs>
        <marker
          id="arrowhead"
          markerWidth="6"
          markerHeight="6"
          refX="0"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 6 3, 0 6" fill="#000" />
        </marker>
      </defs>
      
      {/* Render all cumulative panels */}
      {sortedPanels.map(panel => renderPanel(panel, panel.id === currentPanelId))}
    </svg>
  );
}
