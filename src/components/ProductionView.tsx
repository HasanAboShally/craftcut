import {
  Download,
  FileText,
  Printer,
  Package,
  Wrench,
  FileDown,
  DollarSign,
  Loader2,
} from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import { generateAssemblySteps, getAssemblySummary } from "../lib/assembly";
import { calculateGroupedCutList, optimizeCuts } from "../lib/optimizer";
import { exportToPDF } from "../lib/pdf";
import { useDesignStore } from "../stores/designStore";
import type { Panel } from "../types";
import AssemblyIllustration from "./AssemblyIllustration";
import CuttingDiagram from "./CuttingDiagram";
import Print3DImage from "./Print3DImage";

// Self-contained print CSS for the iframe document
const IFRAME_PRINT_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100%; height: auto; overflow: visible;
    background: white; color: #111827;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px; line-height: 1.5;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .no-print { display: none !important; }
  .production-content { max-width: 100%; padding: 16px; }
  .production-content > * { break-inside: avoid; page-break-inside: avoid; }
  .production-section {
    border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;
    margin-bottom: 20px; break-inside: avoid; page-break-inside: avoid;
    background: white;
  }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 12px; text-align: left; border-bottom: 1px solid #f3f4f6; }
  th { background: #f3f4f6; font-weight: 600; }
  svg { max-width: 100%; height: auto; }
  img { max-width: 100%; height: auto; object-fit: contain; }

  /* Utility classes used in the content */
  .flex { display: flex; }
  .flex-col { flex-direction: column; }
  .flex-1 { flex: 1; }
  .flex-wrap { flex-wrap: wrap; }
  .flex-shrink-0 { flex-shrink: 0; }
  .items-center { align-items: center; }
  .items-end { align-items: flex-end; }
  .justify-center { justify-content: center; }
  .justify-between { justify-content: space-between; }
  .gap-2 { gap: 0.5rem; }
  .gap-3 { gap: 0.75rem; }
  .gap-4 { gap: 1rem; }
  .gap-6 { gap: 1.5rem; }
  .grid { display: grid; }
  .grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
  .grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
  .space-y-2 > * + * { margin-top: 0.5rem; }
  .space-y-4 > * + * { margin-top: 1rem; }
  .space-y-6 > * + * { margin-top: 1.5rem; }
  .space-y-8 > * + * { margin-top: 2rem; }
  .w-full { width: 100%; }
  .w-6 { width: 1.5rem; }
  .w-7 { width: 1.75rem; }
  .w-8 { width: 2rem; }
  .w-10 { width: 2.5rem; }
  .w-16 { width: 4rem; }
  .w-40 { width: 10rem; }
  .h-6 { height: 1.5rem; }
  .h-7 { height: 1.75rem; }
  .h-8 { height: 2rem; }
  .h-10 { height: 2.5rem; }
  .h-16 { height: 4rem; }
  .h-40 { height: 10rem; }
  .p-2 { padding: 0.5rem; }
  .p-3 { padding: 0.75rem; }
  .p-4 { padding: 1rem; }
  .p-6 { padding: 1.5rem; }
  .px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
  .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
  .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
  .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
  .pt-2 { padding-top: 0.5rem; }
  .pt-4 { padding-top: 1rem; }
  .mb-1 { margin-bottom: 0.25rem; }
  .mb-2 { margin-bottom: 0.5rem; }
  .mb-3 { margin-bottom: 0.75rem; }
  .mb-4 { margin-bottom: 1rem; }
  .mt-1 { margin-top: 0.25rem; }
  .mt-2 { margin-top: 0.5rem; }
  .mt-3 { margin-top: 0.75rem; }
  .mx-auto { margin-left: auto; margin-right: auto; }
  .text-xs { font-size: 0.75rem; line-height: 1rem; }
  .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
  .text-lg { font-size: 1.125rem; line-height: 1.75rem; }
  .text-xl { font-size: 1.25rem; line-height: 1.75rem; }
  .text-2xl { font-size: 1.5rem; line-height: 2rem; }
  .font-medium { font-weight: 500; }
  .font-semibold { font-weight: 600; }
  .font-bold { font-weight: 700; }
  .font-mono { font-family: ui-monospace, SFMono-Regular, monospace; }
  .text-center { text-align: center; }
  .text-right { text-align: right; }
  .uppercase { text-transform: uppercase; }
  .tracking-wide { letter-spacing: 0.025em; }
  .rounded { border-radius: 0.25rem; }
  .rounded-lg { border-radius: 0.5rem; }
  .rounded-full { border-radius: 9999px; }
  .border { border-width: 1px; border-style: solid; }
  .border-b { border-bottom-width: 1px; border-bottom-style: solid; }
  .border-t { border-top-width: 1px; border-top-style: solid; }
  .border-gray-100 { border-color: #f3f4f6; }
  .border-gray-200 { border-color: #e5e7eb; }
  .border-green-100 { border-color: #dcfce7; }
  .border-green-200 { border-color: #bbf7d0; }
  .border-amber-200 { border-color: #fde68a; }
  .overflow-hidden { overflow: hidden; }
  .inline-flex { display: inline-flex; }
  .aspect-square { aspect-ratio: 1/1; }
  .bg-white { background-color: white; }
  .bg-gray-50 { background-color: #f9fafb; }
  .bg-gray-100 { background-color: #f3f4f6; }
  .bg-gray-200 { background-color: #e5e7eb; }
  .bg-gray-900 { background-color: #111827; }
  .bg-blue-50 { background-color: #eff6ff; }
  .bg-blue-600 { background-color: #2563eb; }
  .bg-green-600 { background-color: #16a34a; }
  .bg-amber-50 { background-color: #fffbeb; }
  .bg-amber-100 { background-color: #fef3c7; }
  .text-white { color: white; }
  .text-gray-500 { color: #6b7280; }
  .text-gray-600 { color: #4b5563; }
  .text-gray-700 { color: #374151; }
  .text-gray-800 { color: #1f2937; }
  .text-gray-900 { color: #111827; }
  .text-blue-400 { color: #60a5fa; }
  .text-blue-600 { color: #2563eb; }
  .text-green-600 { color: #16a34a; }
  .text-amber-700 { color: #b45309; }
  .text-amber-800 { color: #92400e; }
  .from-green-50 { /* gradient handled inline */ }
  .bg-gradient-to-r.from-green-50.to-emerald-50 { background: linear-gradient(to right, #f0fdf4, #ecfdf5); }
  .page-break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }

  @media print {
    body { margin: 0; padding: 0; }
    .production-section { box-shadow: none; }
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
  const [isExportingPDF, setIsExportingPDF] = useState(false);

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
    if (!contentRef.current) return;

    // Clone the content so we don't mutate the live DOM
    const clone = contentRef.current.cloneNode(true) as HTMLElement;
    // Remove any no-print elements from the clone
    clone.querySelectorAll('.no-print').forEach(el => el.remove());

    // Collect all SVG inline styles (canvas elements won't copy, but SVGs will)
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Print Production Documents</title>
<style>${IFRAME_PRINT_CSS}</style>
</head><body>${clone.outerHTML}</body></html>`;

    // Create a hidden iframe, write content, and print
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.top = '0';
    iframe.style.width = '210mm';
    iframe.style.height = '297mm';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      document.body.removeChild(iframe);
      return;
    }

    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    // Wait for images/SVGs to render, then print
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        // Clean up after print dialog closes
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 300);
    };
  };

  const handleExportPDF = async () => {
    if (!contentRef.current || isExportingPDF) return;
    
    setIsExportingPDF(true);
    try {
      const filename = `${settings.projectName || 'craftcut'}-production.pdf`;
      await exportToPDF(contentRef.current, filename, {
        title: settings.projectName || 'CraftCut Production Documents',
        orientation: 'portrait',
        margin: 10,
      });
    } catch (error) {
      console.error('Failed to export PDF:', error);
    } finally {
      setIsExportingPDF(false);
    }
  };

  // Calculate material cost including edge banding
  const costEstimate = useMemo(() => {
    const result = optimizeCuts(
      panels,
      settings.sheetWidth,
      settings.sheetHeight,
      settings.furnitureDepth || 400,
      dimensionToLetter
    );
    
    const sheetPrice = settings.sheetPrice || 0;
    const edgeBandingPrice = settings.edgeBandingPrice || 0;
    const currency = settings.currency || '$';
    const totalSheets = result.totalSheets;
    const sheetCost = totalSheets * sheetPrice;
    const wastePercent = result.totalWaste;
    
    // Calculate edge banding length
    let edgeBandingLength = 0; // in mm
    panels.forEach(panel => {
      if (!panel.edgeBanding) return;
      const qty = panel.quantity || 1;
      const orientation = panel.orientation || 'horizontal';
      const depth = panel.depth || settings.furnitureDepth || 400;
      
      let panelLength: number, panelWidth: number;
      if (orientation === 'horizontal') {
        panelLength = panel.width;
        panelWidth = depth;
      } else if (orientation === 'vertical') {
        panelLength = panel.height;
        panelWidth = depth;
      } else {
        panelLength = panel.width;
        panelWidth = panel.height;
      }
      
      if (panel.edgeBanding.top) edgeBandingLength += panelLength * qty;
      if (panel.edgeBanding.bottom) edgeBandingLength += panelLength * qty;
      if (panel.edgeBanding.left) edgeBandingLength += panelWidth * qty;
      if (panel.edgeBanding.right) edgeBandingLength += panelWidth * qty;
    });
    
    const edgeBandingMeters = edgeBandingLength / 1000;
    const edgeBandingCost = edgeBandingMeters * edgeBandingPrice;
    const totalCost = sheetCost + edgeBandingCost;
    
    return {
      totalSheets,
      sheetPrice,
      sheetCost,
      edgeBandingMeters,
      edgeBandingPrice,
      edgeBandingCost,
      totalCost,
      wastePercent,
      currency,
      hasPrice: sheetPrice > 0 || edgeBandingPrice > 0,
    };
  }, [panels, settings, dimensionToLetter]);

  // No style injection needed — printing uses a self-contained iframe

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
    <div className="production-print-root h-full flex flex-col bg-gray-100">
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
            title="Export cut list as CSV"
          >
            <FileText size={16} />
            CSV
          </button>
          <button
            onClick={handleExportJSON}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            title="Export project as JSON"
          >
            <Download size={16} />
            JSON
          </button>
          <button
            onClick={handleExportPDF}
            disabled={isExportingPDF}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Export as PDF"
          >
            {isExportingPDF ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileDown size={16} />
            )}
            PDF
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            title="Print production documents"
          >
            <Printer size={16} />
            Print
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto">
        <div ref={contentRef} className="production-content max-w-4xl mx-auto p-6 space-y-8">
          
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
                <div className="bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center" style={{ minHeight: 280 }}>
                  <Print3DImage
                    width={360}
                    height={280}
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
                    <div className="flex items-center justify-between text-sm mt-2">
                      <span className="text-gray-500">Sheets Required</span>
                      <span className="font-semibold">{costEstimate.totalSheets}</span>
                    </div>
                    {costEstimate.hasPrice && (
                      <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-gray-100">
                        <span className="text-gray-500">Estimated Cost</span>
                        <span className="font-bold text-green-600">
                          {costEstimate.currency}{costEstimate.totalCost.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Cost Summary - only show if price is set */}
          {costEstimate.hasPrice && (
            <section className="production-section bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200 overflow-hidden">
              <div className="p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                    <DollarSign className="text-white" size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">Material Cost Estimate</h3>
                    <p className="text-sm text-gray-500">Based on configured prices</p>
                  </div>
                </div>
                
                {/* Sheet costs */}
                {costEstimate.sheetPrice > 0 && (
                  <div className="mb-4">
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Sheet Material</div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white rounded-lg p-3 border border-green-100">
                        <div className="text-xs text-gray-500">Sheets</div>
                        <div className="text-lg font-bold text-gray-900">{costEstimate.totalSheets}</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-green-100">
                        <div className="text-xs text-gray-500">Price/Sheet</div>
                        <div className="text-lg font-bold text-gray-900">{costEstimate.currency}{costEstimate.sheetPrice}</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-green-100">
                        <div className="text-xs text-gray-500">Subtotal</div>
                        <div className="text-lg font-bold text-gray-700">{costEstimate.currency}{costEstimate.sheetCost.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Edge banding costs */}
                {costEstimate.edgeBandingMeters > 0 && costEstimate.edgeBandingPrice > 0 && (
                  <div className="mb-4">
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Edge Banding</div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white rounded-lg p-3 border border-green-100">
                        <div className="text-xs text-gray-500">Length</div>
                        <div className="text-lg font-bold text-gray-900">{costEstimate.edgeBandingMeters.toFixed(1)}m</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-green-100">
                        <div className="text-xs text-gray-500">Price/Meter</div>
                        <div className="text-lg font-bold text-gray-900">{costEstimate.currency}{costEstimate.edgeBandingPrice}</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-green-100">
                        <div className="text-xs text-gray-500">Subtotal</div>
                        <div className="text-lg font-bold text-gray-700">{costEstimate.currency}{costEstimate.edgeBandingCost.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Total */}
                <div className="bg-green-600 rounded-lg p-4 text-white">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Total Estimated Cost</span>
                    <span className="text-2xl font-bold">{costEstimate.currency}{costEstimate.totalCost.toFixed(2)}</span>
                  </div>
                </div>
                
                <p className="text-xs text-gray-500 mt-3">
                  * Material waste: {costEstimate.wastePercent}% • Configure prices in Settings sidebar
                </p>
              </div>
            </section>
          )}

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
                          💡 {step.supportHint.instruction}
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
