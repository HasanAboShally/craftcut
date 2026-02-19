import { Printer, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { calculateGroupedCutList, optimizeCuts } from "../lib/optimizer";
import { useDesignStore } from "../stores/designStore";
import CuttingDiagram from "./CuttingDiagram";

interface PrintBookletProps {
  onClose: () => void;
}

/**
 * Self-contained print CSS — used inside an iframe so it's completely
 * isolated from the app's dark-mode / Tailwind styles.
 */
const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
*, *::before, *::after { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; background: #fff; color: #1e293b;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.cover { min-height: 97vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; page-break-after: always; break-after: page; }
.cover h1 { font-size: 2.5rem; font-weight: 700; margin: 0 0 .25rem; }
.cover .subtitle { font-size: 1.1rem; color: #64748b; margin-bottom: 2rem; }
.cover .stats { display: inline-flex; gap: 1.5rem; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: .75rem 2rem; font-size: .875rem; color: #475569; }
.cover .stats b { color: #1e293b; }
.cover .date { font-size: .8rem; color: #94a3b8; margin-top: 2rem; }
.cover .icon { width: 64px; height: 64px; background: #dbeafe; border-radius: 1rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; }
.cover .icon svg { width: 32px; height: 32px; color: #2563eb; }
.page-break { page-break-after: always; break-after: page; height: 0; visibility: hidden; }
.section { margin-bottom: 2rem; page-break-inside: avoid; break-inside: avoid; }
.section-title { font-size: 1.25rem; font-weight: 700; margin: 0 0 1rem; display: flex; align-items: center; gap: .5rem; }
.section-num { width: 28px; height: 28px; background: #dbeafe; color: #2563eb; border-radius: .4rem; display: inline-flex; align-items: center; justify-content: center; font-size: .8rem; font-weight: 700; }
table { width: 100%; border-collapse: collapse; font-size: .85rem; }
th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
th { background: #f1f5f9; font-weight: 600; color: #334155; }
td { color: #1e293b; }
.text-right { text-align: right; }
.text-center { text-align: center; }
.mono { font-family: ui-monospace, monospace; }
.badge { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; background: #1e293b; color: #fff; font-size: .7rem; font-weight: 700; border-radius: 4px; }
.footer-row { display: flex; justify-content: space-between; font-size: .8rem; color: #475569; margin-top: 1rem; padding-top: .75rem; border-top: 1px solid #e2e8f0; }
.diagram-container svg { max-width: 100%; height: auto; }
.cost-row { display: flex; justify-content: space-between; padding: .6rem 0; border-bottom: 1px solid #f1f5f9; font-size: .9rem; }
.cost-row .label { color: #475569; }
.cost-row .value { font-weight: 600; color: #1e293b; }
.cost-total { display: flex; justify-content: space-between; padding: .75rem 0; border-top: 2px solid #e2e8f0; margin-top: .25rem; }
.cost-total .value { font-size: 1.25rem; font-weight: 700; color: #2563eb; }
.note-box { background: #f8fafc; border-radius: .5rem; padding: .75rem 1rem; font-size: .85rem; color: #475569; margin-bottom: .75rem; }
.note-box strong { color: #1e293b; }
.note-box ul { margin: .4rem 0 0 1.2rem; padding: 0; }
.note-box li { margin-bottom: .2rem; }
.warning-box { background: #fffbeb; border-radius: .5rem; padding: .75rem 1rem; font-size: .85rem; color: #92400e; }
.warning-box strong { color: #78350f; }
.generated { font-size: .7rem; color: #94a3b8; margin-top: 1.5rem; padding-top: .75rem; border-top: 1px solid #e2e8f0; }
`;

export default function PrintBooklet({ onClose }: PrintBookletProps) {
  const { panels, settings } = useDesignStore();
  const contentRef = useRef<HTMLDivElement>(null);
  const diagramRef = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  // Calculate cut list and optimization
  const { dimensionToLetter } = useMemo(() => {
    return calculateGroupedCutList(
      panels,
      settings.thickness,
      settings.furnitureDepth || 400,
    );
  }, [panels, settings.thickness, settings.furnitureDepth]);

  // Enrich each panel with its assigned cut-list letter (A, B, C…)
  const groupedPieces = useMemo(() => {
    return panels.map((panel) => {
      const orientation = panel.orientation || "horizontal";
      const depth = panel.depth || settings.furnitureDepth || 400;
      let length: number, width: number;
      if (orientation === "horizontal") { length = panel.width; width = depth; }
      else if (orientation === "vertical") { length = panel.height; width = depth; }
      else { length = panel.width; width = panel.height; }
      if (width > length) { [length, width] = [width, length]; }
      const letter = dimensionToLetter.get(`${length}x${width}`) ?? "?";
      return {
        sourceId: panel.id,
        label: panel.label,
        letter,
        width: panel.width,
        height: panel.height,
        quantity: panel.quantity,
      };
    });
  }, [panels, dimensionToLetter, settings.furnitureDepth]);

  const optimizationResult = useMemo(() => {
    return optimizeCuts(
      panels,
      settings.sheetWidth,
      settings.sheetHeight,
      settings.furnitureDepth || 400,
      dimensionToLetter,
    );
  }, [panels, settings, dimensionToLetter]);

  // Calculate cost estimate
  const costEstimate = useMemo(() => {
    const sheetPrice = settings.sheetPrice || 0;
    const edgeBandingPrice = settings.edgeBandingPrice || 0;
    const currency = settings.currency || "$";
    const totalSheets = optimizationResult.totalSheets;
    const sheetCost = totalSheets * sheetPrice;

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

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const totalPanels = panels.reduce((sum, p) => sum + (p.quantity || 1), 0);

  // ─── iframe-based printing ───────────────────────────────────────
  const handlePrint = () => {
    setIsPrinting(true);

    // Grab the rendered SVGs from the CuttingDiagram component
    const diagramHTML = diagramRef.current?.innerHTML ?? "";

    // Build parts-list table rows
    const partsRows = groupedPieces
      .map((piece) => {
        const panel = panels.find((p) => p.id === piece.sourceId);
        const eb = panel?.edgeBanding;
        const edges: string[] = [];
        if (eb?.top) edges.push("T");
        if (eb?.bottom) edges.push("B");
        if (eb?.left) edges.push("L");
        if (eb?.right) edges.push("R");

        return `<tr>
        <td><span class="badge">${piece.letter}</span></td>
        <td>${piece.label}</td>
        <td class="text-right mono">${piece.width} × ${piece.height} mm</td>
        <td class="text-center" style="font-weight:600">${piece.quantity}</td>
        <td style="text-transform:capitalize">${panel?.orientation || "horizontal"}</td>
        <td>${edges.length ? edges.join(", ") : "—"}</td>
      </tr>`;
      })
      .join("\n");

    // Build cost section
    let costHTML = "";
    if (settings.sheetPrice || settings.edgeBandingPrice) {
      costHTML = `
        <div class="page-break"></div>
        <div class="section">
          <div class="section-title"><span class="section-num">3</span> Cost Estimate</div>
          <div class="cost-row"><span class="label">Sheets (${costEstimate.totalSheets} × ${costEstimate.currency}${settings.sheetPrice})</span><span class="value">${costEstimate.currency}${costEstimate.sheetCost.toFixed(2)}</span></div>
          ${settings.edgeBandingPrice && costEstimate.edgeBandingMeters > 0 ? `<div class="cost-row"><span class="label">Edge Banding (${costEstimate.edgeBandingMeters.toFixed(1)}m × ${costEstimate.currency}${settings.edgeBandingPrice})</span><span class="value">${costEstimate.currency}${costEstimate.edgeBandingCost.toFixed(2)}</span></div>` : ""}
          <div class="cost-total"><span style="font-weight:600">Total</span><span class="value">${costEstimate.currency}${costEstimate.totalCost.toFixed(2)}</span></div>
          <div class="warning-box" style="margin-top:1rem"><strong>Note:</strong> This is an estimate. Actual costs may vary based on supplier pricing and waste factors.</div>
        </div>`;
    }

    const notesNum =
      settings.sheetPrice || settings.edgeBandingPrice ? "4" : "3";

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${settings.projectName || "Project"} – Print</title><style>${PRINT_CSS}</style></head><body>

      <div class="cover">
        <div class="icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg></div>
        <h1>${settings.projectName || "Furniture Project"}</h1>
        <div class="subtitle">Production Documents</div>
        <div class="stats"><div><b>${totalPanels}</b> Panels</div><div><b>${costEstimate.totalSheets}</b> Sheets</div><div><b>${100 - costEstimate.wastePercent}%</b> Efficiency</div></div>
        <div class="date">${today}</div>
      </div>

      <div class="section">
        <div class="section-title"><span class="section-num">1</span> Parts List</div>
        <table><thead><tr><th>ID</th><th>Name</th><th class="text-right">Dimensions</th><th class="text-center">Qty</th><th>Type</th><th>Edge Band</th></tr></thead><tbody>${partsRows}</tbody></table>
        <div class="footer-row"><span>Material thickness: ${settings.thickness}mm</span><span>Total unique parts: ${groupedPieces.length}</span></div>
      </div>

      <div class="page-break"></div>

      <div class="section">
        <div class="section-title"><span class="section-num">2</span> Cutting Diagrams</div>
        <div style="font-size:.85rem;color:#475569;margin-bottom:.75rem">Sheet size: ${settings.sheetWidth} × ${settings.sheetHeight} mm</div>
        <div class="diagram-container">${diagramHTML}</div>
      </div>

      ${costHTML}

      <div class="page-break"></div>

      <div class="section">
        <div class="section-title"><span class="section-num">${notesNum}</span> Notes</div>
        <div class="note-box"><strong>Cutting Tips:</strong><ul><li>Allow 3mm kerf (blade width) between cuts</li><li>Cut larger pieces first to maximize material usage</li><li>Label each piece with its letter immediately after cutting</li><li>Check grain direction before cutting</li></ul></div>
        <div class="note-box"><strong>Legend:</strong><ul><li><b>T/B/L/R</b> = Top/Bottom/Left/Right edge banding</li><li><b>↻</b> = Panel rotated 90° on cutting diagram</li></ul></div>
        <div class="generated">Generated with CraftCut • ${today}</div>
      </div>

    </body></html>`;

    // Create hidden iframe, print from it, then clean up
    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;";
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      document.body.removeChild(iframe);
      setIsPrinting(false);
      return;
    }

    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    // Wait for the iframe content to fully load, then trigger print
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        // Clean up after a short delay
        setTimeout(() => {
          document.body.removeChild(iframe);
          setIsPrinting(false);
        }, 500);
      }, 250);
    };

    // Fallback in case onload doesn't fire
    setTimeout(() => {
      try {
        if (document.body.contains(iframe)) {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            if (document.body.contains(iframe))
              document.body.removeChild(iframe);
            setIsPrinting(false);
          }, 500);
        }
      } catch {
        setIsPrinting(false);
      }
    }, 2000);
  };

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-gray-100 dark:bg-slate-900 overflow-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
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
        <div className="bg-white rounded-lg shadow-sm p-8 mb-6 print:shadow-none print:rounded-none print:mb-0 print:min-h-screen print:flex print:flex-col print:justify-center cover-page">
          <div className="text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-10 h-10 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              {settings.projectName || "Furniture Project"}
            </h1>
            <p className="text-lg text-gray-500 mb-8">Production Documents</p>

            <div className="inline-flex items-center gap-6 text-sm text-gray-600 border-t border-b border-gray-200 py-4 px-8">
              <div>
                <span className="font-semibold text-gray-900">
                  {totalPanels}
                </span>{" "}
                Panels
              </div>
              <div className="w-px h-4 bg-gray-300"></div>
              <div>
                <span className="font-semibold text-gray-900">
                  {costEstimate.totalSheets}
                </span>{" "}
                Sheets
              </div>
              <div className="w-px h-4 bg-gray-300"></div>
              <div>
                <span className="font-semibold text-gray-900">
                  {100 - costEstimate.wastePercent}%
                </span>{" "}
                Efficiency
              </div>
            </div>

            <p className="text-sm text-gray-400 mt-8">{today}</p>
          </div>
        </div>

        <div className="page-break"></div>

        {/* Parts List */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6 print:shadow-none print:rounded-none print:mb-0 page-break-inside-avoid">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 text-sm font-bold">
              1
            </span>
            Parts List
          </h2>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-2 font-semibold text-gray-700">
                  ID
                </th>
                <th className="text-left py-2 font-semibold text-gray-700">
                  Name
                </th>
                <th className="text-right py-2 font-semibold text-gray-700">
                  Dimensions
                </th>
                <th className="text-center py-2 font-semibold text-gray-700">
                  Qty
                </th>
                <th className="text-left py-2 font-semibold text-gray-700">
                  Type
                </th>
                <th className="text-left py-2 font-semibold text-gray-700">
                  Edge Band
                </th>
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
            <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 text-sm font-bold">
              2
            </span>
            Cutting Diagrams
          </h2>

          <div className="text-sm text-gray-600 mb-4">
            Sheet size: {settings.sheetWidth} × {settings.sheetHeight} mm
          </div>

          <div ref={diagramRef}>
            <CuttingDiagram />
          </div>
        </div>

        <div className="page-break"></div>

        {/* Cost Summary */}
        {(settings.sheetPrice || settings.edgeBandingPrice) && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6 print:shadow-none print:rounded-none print:mb-0 page-break-inside-avoid">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 text-sm font-bold">
                3
              </span>
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

              {settings.edgeBandingPrice &&
                costEstimate.edgeBandingMeters > 0 && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-600">
                      Edge Banding ({costEstimate.edgeBandingMeters.toFixed(1)}m
                      × {costEstimate.currency}
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
              <strong>Note:</strong> This is an estimate. Actual costs may vary
              based on supplier pricing and waste factors.
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
                <li>
                  Label each piece with its letter immediately after cutting
                </li>
                <li>
                  Check grain direction before cutting (marked with ═══ or ║)
                </li>
              </ul>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg">
              <strong className="text-gray-900">Legend:</strong>
              <ul className="mt-2 space-y-1">
                <li>
                  <strong>T/B/L/R</strong> = Top/Bottom/Left/Right edge banding
                </li>
                <li>
                  <strong>↻</strong> = Panel rotated 90° on cutting diagram
                </li>
                <li>
                  <strong>═══</strong> = Horizontal grain direction
                </li>
                <li>
                  <strong>║</strong> = Vertical grain direction
                </li>
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
