import { Printer, X } from "lucide-react";
import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { generateAssemblySteps, getAssemblySummary } from "../lib/assembly";
import { useDesignStore } from "../stores/designStore";
import type { Panel } from "../types";
import CutListTable from "./CutListTable";
import Print3DImage from "./Print3DImage";

interface PrintViewProps {
  onClose: () => void;
}

// Get true dimensions based on orientation
function getTrueDimensions(panel: Panel, thickness: number): { width: number; height: number } {
  const orientation = panel.orientation || "horizontal";
  switch (orientation) {
    case "horizontal": return { width: panel.width, height: thickness };
    case "vertical": return { width: thickness, height: panel.height };
    case "back": return { width: panel.width, height: panel.height };
    default: return { width: panel.width, height: thickness };
  }
}

export default function PrintView({ onClose }: PrintViewProps) {
  const { panels, settings } = useDesignStore();
  const printRef = useRef<HTMLDivElement>(null);

  // Calculate bounds
  const bounds = React.useMemo(() => {
    if (panels.length === 0) return { minX: 0, maxX: 1000, minY: 0, maxY: 800 };
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    panels.forEach(p => {
      const dims = getTrueDimensions(p, settings.thickness);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + dims.width);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y + dims.height);
    });
    
    return { minX: minX - 50, maxX: maxX + 50, minY: minY - 50, maxY: maxY + 50 };
  }, [panels, settings.thickness]);

  const totalWidth = bounds.maxX - bounds.minX;
  const totalHeight = bounds.maxY - bounds.minY;

  // Calculate measurements for print
  const measurements = React.useMemo(() => {
    const result: {
      id: string;
      axis: "x" | "y";
      value: number;
      x1: number; y1: number;
      x2: number; y2: number;
      labelX: number; labelY: number;
    }[] = [];

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
      };
    });

    panelBounds.forEach(panel => {
      // Floor distance
      if (panel.bottom > 0) {
        result.push({
          id: `${panel.id}-floor`,
          axis: "y",
          value: panel.bottom,
          x1: panel.centerX,
          y1: 0,
          x2: panel.centerX,
          y2: panel.bottom,
          labelX: panel.centerX + 20,
          labelY: panel.bottom / 2,
        });
      }

      // Horizontal gaps
      const rightNeighbor = panelBounds
        .filter(p => p.id !== panel.id && p.top > panel.bottom && p.bottom < panel.top && p.left > panel.right)
        .sort((a, b) => a.left - b.left)[0];

      if (rightNeighbor) {
        const gap = rightNeighbor.left - panel.right;
        if (gap > 0) {
          const avgY = (Math.max(panel.bottom, rightNeighbor.bottom) + Math.min(panel.top, rightNeighbor.top)) / 2;
          result.push({
            id: `${panel.id}-right`,
            axis: "x",
            value: gap,
            x1: panel.right,
            y1: avgY,
            x2: rightNeighbor.left,
            y2: avgY,
            labelX: panel.right + gap / 2,
            labelY: avgY - 15,
          });
        }
      }

      // Vertical gaps
      const aboveNeighbor = panelBounds
        .filter(p => p.id !== panel.id && p.right > panel.left && p.left < panel.right && p.bottom > panel.top)
        .sort((a, b) => a.bottom - b.bottom)[0];

      if (aboveNeighbor) {
        const gap = aboveNeighbor.bottom - panel.top;
        if (gap > 0) {
          const avgX = (Math.max(panel.left, aboveNeighbor.left) + Math.min(panel.right, aboveNeighbor.right)) / 2;
          result.push({
            id: `${panel.id}-above`,
            axis: "y",
            value: gap,
            x1: avgX,
            y1: panel.top,
            x2: avgX,
            y2: aboveNeighbor.bottom,
            labelX: avgX + 20,
            labelY: panel.top + gap / 2,
          });
        }
      }
    });

    return result;
  }, [panels, settings.thickness]);

  // Overall dimensions
  const overallDims = React.useMemo(() => {
    if (panels.length === 0) return { width: 0, height: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 };
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    panels.forEach(p => {
      const dims = getTrueDimensions(p, settings.thickness);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + dims.width);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y + dims.height);
    });
    
    return { width: maxX - minX, height: maxY - minY, minX, maxX, minY, maxY };
  }, [panels, settings.thickness]);

  // Generate assembly steps
  const assemblySteps = useMemo(() => {
    return generateAssemblySteps(panels, settings);
  }, [panels, settings]);

  const assemblySummary = useMemo(() => {
    return getAssemblySummary(assemblySteps);
  }, [assemblySteps]);

  const handlePrint = () => {
    window.print();
  };

  // Close on Escape + add body class for print CSS
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    document.body.classList.add("print-view-open");
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("print-view-open");
    };
  }, [onClose]);

  return createPortal(
    <div className="print-view-container fixed inset-0 z-50 bg-white overflow-auto">
      {/* Screen-only header */}
      <div className="print:hidden sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Print Preview</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Printer size={18} />
            Print
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Printable content */}
      <div ref={printRef} className="print-content p-8 max-w-[210mm] mx-auto">
        
        {/* ==================== COVER PAGE ==================== */}
        <div className="cover-page flex flex-col justify-between pb-8" style={{ minHeight: "250mm" }}>
          {/* Top - Project Name */}
          <div className="pt-16 text-center">
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-2">
              {settings.projectName || "Assembly Guide"}
            </h1>
            <p className="text-lg text-gray-500">Build Instructions</p>
          </div>
          
          {/* Center - 3D View (large, centered) */}
          <div className="flex-1 flex items-center justify-center py-8">
            <div className="w-full flex justify-center">
              <Print3DImage width={550} height={420} />
            </div>
          </div>
          
          {/* Bottom - Quick specs */}
          <div className="text-center">
            <div className="inline-flex gap-8 px-8 py-4 bg-gray-100 rounded-lg">
              <div>
                <div className="text-2xl font-bold text-gray-900">{Math.round(overallDims.width)}</div>
                <div className="text-xs text-gray-500 uppercase">Width (mm)</div>
              </div>
              <div className="border-l border-gray-300" />
              <div>
                <div className="text-2xl font-bold text-gray-900">{Math.round(overallDims.height)}</div>
                <div className="text-xs text-gray-500 uppercase">Height (mm)</div>
              </div>
              <div className="border-l border-gray-300" />
              <div>
                <div className="text-2xl font-bold text-gray-900">{settings.furnitureDepth || 400}</div>
                <div className="text-xs text-gray-500 uppercase">Depth (mm)</div>
              </div>
              <div className="border-l border-gray-300" />
              <div>
                <div className="text-2xl font-bold text-gray-900">{panels.length}</div>
                <div className="text-xs text-gray-500 uppercase">Panels</div>
              </div>
            </div>
            <p className="mt-6 text-sm text-gray-400">
              Generated {new Date().toLocaleDateString()} • CraftCut
            </p>
          </div>
        </div>

        {/* ==================== CONTENT PAGES ==================== */}

        {/* Front View */}
        <section className="mb-8 page-break-inside-avoid">
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-6 h-6 bg-gray-900 text-white rounded flex items-center justify-center text-xs font-bold">1</span>
            Front View with Measurements
          </h2>
          <div className="border-2 border-gray-900 rounded-lg p-4 bg-white">
            <svg
              viewBox={`${bounds.minX - 30} ${-bounds.maxY - 30} ${totalWidth + 60} ${totalHeight + 60}`}
              className="w-full h-auto"
              style={{ maxHeight: "400px" }}
            >
              {/* Floor line */}
              <line
                x1={bounds.minX - 20}
                y1={0}
                x2={bounds.maxX + 20}
                y2={0}
                stroke="#000"
                strokeWidth={2}
              />
              <text x={bounds.minX - 15} y={12} fontSize={10} fill="#666">Floor</text>

              {/* Panels */}
              {panels.map(p => {
                const dims = getTrueDimensions(p, settings.thickness);
                const screenY = -p.y - dims.height;
                return (
                  <g key={p.id}>
                    <rect
                      x={p.x}
                      y={screenY}
                      width={dims.width}
                      height={dims.height}
                      fill="none"
                      stroke="#000"
                      strokeWidth={1.5}
                    />
                    {/* Cross-hatch for thickness indication */}
                    {p.orientation === "vertical" && (
                      <>
                        <line x1={p.x} y1={screenY} x2={p.x + dims.width} y2={screenY + dims.height} stroke="#000" strokeWidth={0.5} />
                        <line x1={p.x + dims.width} y1={screenY} x2={p.x} y2={screenY + dims.height} stroke="#000" strokeWidth={0.5} />
                      </>
                    )}
                    {/* Panel label */}
                    <text
                      x={p.x + dims.width / 2}
                      y={screenY + dims.height / 2 + 3}
                      fontSize={8}
                      fill="#333"
                      textAnchor="middle"
                      fontWeight={500}
                    >
                      {p.label || p.id.slice(0, 4)}
                    </text>
                  </g>
                );
              })}

              {/* Measurements */}
              {measurements.map(m => {
                const screenY1 = -m.y1;
                const screenY2 = -m.y2;
                const screenLabelY = -m.labelY;
                const isVertical = m.axis === "y";

                return (
                  <g key={m.id}>
                    <line
                      x1={m.x1}
                      y1={screenY1}
                      x2={m.x2}
                      y2={screenY2}
                      stroke="#000"
                      strokeWidth={0.75}
                      strokeDasharray="4,2"
                    />
                    {/* End caps */}
                    {isVertical ? (
                      <>
                        <line x1={m.x1 - 4} y1={screenY1} x2={m.x1 + 4} y2={screenY1} stroke="#000" strokeWidth={0.75} />
                        <line x1={m.x2 - 4} y1={screenY2} x2={m.x2 + 4} y2={screenY2} stroke="#000" strokeWidth={0.75} />
                      </>
                    ) : (
                      <>
                        <line x1={m.x1} y1={screenY1 - 4} x2={m.x1} y2={screenY1 + 4} stroke="#000" strokeWidth={0.75} />
                        <line x1={m.x2} y1={screenY2 - 4} x2={m.x2} y2={screenY2 + 4} stroke="#000" strokeWidth={0.75} />
                      </>
                    )}
                    {/* Label */}
                    <rect
                      x={m.labelX - 28}
                      y={screenLabelY - 12}
                      width={56}
                      height={24}
                      fill="white"
                      stroke="#000"
                      strokeWidth={0.5}
                    />
                    <text
                      x={m.labelX}
                      y={screenLabelY + 6}
                      fontSize={16}
                      fill="#000"
                      textAnchor="middle"
                      fontWeight={700}
                    >
                      {Math.round(m.value)}
                    </text>
                  </g>
                );
              })}

              {/* Overall width dimension at top */}
              <g>
                <line
                  x1={overallDims.minX}
                  y1={-overallDims.maxY - 15}
                  x2={overallDims.maxX}
                  y2={-overallDims.maxY - 15}
                  stroke="#000"
                  strokeWidth={1}
                />
                <line x1={overallDims.minX} y1={-overallDims.maxY - 20} x2={overallDims.minX} y2={-overallDims.maxY - 10} stroke="#000" strokeWidth={1} />
                <line x1={overallDims.maxX} y1={-overallDims.maxY - 20} x2={overallDims.maxX} y2={-overallDims.maxY - 10} stroke="#000" strokeWidth={1} />
                <rect
                  x={(overallDims.minX + overallDims.maxX) / 2 - 35}
                  y={-overallDims.maxY - 32}
                  width={70}
                  height={26}
                  fill="white"
                />
                <text
                  x={(overallDims.minX + overallDims.maxX) / 2}
                  y={-overallDims.maxY - 12}
                  fontSize={18}
                  fill="#000"
                  textAnchor="middle"
                  fontWeight={700}
                >
                  {Math.round(overallDims.width)}
                </text>
              </g>

              {/* Overall height dimension on left */}
              <g>
                <line
                  x1={overallDims.minX - 15}
                  y1={-overallDims.minY}
                  x2={overallDims.minX - 15}
                  y2={-overallDims.maxY}
                  stroke="#000"
                  strokeWidth={1}
                />
                <line x1={overallDims.minX - 20} y1={-overallDims.minY} x2={overallDims.minX - 10} y2={-overallDims.minY} stroke="#000" strokeWidth={1} />
                <line x1={overallDims.minX - 20} y1={-overallDims.maxY} x2={overallDims.minX - 10} y2={-overallDims.maxY} stroke="#000" strokeWidth={1} />
                <rect
                  x={overallDims.minX - 55}
                  y={-(overallDims.minY + overallDims.maxY) / 2 - 13}
                  width={70}
                  height={26}
                  fill="white"
                />
                <text
                  x={overallDims.minX - 20}
                  y={-(overallDims.minY + overallDims.maxY) / 2 + 6}
                  fontSize={18}
                  fill="#000"
                  textAnchor="middle"
                  fontWeight={700}
                >
                  {Math.round(overallDims.height)}
                </text>
              </g>
            </svg>
          </div>
        </section>

        {/* Cut List */}
        <section className="mb-8 page-break-inside-avoid">
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-6 h-6 bg-gray-900 text-white rounded flex items-center justify-center text-xs font-bold">2</span>
            Cut List
          </h2>
          <CutListTable variant="print" />
        </section>

        {/* Panel Diagrams - IKEA Style */}
        <section className="mb-8 page-break-inside-avoid">
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-6 h-6 bg-gray-900 text-white rounded flex items-center justify-center text-xs font-bold">3</span>
            Panel Shapes
          </h2>
          
          {(() => {
            // Group panels by actual cut dimensions AND orientation
            const grouped = new Map<string, { length: number; width: number; thickness: number; count: number; isVertical: boolean }>();
            panels.forEach(p => {
              const orientation = p.orientation || "horizontal";
              const furnitureDepth = p.depth || settings.furnitureDepth || 400;
              
              let cutLength: number;
              let cutWidth: number;
              
              if (orientation === "horizontal") {
                cutLength = p.width;
                cutWidth = furnitureDepth;
              } else if (orientation === "vertical") {
                cutLength = p.height;
                cutWidth = furnitureDepth;
              } else {
                cutLength = Math.max(p.width, p.height);
                cutWidth = Math.min(p.width, p.height);
              }
              
              const length = Math.max(cutLength, cutWidth);
              const width = Math.min(cutLength, cutWidth);
              const isVertical = orientation === "vertical";
              
              const key = `${length}x${width}x${isVertical ? 'v' : 'h'}`;
              const existing = grouped.get(key);
              if (existing) {
                existing.count++;
              } else {
                grouped.set(key, { length, width, thickness: settings.thickness, count: 1, isVertical });
              }
            });
            
            // Split into vertical and horizontal groups
            const verticalPanels: Array<[string, typeof grouped extends Map<string, infer V> ? V : never]> = [];
            const horizontalPanels: Array<[string, typeof grouped extends Map<string, infer V> ? V : never]> = [];
            
            grouped.forEach((value, key) => {
              if (value.isVertical) {
                verticalPanels.push([key, value]);
              } else {
                horizontalPanels.push([key, value]);
              }
            });
            
            // Sort each group by length
            verticalPanels.sort((a, b) => b[1].length - a[1].length);
            horizontalPanels.sort((a, b) => b[1].length - a[1].length);
            
            // Find max for consistent scaling across ALL panels
            let maxDim = 0;
            grouped.forEach(({ length }) => {
              if (length > maxDim) maxDim = length;
            });
            
            const renderPanel = (key: string, { length, width, count, isVertical }: { length: number; width: number; thickness: number; count: number; isVertical: boolean }) => {
              const maxSize = 100;
              const scale = maxSize / maxDim;
              const t = 2; // Thin depth
              
              if (isVertical) {
                // Vertical panel - standing up (length is height)
                const h = length * scale;
                const w = Math.max(width * scale, 15);
                
                const leftMargin = 35;
                const topMargin = 8;
                const bottomMargin = 22;
                const rightMargin = 8;
                const svgW = leftMargin + w + t + rightMargin;
                const svgH = topMargin + h + t + bottomMargin;
                
                return (
                  <div key={key} className="flex flex-col items-center">
                    <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
                      {/* Top edge */}
                      <polygon
                        points={`${leftMargin},${topMargin + t} ${leftMargin + t},${topMargin} ${leftMargin + w + t},${topMargin} ${leftMargin + w},${topMargin + t}`}
                        fill="#e8e8e8" stroke="#333" strokeWidth={0.75}
                      />
                      {/* Right edge */}
                      <polygon
                        points={`${leftMargin + w},${topMargin + t} ${leftMargin + w + t},${topMargin} ${leftMargin + w + t},${topMargin + h} ${leftMargin + w},${topMargin + h + t}`}
                        fill="#d8d8d8" stroke="#333" strokeWidth={0.75}
                      />
                      {/* Front face */}
                      <rect x={leftMargin} y={topMargin + t} width={w} height={h} fill="#f5f5f5" stroke="#333" strokeWidth={1} />
                      
                      {/* Height dimension (left) */}
                      <text x={leftMargin - 5} y={topMargin + t + h / 2} fontSize={9} fill="#333" textAnchor="end" dominantBaseline="middle">{length}</text>
                      
                      {/* Width dimension (bottom) */}
                      <text x={leftMargin + w / 2} y={topMargin + t + h + 15} fontSize={9} fill="#333" textAnchor="middle">{width}</text>
                      
                      {/* Quantity */}
                      <text x={leftMargin - 5} y={topMargin + t + h + 15} fontSize={12} fill="#333" fontWeight={700} textAnchor="end">{count}×</text>
                    </svg>
                  </div>
                );
              } else {
                // Horizontal panel - lying flat (length is width, shown horizontally)
                const w = length * scale;
                const h = Math.max(width * scale, 12);
                
                const leftMargin = 25;
                const topMargin = 8;
                const bottomMargin = 20;
                const rightMargin = 8;
                const svgW = leftMargin + w + t + rightMargin;
                const svgH = topMargin + h + t + bottomMargin;
                
                return (
                  <div key={key} className="flex flex-col items-center">
                    <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
                      {/* Top edge */}
                      <polygon
                        points={`${leftMargin},${topMargin + t} ${leftMargin + t},${topMargin} ${leftMargin + w + t},${topMargin} ${leftMargin + w},${topMargin + t}`}
                        fill="#e8e8e8" stroke="#333" strokeWidth={0.75}
                      />
                      {/* Right edge */}
                      <polygon
                        points={`${leftMargin + w},${topMargin + t} ${leftMargin + w + t},${topMargin} ${leftMargin + w + t},${topMargin + h} ${leftMargin + w},${topMargin + h + t}`}
                        fill="#d8d8d8" stroke="#333" strokeWidth={0.75}
                      />
                      {/* Front face */}
                      <rect x={leftMargin} y={topMargin + t} width={w} height={h} fill="#f5f5f5" stroke="#333" strokeWidth={1} />
                      
                      {/* Width dimension (left - short side) */}
                      <text x={leftMargin - 5} y={topMargin + t + h / 2} fontSize={9} fill="#333" textAnchor="end" dominantBaseline="middle">{width}</text>
                      
                      {/* Length dimension (bottom - long side) */}
                      <text x={leftMargin + w / 2} y={topMargin + t + h + 12} fontSize={9} fill="#333" textAnchor="middle">{length}</text>
                      
                      {/* Quantity */}
                      <text x={leftMargin - 5} y={topMargin + t + h + 12} fontSize={12} fill="#333" fontWeight={700} textAnchor="end">{count}×</text>
                    </svg>
                  </div>
                );
              }
            };
            
            return (
              <div className="space-y-6">
                {/* Vertical panels (sides, dividers) */}
                {verticalPanels.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Vertical Panels (Sides)</div>
                    <div className="flex flex-wrap gap-4 items-end">
                      {verticalPanels.map(([key, panel]) => renderPanel(key, panel))}
                    </div>
                  </div>
                )}
                
                {/* Horizontal panels (shelves, top, bottom) */}
                {horizontalPanels.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Horizontal Panels (Shelves)</div>
                    <div className="flex flex-wrap gap-4 items-end">
                      {horizontalPanels.map(([key, panel]) => renderPanel(key, panel))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </section>

        {/* Assembly Steps */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-6 h-6 bg-gray-900 text-white rounded flex items-center justify-center text-xs font-bold">4</span>
            Assembly Instructions
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Estimated time: {assemblySummary.estimatedTime} • {assemblySummary.totalSteps} steps
          </p>
          <div className="space-y-3">
            {assemblySteps.map((step) => {
              const panel = panels.find(p => p.id === step.panelId);
              const orientation = panel?.orientation || "horizontal";
              
              return (
                <div key={step.stepNumber} className="flex gap-4 items-start p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {/* Step number */}
                  <div className="flex-shrink-0 w-8 h-8 bg-gray-900 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    {step.stepNumber}
                  </div>
                  
                  {/* Mini panel diagram */}
                  <div className="flex-shrink-0 w-12 flex items-center justify-center">
                    <svg 
                      width={orientation === "horizontal" ? 40 : 20} 
                      height={orientation === "horizontal" ? 16 : 36} 
                      viewBox={orientation === "horizontal" ? "0 0 40 16" : "0 0 20 36"}
                    >
                      {/* Simple 3D panel representation */}
                      <polygon
                        points={orientation === "horizontal" 
                          ? "0,4 2,2 38,2 36,4" 
                          : "0,4 2,2 18,2 16,4"}
                        fill="#e8e8e8"
                        stroke="#333"
                        strokeWidth={0.5}
                      />
                      <polygon
                        points={orientation === "horizontal" 
                          ? "36,4 38,2 38,12 36,14" 
                          : "16,4 18,2 18,32 16,34"}
                        fill="#d8d8d8"
                        stroke="#333"
                        strokeWidth={0.5}
                      />
                      <rect
                        x={0}
                        y={4}
                        width={orientation === "horizontal" ? 36 : 16}
                        height={orientation === "horizontal" ? 10 : 30}
                        fill="#f5f5f5"
                        stroke="#333"
                        strokeWidth={0.75}
                      />
                    </svg>
                  </div>
                  
                  {/* Instruction text */}
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{step.action}: {step.panelLabel}</div>
                    <div className="text-sm text-gray-600 mt-0.5">{step.instruction}</div>
                    {step.connectsTo.length > 0 && (
                      <div className="text-xs text-gray-400 mt-1">
                        Connects to: {step.connectsTo.map(id => {
                          const p = panels.find(pp => pp.id === id);
                          return p?.label || `Panel ${id.slice(0, 4)}`;
                        }).join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Notes Section */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-6 h-6 bg-gray-900 text-white rounded flex items-center justify-center text-xs font-bold">5</span>
            Assembly Notes
          </h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 min-h-[100px]">
            <p className="text-sm text-gray-400 italic">Space for handwritten notes during assembly</p>
            <div className="mt-4 space-y-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="border-b border-gray-200" />
              ))}
            </div>
          </div>
        </section>

        {/* Material Requirements */}
        <section className="page-break-inside-avoid">
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-6 h-6 bg-gray-900 text-white rounded flex items-center justify-center text-xs font-bold">6</span>
            Material Summary
          </h2>
          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Board Thickness</div>
              <div className="text-lg font-semibold text-gray-900">{settings.thickness}mm</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Standard Depth</div>
              <div className="text-lg font-semibold text-gray-900">{settings.furnitureDepth || 400}mm</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Sheet Size</div>
              <div className="text-lg font-semibold text-gray-900">{settings.sheetWidth} × {settings.sheetHeight}mm</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Panels</div>
              <div className="text-lg font-semibold text-gray-900">{panels.length} pieces</div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-8 pt-4 border-t border-gray-200 text-center text-xs text-gray-400">
          Generated by CraftCut • All measurements in millimeters
        </footer>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 15mm;
          }
          
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          .print\\:hidden {
            display: none !important;
          }
          
          .print-content {
            padding: 0 !important;
            max-width: none !important;
          }
          
          .page-break-inside-avoid {
            page-break-inside: avoid;
          }
          
          .page-break {
            page-break-after: always;
          }
          
          .cover-page {
            page-break-after: always;
          }
          
          section {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
