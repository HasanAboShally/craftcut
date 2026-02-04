import {
  Download,
  FileText,
  Printer,
  Package,
  Wrench,
} from "lucide-react";
import React, { useEffect, useMemo, useRef } from "react";
import { generateAssemblySteps, getAssemblySummary } from "../lib/assembly";
import { calculateGroupedCutList } from "../lib/optimizer";
import { useDesignStore } from "../stores/designStore";
import type { Panel } from "../types";
import AssemblyIllustration from "./AssemblyIllustration";
import CuttingDiagram from "./CuttingDiagram";
import Print3DImage from "./Print3DImage";

// Print styles injected into document head
const PRINT_STYLES = `
@media print {
  /* Hide everything outside production view */
  body > *:not(.production-print-root) {
    display: none !important;
  }
  
  /* Reset body/html for print */
  html, body {
    height: auto !important;
    overflow: visible !important;
    background: white !important;
  }
  
  /* Production view takes full page */
  .production-print-root {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: auto !important;
    overflow: visible !important;
    background: white !important;
  }
  
  .production-print-root > div {
    height: auto !important;
    overflow: visible !important;
  }
  
  .production-content {
    max-width: 100% !important;
    padding: 0 !important;
    overflow: visible !important;
  }
  
  .production-content > * {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  
  /* Section styling for print */
  .production-section {
    border: 1px solid #ddd !important;
    margin-bottom: 20px !important;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  
  /* Hide screen-only elements */
  .no-print {
    display: none !important;
  }
  
  /* Force backgrounds to print */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
`;

// Get true dimensions based on orientation
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
      return { width: panel.width, height: thickness };
  }
}

export default function ProductionView() {
  const { panels, settings, exportDesign } = useDesignStore();
  const contentRef = useRef<HTMLDivElement>(null);

  // Calculate bounds
  const bounds = useMemo(() => {
    if (panels.length === 0) return { minX: 0, maxX: 1000, minY: 0, maxY: 800 };

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

    return {
      minX: minX - 50,
      maxX: maxX + 50,
      minY: minY - 50,
      maxY: maxY + 50,
    };
  }, [panels, settings.thickness]);

  const totalWidth = bounds.maxX - bounds.minX;
  const totalHeight = bounds.maxY - bounds.minY;

  // Generate assembly steps
  const assemblySteps = useMemo(() => {
    return generateAssemblySteps(panels, settings);
  }, [panels, settings]);

  const assemblySummary = useMemo(() => {
    return getAssemblySummary(assemblySteps);
  }, [assemblySteps]);

  // Get grouped cut list (sorted by size, A = largest)
  const { pieces: groupedPieces, dimensionToLetter } = useMemo(() => {
    return calculateGroupedCutList(
      panels,
      settings.thickness,
      settings.furnitureDepth || 400,
    );
  }, [panels, settings.thickness, settings.furnitureDepth]);

  // Create letter labels map based on dimensions (for assembly illustrations)
  const panelLetters = useMemo(() => {
    const map = new Map<string, string>();
    panels.forEach((panel) => {
      const orientation = panel.orientation || "horizontal";
      const panelDepth = panel.depth || settings.furnitureDepth || 400;
      let length: number, width: number;

      switch (orientation) {
        case "horizontal":
          length = panel.width;
          width = panelDepth;
          break;
        case "vertical":
          length = panel.height;
          width = panelDepth;
          break;
        case "back":
          length = panel.width;
          width = panel.height;
          break;
        default:
          length = panel.width;
          width = panelDepth;
      }

      // Normalize
      if (width > length) {
        [length, width] = [width, length];
      }

      const key = `${length}x${width}`;
      const letter = dimensionToLetter.get(key) || "?";
      map.set(panel.id, letter);
    });
    return map;
  }, [panels, settings.furnitureDepth, dimensionToLetter]);

  const handleExportJSON = () => {
    const data = exportDesign();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "craftcut-design.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const headers = ["Letter", "Label", "Width (mm)", "Height (mm)", "Depth (mm)", "Type", "Quantity"];
    const rows = panels.map((p) => {
      const letter = panelLetters.get(p.id) || "?";
      const orientation = p.orientation || "horizontal";
      const depth = p.depth || settings.furnitureDepth || 400;
      return [
        letter,
        p.label || `Panel ${letter}`,
        p.width,
        p.height,
        depth,
        orientation,
        p.quantity,
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cut-list.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  // Inject print styles
  useEffect(() => {
    const styleId = "production-print-styles";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = PRINT_STYLES;
      document.head.appendChild(style);
    }
    return () => {
      const style = document.getElementById(styleId);
      if (style) style.remove();
    };
  }, []);

  if (panels.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package size={32} className="text-blue-400" />
          </div>
          <p className="text-lg font-medium text-gray-700 mb-2">No panels yet</p>
          <p className="text-sm text-gray-500 mb-4">
            Switch to the Design view and add some panels to see production documents.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="production-print-root h-full flex flex-col bg-gray-100 print:bg-white">
      {/* Header - Hidden when printing */}
      <div className="no-print flex items-center justify-between p-4 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Package className="text-blue-600" size={24} />
          <div>
            <h2 className="font-semibold text-gray-800">Production Documents</h2>
            <p className="text-sm text-gray-500">
              {panels.length} panel{panels.length !== 1 ? "s" : ""} • 
              {assemblySummary.totalSteps} assembly steps
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <FileText size={16} />
            CSV
          </button>
          <button
            onClick={handleExportJSON}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download size={16} />
            JSON
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Printer size={16} />
            Print
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto print:overflow-visible">
        <div ref={contentRef} className="production-content max-w-4xl mx-auto p-6 space-y-8 print:max-w-none print:p-4">
          
          {/* Section 1: Project Overview */}
          <section className="production-section bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <span className="w-6 h-6 bg-gray-900 text-white rounded flex items-center justify-center text-xs font-bold">1</span>
                Project Overview
              </h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-6">
                {/* 3D Preview */}
                <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                  <Print3DImage
                    panels={panels}
                    settings={settings}
                    cameraPosition="front-right"
                    size={300}
                  />
                </div>
                
                {/* Project Info */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-2xl font-bold text-gray-900">
                      {settings.projectName || "Untitled Project"}
                    </h4>
                    <p className="text-gray-500 mt-1">Furniture Assembly Guide</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-gray-500">Overall Width</div>
                      <div className="text-xl font-semibold">{Math.round(totalWidth - 100)} mm</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-gray-500">Overall Height</div>
                      <div className="text-xl font-semibold">{Math.round(totalHeight - 100)} mm</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-gray-500">Depth</div>
                      <div className="text-xl font-semibold">{settings.furnitureDepth || 400} mm</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-gray-500">Board Thickness</div>
                      <div className="text-xl font-semibold">{settings.thickness} mm</div>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Total Panels</span>
                      <span className="font-semibold">{panels.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-2">
                      <span className="text-gray-500">Assembly Steps</span>
                      <span className="font-semibold">{assemblySummary.totalSteps}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-2">
                      <span className="text-gray-500">Estimated Time</span>
                      <span className="font-semibold">{assemblySummary.estimatedTime}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Parts List */}
          <section className="production-section bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <span className="w-6 h-6 bg-gray-900 text-white rounded flex items-center justify-center text-xs font-bold">2</span>
                Parts List
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Grouped by dimensions • Sorted by size (A = largest)
              </p>
            </div>
            <div className="p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="px-3 py-2 text-center font-semibold">Part</th>
                    <th className="px-3 py-2 text-right font-semibold">Length</th>
                    <th className="px-3 py-2 text-right font-semibold">Width</th>
                    <th className="px-3 py-2 text-right font-semibold">Thickness</th>
                    <th className="px-3 py-2 text-center font-semibold">Qty</th>
                    <th className="px-3 py-2 text-right font-semibold">Area</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedPieces.map((piece, idx) => (
                    <tr key={piece.letter} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-3 py-2 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 bg-blue-600 text-white text-sm font-bold rounded">
                          {piece.letter}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{piece.length} mm</td>
                      <td className="px-3 py-2 text-right font-mono">{piece.width} mm</td>
                      <td className="px-3 py-2 text-right font-mono">{piece.thickness} mm</td>
                      <td className="px-3 py-2 text-center font-semibold">{piece.qty}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{piece.area.toFixed(2)} m²</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-semibold">
                    <td colSpan={4} className="px-3 py-2 text-right">Total:</td>
                    <td className="px-3 py-2 text-center">{groupedPieces.reduce((sum, p) => sum + p.qty, 0)}</td>
                    <td className="px-3 py-2 text-right">{groupedPieces.reduce((sum, p) => sum + p.area, 0).toFixed(2)} m²</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* Section 3: Panel Shapes */}
          <section className="production-section bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <span className="w-6 h-6 bg-gray-900 text-white rounded flex items-center justify-center text-xs font-bold">3</span>
                Panel Shapes
              </h3>
            </div>
            <div className="p-4">
              <PanelShapesSection panels={panels} settings={settings} panelLetters={panelLetters} />
            </div>
          </section>

          {/* Section 4: Cutting Diagrams */}
          <section className="production-section bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <span className="w-6 h-6 bg-gray-900 text-white rounded flex items-center justify-center text-xs font-bold">4</span>
                Cutting Diagrams
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Optimized layout for cutting panels from {settings.sheetWidth} × {settings.sheetHeight} mm sheets
              </p>
            </div>
            <div className="p-4">
              <CuttingDiagram />
            </div>
          </section>

          {/* Section 5: Assembly Instructions */}
          <section className="production-section bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <span className="w-6 h-6 bg-gray-900 text-white rounded flex items-center justify-center text-xs font-bold">5</span>
                Assembly Instructions
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {assemblySummary.totalSteps} steps • Estimated time: {assemblySummary.estimatedTime}
              </p>
            </div>
            <div className="p-4">
              <div className="space-y-6">
                {assemblySteps.map((step) => (
                  <div key={step.stepNumber} className="flex gap-4 page-break-inside-avoid">
                    {/* Step illustration - fixed size container */}
                    <div className="w-40 h-40 bg-gray-100 rounded-lg flex-shrink-0 flex items-center justify-center">
                      <AssemblyIllustration
                        panels={panels}
                        settings={settings}
                        cumulativePanelIds={step.cumulativePanels}
                        currentPanelId={step.panelId}
                        letterLabels={panelLetters}
                        size={160}
                      />
                    </div>
                    
                    {/* Step details */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-blue-600 text-white text-sm font-bold rounded-full">
                          {step.stepNumber}
                        </span>
                        <span className="inline-flex items-center justify-center px-2 py-1 bg-gray-200 text-gray-700 text-xs font-semibold rounded">
                          Panel {step.letterLabel}
                        </span>
                        {step.stabilityStatus === "unstable" && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">
                            ⚠ Hold in place
                          </span>
                        )}
                      </div>
                      
                      <p className="text-gray-800 font-medium mb-1">{step.action}</p>
                      <p className="text-gray-600 text-sm">{step.instruction}</p>
                      
                      {step.supportHint && (
                        <p className="text-amber-700 text-sm mt-2 bg-amber-50 px-2 py-1 rounded">
                          💡 {step.supportHint.hint}
                        </p>
                      )}
                      
                      {step.alignmentTip && (
                        <p className="text-blue-600 text-sm mt-1">
                          📐 {step.alignmentTip}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Section 6: Tips & Notes */}
          {/* Section 6: Tips */}
          <section className="production-section bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h4 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
              <Wrench size={18} />
              Assembly Tips
            </h4>
            <ul className="text-sm text-amber-700 space-y-2">
              <li>• <strong>Before starting:</strong> Lay out all panels and verify dimensions against this list</li>
              <li>• <strong>Cutting:</strong> Allow 3mm for blade kerf, cut larger pieces first</li>
              <li>• <strong>Assembly:</strong> Work on a flat surface, use clamps to hold panels while securing</li>
              <li>• <strong>Squareness:</strong> Check diagonals are equal before final fastening</li>
              <li>• <strong>Back panel:</strong> Always attach last—it squares up the entire unit</li>
            </ul>
          </section>

        </div>
      </div>
    </div>
  );
}

// Panel Shapes sub-component - groups similar panels together
function PanelShapesSection({ 
  panels, 
  settings, 
  panelLetters 
}: { 
  panels: Panel[]; 
  settings: { thickness: number; furnitureDepth?: number }; 
  panelLetters: Map<string, string>;
}) {
  type GroupedPanel = {
    key: string;
    letters: string[];
    length: number;
    width: number;
    count: number;
    isVertical: boolean;
    isBack: boolean;
  };

  // Build panel data and group by dimensions + orientation
  const grouped = new Map<string, GroupedPanel>();
  
  panels.forEach((p) => {
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
    const letter = panelLetters.get(p.id) || "?";
    
    // Group key based on dimensions and orientation
    const key = `${length}x${width}x${orientation}`;
    
    const existing = grouped.get(key);
    if (existing) {
      existing.count += p.quantity || 1;
      existing.letters.push(letter);
    } else {
      grouped.set(key, {
        key,
        letters: [letter],
        length,
        width,
        count: p.quantity || 1,
        isVertical: orientation === "vertical",
        isBack: orientation === "back",
      });
    }
  });

  const groupedList = Array.from(grouped.values());
  
  // Sort letters within each group
  groupedList.forEach(g => g.letters.sort());
  
  // Sort groups by first letter
  groupedList.sort((a, b) => a.letters[0].localeCompare(b.letters[0]));

  const verticalPanels = groupedList.filter((p) => p.isVertical);
  const horizontalPanels = groupedList.filter((p) => !p.isVertical && !p.isBack);
  const backPanels = groupedList.filter((p) => p.isBack);

  let maxDim = 0;
  groupedList.forEach(({ length }) => {
    if (length > maxDim) maxDim = length;
  });

  const renderPanel = (panel: GroupedPanel) => {
    const { key, letters, length, width, count, isVertical } = panel;
    const maxSize = 80;
    const scale = maxSize / maxDim;
    const t = 2;
    
    // Format letters: "A" or "A,B" or "A-C" for consecutive
    const letterDisplay = letters.length === 1 
      ? letters[0] 
      : letters.length <= 3 
        ? letters.join(",")
        : `${letters[0]}-${letters[letters.length - 1]}`;

    // Quantity label text
    const qtyLabel = count > 1 ? `${count}×` : "";

    if (isVertical) {
      const h = length * scale;
      const w = Math.max(width * scale, 12);
      const leftMargin = 30;
      const topMargin = 22;
      const bottomMargin = 28; // Extra space for quantity label
      const rightMargin = 6;
      const svgW = leftMargin + w + t + rightMargin;
      const svgH = topMargin + h + t + bottomMargin;

      return (
        <div key={key} className="flex flex-col items-center">
          <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
            {/* Letter badge */}
            <rect x={leftMargin + w / 2 - 14} y={2} width={28} height={16} rx={4} fill="#1e40af" />
            <text x={leftMargin + w / 2} y={13} fontSize={9} fill="white" textAnchor="middle" fontWeight={700}>
              {letterDisplay}
            </text>
            
            {/* 3D panel shape */}
            <polygon
              points={`${leftMargin},${topMargin + t} ${leftMargin + t},${topMargin} ${leftMargin + w + t},${topMargin} ${leftMargin + w},${topMargin + t}`}
              fill="#e8e8e8" stroke="#333" strokeWidth={0.5}
            />
            <polygon
              points={`${leftMargin + w},${topMargin + t} ${leftMargin + w + t},${topMargin} ${leftMargin + w + t},${topMargin + h} ${leftMargin + w},${topMargin + h + t}`}
              fill="#d8d8d8" stroke="#333" strokeWidth={0.5}
            />
            <rect x={leftMargin} y={topMargin + t} width={w} height={h} fill="#f5f5f5" stroke="#333" strokeWidth={0.75} />
            
            {/* Dimensions */}
            <text x={leftMargin - 4} y={topMargin + t + h / 2} fontSize={8} fill="#333" textAnchor="end" dominantBaseline="middle">
              {length}
            </text>
            <text x={leftMargin + w / 2} y={topMargin + t + h + 12} fontSize={8} fill="#333" textAnchor="middle">
              {width}
            </text>
            
            {/* Quantity label below dimensions */}
            {qtyLabel && (
              <text x={leftMargin + w / 2} y={topMargin + t + h + 24} fontSize={10} fill="#333" textAnchor="middle" fontWeight={600}>
                {qtyLabel}
              </text>
            )}
          </svg>
        </div>
      );
    } else {
      const w = length * scale;
      const h = Math.max(width * scale, 10);
      const leftMargin = 22;
      const topMargin = 22;
      const bottomMargin = 28; // Extra space for quantity label
      const rightMargin = 6;
      const svgW = leftMargin + w + t + rightMargin;
      const svgH = topMargin + h + t + bottomMargin;

      return (
        <div key={key} className="flex flex-col items-center">
          <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
            {/* Letter badge */}
            <rect x={leftMargin + w / 2 - 14} y={2} width={28} height={16} rx={4} fill="#1e40af" />
            <text x={leftMargin + w / 2} y={13} fontSize={9} fill="white" textAnchor="middle" fontWeight={700}>
              {letterDisplay}
            </text>
            
            {/* 3D panel shape */}
            <polygon
              points={`${leftMargin},${topMargin + t} ${leftMargin + t},${topMargin} ${leftMargin + w + t},${topMargin} ${leftMargin + w},${topMargin + t}`}
              fill="#e8e8e8" stroke="#333" strokeWidth={0.5}
            />
            <polygon
              points={`${leftMargin + w},${topMargin + t} ${leftMargin + w + t},${topMargin} ${leftMargin + w + t},${topMargin + h} ${leftMargin + w},${topMargin + h + t}`}
              fill="#d8d8d8" stroke="#333" strokeWidth={0.5}
            />
            <rect x={leftMargin} y={topMargin + t} width={w} height={h} fill="#f5f5f5" stroke="#333" strokeWidth={0.75} />
            
            {/* Dimensions */}
            <text x={leftMargin - 4} y={topMargin + t + h / 2} fontSize={8} fill="#333" textAnchor="end" dominantBaseline="middle">
              {width}
            </text>
            <text x={leftMargin + w / 2} y={topMargin + t + h + 10} fontSize={8} fill="#333" textAnchor="middle">
              {length}
            </text>
            
            {/* Quantity label below dimensions */}
            {qtyLabel && (
              <text x={leftMargin + w / 2} y={topMargin + t + h + 22} fontSize={10} fill="#333" textAnchor="middle" fontWeight={600}>
                {qtyLabel}
              </text>
            )}
          </svg>
        </div>
      );
    }
  };

  return (
    <div className="space-y-4">
      {verticalPanels.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Vertical (Sides & Dividers)</div>
          <div className="flex flex-wrap gap-3 items-end">{verticalPanels.map(renderPanel)}</div>
        </div>
      )}
      {horizontalPanels.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Horizontal (Shelves)</div>
          <div className="flex flex-wrap gap-3 items-end">{horizontalPanels.map(renderPanel)}</div>
        </div>
      )}
      {backPanels.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Back Panels</div>
          <div className="flex flex-wrap gap-3 items-end">{backPanels.map(renderPanel)}</div>
        </div>
      )}
    </div>
  );
}
