import { Printer, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { calculateGroupedCutList, optimizeCuts } from "../lib/optimizer";
import { useDesignStore } from "../stores/designStore";
import CuttingDiagram from "./CuttingDiagram";

interface PrintBookletProps {
  onClose: () => void;
}

export default function PrintBooklet({ onClose }: PrintBookletProps) {
  const { panels, settings } = useDesignStore();
  const contentRef = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  // Calculate cut list and optimization
  const { groupedPieces, dimensionToLetter } = useMemo(() => {
    return calculateGroupedCutList(
      panels,
      settings.thickness,
      settings.furnitureDepth || 400
    );
  }, [panels, settings.thickness, settings.furnitureDepth]);

  const optimizationResult = useMemo(() => {
    return optimizeCuts(
      panels,
      settings.sheetWidth,
      settings.sheetHeight,
      settings.furnitureDepth || 400,
      dimensionToLetter
    );
  }, [panels, settings, dimensionToLetter]);

  // Calculate cost estimate
  const costEstimate = useMemo(() => {
    const sheetPrice = settings.sheetPrice || 0;
    const edgeBandingPrice = settings.edgeBandingPrice || 0;
    const currency = settings.currency || "$";
    const totalSheets = optimizationResult.totalSheets;
    const sheetCost = totalSheets * sheetPrice;

    // Calculate edge banding length
    let edgeBandingLength = 0;
    panels.forEach((panel) => {
      if (!panel.edgeBanding) return;
      const qty = panel.quantity || 1;
      const orientation = panel.orientation || "horizontal";
      const depth = panel.depth || settings.furnitureDepth || 400;

      let panelLength: number, panelWidth: number;
      if (orientation === "horizontal") {
        panelLength = panel.width;
        panelWidth = depth;
      } else if (orientation === "vertical") {
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
      sheetCost,
      edgeBandingMeters,
      edgeBandingCost,
      totalCost,
      currency,
      wastePercent: optimizationResult.totalWaste,
    };
  }, [panels, settings, optimizationResult]);

  // Handle print
  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 100);
  };

  // Add/remove print class on body
  useEffect(() => {
    document.body.classList.add("print-booklet-open");
    return () => {
      document.body.classList.remove("print-booklet-open");
    };
  }, []);

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const totalPanels = panels.reduce((sum, p) => sum + (p.quantity || 1), 0);

  return (
    <div className="fixed inset-0 z-50 bg-gray-100 dark:bg-slate-900 overflow-auto print:bg-white">
      {/* Header - hidden when printing */}
      <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-600 dark:text-gray-300" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            Print Preview
          </h1>
        </div>
        <button
          onClick={handlePrint}
          disabled={isPrinting}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <Printer size={18} />
          {isPrinting ? "Preparing..." : "Print Booklet"}
        </button>
      </div>

      {/* Printable Content */}
      <div
        ref={contentRef}
        className="max-w-4xl mx-auto p-8 print:p-0 print:max-w-none"
      >
        {/* Cover Page */}
        <div className="bg-white rounded-lg shadow-sm p-8 mb-6 print:shadow-none print:rounded-none print:mb-0 print:min-h-[100vh] print:flex print:flex-col print:justify-center cover-page">
          <div className="text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              {settings.projectName || "Furniture Project"}
            </h1>
            <p className="text-lg text-gray-500 mb-8">Production Documents</p>

            <div className="inline-flex items-center gap-6 text-sm text-gray-600 border-t border-b border-gray-200 py-4 px-8">
              <div>
                <span className="font-semibold text-gray-900">{totalPanels}</span> Panels
              </div>
              <div className="w-px h-4 bg-gray-300"></div>
              <div>
                <span className="font-semibold text-gray-900">{costEstimate.totalSheets}</span> Sheets
              </div>
              <div className="w-px h-4 bg-gray-300"></div>
              <div>
                <span className="font-semibold text-gray-900">{100 - costEstimate.wastePercent}%</span> Efficiency
              </div>
            </div>

            <p className="text-sm text-gray-400 mt-8">{today}</p>
          </div>
        </div>

        <div className="page-break"></div>

        {/* Parts List */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6 print:shadow-none print:rounded-none print:mb-0 page-break-inside-avoid">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 text-sm font-bold">1</span>
            Parts List
          </h2>
          
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-2 font-semibold text-gray-700">ID</th>
                <th className="text-left py-2 font-semibold text-gray-700">Name</th>
                <th className="text-right py-2 font-semibold text-gray-700">Dimensions</th>
                <th className="text-center py-2 font-semibold text-gray-700">Qty</th>
                <th className="text-left py-2 font-semibold text-gray-700">Type</th>
                <th className="text-left py-2 font-semibold text-gray-700">Edge Band</th>
              </tr>
            </thead>
            <tbody>
              {groupedPieces.map((piece) => {
                const panel = panels.find((p) => p.id === piece.sourceId);
                const edgeBanding = panel?.edgeBanding;
                const edges = [];
                if (edgeBanding?.top) edges.push("T");
                if (edgeBanding?.bottom) edges.push("B");
                if (edgeBanding?.left) edges.push("L");
                if (edgeBanding?.right) edges.push("R");

                return (
                  <tr key={piece.letter} className="border-b border-gray-100">
                    <td className="py-2">
                      <span className="inline-flex items-center justify-center w-7 h-7 bg-slate-800 text-white text-xs font-bold rounded">
                        {piece.letter}
                      </span>
                    </td>
                    <td className="py-2 text-gray-900">{piece.label}</td>
                    <td className="py-2 text-right font-mono text-gray-700">
                      {piece.width} × {piece.height} mm
                    </td>
                    <td className="py-2 text-center font-semibold text-gray-900">
                      {piece.quantity}
                    </td>
                    <td className="py-2 text-gray-600 capitalize">
                      {panel?.orientation || "horizontal"}
                    </td>
                    <td className="py-2 text-gray-600">
                      {edges.length > 0 ? edges.join(", ") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between text-sm text-gray-600">
            <span>Material thickness: {settings.thickness}mm</span>
            <span>Total unique parts: {groupedPieces.length}</span>
          </div>
        </div>

        <div className="page-break"></div>

        {/* Cutting Diagrams */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6 print:shadow-none print:rounded-none print:mb-0">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 text-sm font-bold">2</span>
            Cutting Diagrams
          </h2>
          
          <div className="text-sm text-gray-600 mb-4">
            Sheet size: {settings.sheetWidth} × {settings.sheetHeight} mm
          </div>

          <CuttingDiagram />
        </div>

        <div className="page-break"></div>

        {/* Cost Summary */}
        {(settings.sheetPrice || settings.edgeBandingPrice) && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6 print:shadow-none print:rounded-none print:mb-0 page-break-inside-avoid">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 text-sm font-bold">3</span>
              Cost Estimate
            </h2>

            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">
                  Sheets ({costEstimate.totalSheets} × {costEstimate.currency}
                  {settings.sheetPrice})
                </span>
                <span className="font-semibold text-gray-900">
                  {costEstimate.currency}
                  {costEstimate.sheetCost.toFixed(2)}
                </span>
              </div>
              
              {settings.edgeBandingPrice && costEstimate.edgeBandingMeters > 0 && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">
                    Edge Banding ({costEstimate.edgeBandingMeters.toFixed(1)}m × {costEstimate.currency}
                    {settings.edgeBandingPrice})
                  </span>
                  <span className="font-semibold text-gray-900">
                    {costEstimate.currency}
                    {costEstimate.edgeBandingCost.toFixed(2)}
                  </span>
                </div>
              )}

              <div className="flex justify-between py-3 border-t-2 border-gray-200">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="font-bold text-xl text-blue-600">
                  {costEstimate.currency}
                  {costEstimate.totalCost.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="mt-4 p-3 bg-amber-50 rounded-lg text-sm text-amber-800">
              <strong>Note:</strong> This is an estimate. Actual costs may vary based on supplier pricing and waste factors.
            </div>
          </div>
        )}

        {/* Notes Section */}
        <div className="bg-white rounded-lg shadow-sm p-6 print:shadow-none print:rounded-none page-break-inside-avoid">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 text-sm font-bold">
              {settings.sheetPrice || settings.edgeBandingPrice ? "4" : "3"}
            </span>
            Notes
          </h2>

          <div className="space-y-4 text-sm text-gray-600">
            <div className="p-3 bg-gray-50 rounded-lg">
              <strong className="text-gray-900">Cutting Tips:</strong>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Allow 3mm kerf (blade width) between cuts</li>
                <li>Cut larger pieces first to maximize material usage</li>
                <li>Label each piece with its letter immediately after cutting</li>
                <li>Check grain direction before cutting (marked with ═══ or ║)</li>
              </ul>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg">
              <strong className="text-gray-900">Legend:</strong>
              <ul className="mt-2 space-y-1">
                <li><strong>T/B/L/R</strong> = Top/Bottom/Left/Right edge banding</li>
                <li><strong>↻</strong> = Panel rotated 90° on cutting diagram</li>
                <li><strong>═══</strong> = Horizontal grain direction</li>
                <li><strong>║</strong> = Vertical grain direction</li>
              </ul>
            </div>

            <div className="border-t border-gray-200 pt-4 mt-4">
              <p className="text-xs text-gray-400">
                Generated with CraftCut • {today}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
