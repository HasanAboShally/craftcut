import type { OptimizationResult, Panel, Placement, Sheet } from "../types";

interface Piece {
  id: string;
  label: string;
  letter: string; // Assembly letter (A, B, C...)
  width: number;  // Cut width (long dimension)
  height: number; // Cut height (short dimension)
  sourceId: string;
  orientation: string;
}

interface FreeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Blade kerf - space lost to each cut (typical table saw blade)
const KERF = 3; // mm

/**
 * Get the actual cut dimensions for a panel based on its orientation.
 * - Horizontal (shelf): cut width × depth
 * - Vertical (divider): cut height × depth
 * - Back: width × height
 */
function getCutDimensions(
  panel: Panel,
  furnitureDepth: number,
): { cutWidth: number; cutHeight: number } {
  const orientation = panel.orientation || "horizontal";
  const depth = panel.depth || furnitureDepth;
  
  switch (orientation) {
    case "horizontal":
      // Shelf: width is the panel width, height is the depth
      return { cutWidth: panel.width, cutHeight: depth };
    case "vertical":
      // Divider: width is the panel height, height is the depth
      return { cutWidth: panel.height, cutHeight: depth };
    case "back":
      // Back panel: width × height as-is
      return { cutWidth: panel.width, cutHeight: panel.height };
    default:
      return { cutWidth: panel.width, cutHeight: depth };
  }
}

type SortStrategy = 'area' | 'width' | 'height' | 'perimeter' | 'maxSide';

/**
 * Sort pieces by different strategies for optimization comparison
 */
function sortPieces(pieces: Piece[], strategy: SortStrategy): Piece[] {
  const sorted = [...pieces];
  switch (strategy) {
    case 'area':
      return sorted.sort((a, b) => b.width * b.height - a.width * a.height);
    case 'width':
      return sorted.sort((a, b) => b.width - a.width || b.height - a.height);
    case 'height':
      return sorted.sort((a, b) => b.height - a.height || b.width - a.width);
    case 'perimeter':
      return sorted.sort((a, b) => (b.width + b.height) - (a.width + a.height));
    case 'maxSide':
      return sorted.sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height));
    default:
      return sorted;
  }
}

/**
 * Advanced bin-packing with multiple strategies - picks the best result
 * @param dimensionToLetter - Map from "length x width" key to letter (A, B, C...)
 */
export function optimizeCuts(
  panels: Panel[],
  sheetWidth: number,
  sheetHeight: number,
  furnitureDepth: number = 400,
  dimensionToLetter?: Map<string, string>,
): OptimizationResult {
  if (panels.length === 0) {
    return {
      sheets: [],
      totalSheets: 0,
      totalWaste: 0,
      unplacedPieces: [],
    };
  }

  // Expand panels by quantity and calculate cut dimensions
  const pieces: Piece[] = [];
  for (const panel of panels) {
    const { cutWidth, cutHeight } = getCutDimensions(panel, furnitureDepth);
    
    // Get letter based on dimensions (normalized)
    const w = Math.max(cutWidth, cutHeight);
    const h = Math.min(cutWidth, cutHeight);
    const dimKey = `${w}x${h}`;
    const letter = dimensionToLetter?.get(dimKey) || "?";
    
    for (let i = 0; i < panel.quantity; i++) {
      // Normalize so width >= height (standard convention for cuts)
      const w = Math.max(cutWidth, cutHeight);
      const h = Math.min(cutWidth, cutHeight);
      
      pieces.push({
        id: `${panel.id}_${i}`,
        label: panel.label || `Panel ${letter}`,
        letter: letter, // Same letter for all pieces of same panel type
        width: w,
        height: h,
        sourceId: panel.id,
        orientation: panel.orientation || "horizontal",
      });
    }
  }

  // Try multiple sorting strategies and pick the best result
  const strategies: SortStrategy[] = ['area', 'width', 'height', 'perimeter', 'maxSide'];
  let bestResult: OptimizationResult | null = null;
  
  for (const strategy of strategies) {
    const sortedPieces = sortPieces(pieces, strategy);
    const result = packPieces(sortedPieces, panels, sheetWidth, sheetHeight);
    
    // Compare results: fewer sheets wins, then lower waste
    if (!bestResult || 
        result.totalSheets < bestResult.totalSheets ||
        (result.totalSheets === bestResult.totalSheets && result.totalWaste < bestResult.totalWaste)) {
      bestResult = result;
    }
  }

  return bestResult!;
}

/**
 * Pack pieces into sheets using Best-Fit Decreasing with Guillotine cutting
 */
function packPieces(
  pieces: Piece[],
  panels: Panel[],
  sheetWidth: number,
  sheetHeight: number,
): OptimizationResult {
  const sheets: Sheet[] = [];
  const unplacedPieces: Panel[] = [];
  const sheetArea = sheetWidth * sheetHeight;

  for (const piece of pieces) {
    // Check if piece can fit at all (with kerf consideration)
    const canFitNormal =
      piece.width + KERF <= sheetWidth && piece.height + KERF <= sheetHeight;
    const canFitRotated =
      piece.height + KERF <= sheetWidth && piece.width + KERF <= sheetHeight;

    if (!canFitNormal && !canFitRotated) {
      // Piece is too large for any sheet
      const existing = unplacedPieces.find((p) => p.id === piece.sourceId);
      if (!existing) {
        const original = panels.find((p) => p.id === piece.sourceId);
        if (original) unplacedPieces.push(original);
      }
      continue;
    }

    // Find the best position across all existing sheets (Best-Fit)
    let bestPlacement: { sheetIndex: number; x: number; y: number; rotated: boolean; score: number } | null = null;

    for (let i = 0; i < sheets.length; i++) {
      const position = findBestPosition(sheets[i], piece, sheetWidth, sheetHeight);
      if (position) {
        // Score: lower is better (tighter fit, less wasted space)
        if (!bestPlacement || position.score < bestPlacement.score) {
          bestPlacement = { sheetIndex: i, ...position };
        }
      }
    }

    if (bestPlacement) {
      const sheet = sheets[bestPlacement.sheetIndex];
      sheet.placements.push({
        id: piece.id,
        label: piece.label,
        letter: piece.letter,
        x: bestPlacement.x,
        y: bestPlacement.y,
        width: bestPlacement.rotated ? piece.height : piece.width,
        height: bestPlacement.rotated ? piece.width : piece.height,
        rotated: bestPlacement.rotated,
        sourceId: piece.sourceId,
      });
      sheet.usedArea += piece.width * piece.height;
      sheet.wastePercent = Math.round((1 - sheet.usedArea / sheetArea) * 100);
    } else {
      // Create new sheet
      const newSheet: Sheet = {
        id: `sheet_${sheets.length + 1}`,
        placements: [],
        usedArea: 0,
        wastePercent: 100,
      };

      const rotated = !canFitNormal && canFitRotated;
      newSheet.placements.push({
        id: piece.id,
        label: piece.label,
        letter: piece.letter,
        x: 0,
        y: 0,
        width: rotated ? piece.height : piece.width,
        height: rotated ? piece.width : piece.height,
        rotated,
        sourceId: piece.sourceId,
      });
      newSheet.usedArea = piece.width * piece.height;
      newSheet.wastePercent = Math.round(
        (1 - newSheet.usedArea / sheetArea) * 100,
      );
      sheets.push(newSheet);
    }
  }

  const totalUsedArea = sheets.reduce((sum, s) => sum + s.usedArea, 0);
  const totalSheetArea = sheets.length * sheetArea;
  const totalWaste =
    totalSheetArea > 0
      ? Math.round((1 - totalUsedArea / totalSheetArea) * 100)
      : 0;

  return {
    sheets,
    totalSheets: sheets.length,
    totalWaste,
    unplacedPieces,
  };
}

/**
 * Find the best position in a sheet using Best-Fit strategy
 * Returns position with a score (lower = better fit)
 */
function findBestPosition(
  sheet: Sheet,
  piece: Piece,
  sheetWidth: number,
  sheetHeight: number,
): { x: number; y: number; rotated: boolean; score: number } | null {
  // Get free rectangles using maximal rectangles algorithm
  const freeRects = getFreeRectangles(sheet, sheetWidth, sheetHeight);
  
  let bestFit: { x: number; y: number; rotated: boolean; score: number } | null = null;

  // Try each free rectangle
  for (const rect of freeRects) {
    // Try normal orientation
    if (piece.width + KERF <= rect.width && piece.height + KERF <= rect.height) {
      // Score based on how well piece fits (Best Short Side Fit)
      const leftoverH = rect.width - piece.width;
      const leftoverV = rect.height - piece.height;
      const score = Math.min(leftoverH, leftoverV) * 1000 + Math.max(leftoverH, leftoverV) + rect.y * 0.1;
      
      if (!bestFit || score < bestFit.score) {
        bestFit = { x: rect.x, y: rect.y, rotated: false, score };
      }
    }
    
    // Try rotated orientation (only if dimensions differ)
    if (piece.width !== piece.height && 
        piece.height + KERF <= rect.width && piece.width + KERF <= rect.height) {
      const leftoverH = rect.width - piece.height;
      const leftoverV = rect.height - piece.width;
      const score = Math.min(leftoverH, leftoverV) * 1000 + Math.max(leftoverH, leftoverV) + rect.y * 0.1;
      
      if (!bestFit || score < bestFit.score) {
        bestFit = { x: rect.x, y: rect.y, rotated: true, score };
      }
    }
  }

  return bestFit;
}

function getFreeRectangles(
  sheet: Sheet,
  sheetWidth: number,
  sheetHeight: number,
): FreeRect[] {
  if (sheet.placements.length === 0) {
    return [{ x: 0, y: 0, width: sheetWidth, height: sheetHeight }];
  }

  // Use Guillotine algorithm with maximal rectangles
  const freeRects: FreeRect[] = [];
  
  // Start with the full sheet as free
  let workingRects: FreeRect[] = [{ x: 0, y: 0, width: sheetWidth, height: sheetHeight }];
  
  // For each placement, split the affected free rectangles
  for (const placement of sheet.placements) {
    const newRects: FreeRect[] = [];
    
    for (const rect of workingRects) {
      // Check if placement overlaps with this rect
      if (placement.x >= rect.x + rect.width || 
          placement.x + placement.width <= rect.x ||
          placement.y >= rect.y + rect.height || 
          placement.y + placement.height <= rect.y) {
        // No overlap, keep the rect
        newRects.push(rect);
      } else {
        // Overlap - split into up to 4 rectangles
        
        // Left rectangle
        if (placement.x > rect.x) {
          newRects.push({
            x: rect.x,
            y: rect.y,
            width: placement.x - rect.x,
            height: rect.height,
          });
        }
        
        // Right rectangle
        if (placement.x + placement.width < rect.x + rect.width) {
          newRects.push({
            x: placement.x + placement.width,
            y: rect.y,
            width: rect.x + rect.width - (placement.x + placement.width),
            height: rect.height,
          });
        }
        
        // Top rectangle
        if (placement.y > rect.y) {
          newRects.push({
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: placement.y - rect.y,
          });
        }
        
        // Bottom rectangle
        if (placement.y + placement.height < rect.y + rect.height) {
          newRects.push({
            x: rect.x,
            y: placement.y + placement.height,
            width: rect.width,
            height: rect.y + rect.height - (placement.y + placement.height),
          });
        }
      }
    }
    
    workingRects = newRects;
  }
  
  // Filter out tiny rectangles (less than 10mm in either dimension)
  const minDim = 10;
  for (const rect of workingRects) {
    if (rect.width >= minDim && rect.height >= minDim) {
      freeRects.push(rect);
    }
  }
  
  // Merge adjacent rectangles where possible to create larger free spaces
  // Sort by position for consistent ordering
  freeRects.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  return freeRects;
}

export function calculateCutList(panels: Panel[]): {
  pieces: {
    label: string;
    width: number;
    height: number;
    qty: number;
    area: number;
  }[];
  totalPieces: number;
  totalArea: number;
} {
  const pieces = panels.map((p) => ({
    label: p.label,
    width: p.width,
    height: p.height,
    qty: p.quantity,
    area: (p.width * p.height * p.quantity) / 1000000, // Convert to m²
  }));

  const totalPieces = pieces.reduce((sum, p) => sum + p.qty, 0);
  const totalArea = pieces.reduce((sum, p) => sum + p.area, 0);

  return { pieces, totalPieces, totalArea };
}

/**
 * Calculate cut list grouped by actual cut dimensions
 * This is what you'd take to the lumber yard - panels with identical cut sizes are bundled
 * Letters are assigned by size (A = largest piece)
 */
export function calculateGroupedCutList(
  panels: Panel[],
  thickness: number,
  furnitureDepth: number,
): {
  pieces: {
    letter: string;
    length: number;
    width: number;
    thickness: number;
    qty: number;
    area: number;
  }[];
  totalPieces: number;
  totalArea: number;
  dimensionToLetter: Map<string, string>; // Export for use in cutting diagrams
} {
  // Group panels by their cut dimensions first, then merge
  const dimensionGroups = new Map<
    string,
    { length: number; width: number; thickness: number; qty: number }
  >();

  // Convert each panel to its actual cut piece dimensions and group
  panels.forEach((p) => {
    const orientation = p.orientation || "horizontal";
    const panelDepth = p.depth || furnitureDepth;
    let length: number, width: number;

    switch (orientation) {
      case "horizontal": // Shelf: depth goes into the furniture
        length = p.width;
        width = panelDepth;
        break;
      case "vertical": // Side panel: height is the length, depth goes into furniture
        length = p.height;
        width = panelDepth;
        break;
      case "back": // Back panel: faces forward
        length = p.width;
        width = p.height;
        break;
      default:
        length = p.width;
        width = panelDepth;
    }

    // Normalize: always have length >= width
    if (width > length) {
      [length, width] = [width, length];
    }

    const key = `${length}x${width}`;
    const existing = dimensionGroups.get(key);
    
    if (existing) {
      existing.qty += p.quantity;
    } else {
      dimensionGroups.set(key, { length, width, thickness, qty: p.quantity });
    }
  });

  // Convert to array and sort by area (largest first)
  const sortedPieces = Array.from(dimensionGroups.entries())
    .map(([key, p]) => ({
      key,
      ...p,
      area: (p.length * p.width * p.qty) / 1000000, // Convert to m²
    }))
    .sort((a, b) => (b.length * b.width) - (a.length * a.width));

  // Assign letters based on size order (A = largest)
  const dimensionToLetter = new Map<string, string>();
  const pieces = sortedPieces.map((p, idx) => {
    const letter = String.fromCharCode(65 + idx); // A, B, C...
    dimensionToLetter.set(p.key, letter);
    return {
      letter,
      length: p.length,
      width: p.width,
      thickness: p.thickness,
      qty: p.qty,
      area: p.area,
    };
  });

  const totalPieces = pieces.reduce((sum, p) => sum + p.qty, 0);
  const totalArea = pieces.reduce((sum, p) => sum + p.area, 0);

  return { pieces, totalPieces, totalArea, dimensionToLetter };
}

/**
 * Get letter label for a panel based on its cut dimensions
 */
export function getPanelLetter(
  panel: Panel,
  furnitureDepth: number,
  dimensionToLetter: Map<string, string>,
): string {
  const orientation = panel.orientation || "horizontal";
  const panelDepth = panel.depth || furnitureDepth;
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
  return dimensionToLetter.get(key) || "?";
}
