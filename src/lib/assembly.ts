/**
 * Assembly Instruction Generator
 *
 * Uses support-based dependency analysis to determine assembly order.
 * Based on furniture assembly planning research:
 * - Panels that SUPPORT other panels must be assembled first
 * - Outer frame before inner components
 * - Back panel always last (adds rigidity to completed frame)
 *
 * Enhanced with:
 * - Joint type detection (corner, t-joint, butt, etc.)
 * - Stability analysis (center of mass, tipping detection)
 * - Temporary support hints (hold, prop, clamp)
 * - Improved contextual instructions
 */

import toposort from "toposort";
import type {
  Joint,
  JointType,
  Panel,
  PanelEdge,
  Settings,
  StabilityStatus,
  SupportHint,
  SupportType,
  TipDirection,
} from "../types";

// Assembly step with enhanced information
export interface AssemblyStep {
  stepNumber: number;
  panelId: string;
  panelLabel: string;
  letterLabel: string;
  action: string;
  instruction: string;
  connectsTo: string[];
  connectsToLetters: string[];
  cumulativePanels: string[];
  // New fields for enhanced instructions
  joints: Joint[];
  stabilityStatus: StabilityStatus;
  supportHint?: SupportHint;
  tipWarning?: TipDirection;
  alignmentTip?: string;
}

// Get panel dimensions based on orientation
function getDimensions(panel: Panel, thickness: number) {
  const orientation = panel.orientation || "horizontal";
  switch (orientation) {
    case "horizontal":
      return { w: panel.width, h: thickness, d: panel.depth || 400 };
    case "vertical":
      return { w: thickness, h: panel.height, d: panel.depth || 400 };
    case "back":
      return { w: panel.width, h: panel.height, d: thickness };
    default:
      return { w: panel.width, h: thickness, d: panel.depth || 400 };
  }
}

// Get 3D bounding box for a panel
function get3DBounds(
  panel: Panel,
  thickness: number,
  furnitureDepth: number,
) {
  const dims = getDimensions(panel, thickness);
  const orientation = panel.orientation || "horizontal";
  const panelDepth = panel.depth || furnitureDepth;
  const zAlign = panel.zAlign || "front";

  let z1: number, z2: number;
  if (orientation === "back") {
    z1 = furnitureDepth - thickness;
    z2 = furnitureDepth;
  } else {
    switch (zAlign) {
      case "front":
        z1 = 0;
        z2 = panelDepth;
        break;
      case "back":
        z1 = furnitureDepth - panelDepth;
        z2 = furnitureDepth;
        break;
      case "center":
        z1 = (furnitureDepth - panelDepth) / 2;
        z2 = z1 + panelDepth;
        break;
      default:
        z1 = 0;
        z2 = panelDepth;
    }
  }

  return {
    x1: panel.x,
    x2: panel.x + dims.w,
    y1: panel.y,
    y2: panel.y + dims.h,
    z1,
    z2,
    width: dims.w,
    height: dims.h,
    depth: orientation === "back" ? thickness : panelDepth,
  };
}

// ============================================
// Joint Detection System
// ============================================

/**
 * Detect the type of joint between two panels
 */
function detectJointType(
  panelA: Panel,
  panelB: Panel,
  thickness: number,
  furnitureDepth: number,
): { type: JointType; aEdge: PanelEdge; bEdge: PanelEdge } | null {
  const boundsA = get3DBounds(panelA, thickness, furnitureDepth);
  const boundsB = get3DBounds(panelB, thickness, furnitureDepth);
  const tolerance = thickness * 1.5;

  const orientA = panelA.orientation || "horizontal";
  const orientB = panelB.orientation || "horizontal";

  // Check for contact between panels
  const xOverlap =
    boundsA.x1 < boundsB.x2 + tolerance && boundsA.x2 > boundsB.x1 - tolerance;
  const yOverlap =
    boundsA.y1 < boundsB.y2 + tolerance && boundsA.y2 > boundsB.y1 - tolerance;
  const zOverlap =
    boundsA.z1 < boundsB.z2 + tolerance && boundsA.z2 > boundsB.z1 - tolerance;

  if (!xOverlap || !yOverlap || !zOverlap) {
    return null; // No contact
  }

  // Vertical + Horizontal = typically corner or t-joint
  if (orientA === "vertical" && orientB === "horizontal") {
    const atALeft = Math.abs(boundsA.x1 - boundsB.x1) <= tolerance;
    const atARight = Math.abs(boundsA.x2 - boundsB.x2) <= tolerance;
    const atBBottom = Math.abs(boundsA.y2 - boundsB.y1) <= tolerance;
    const atBTop = Math.abs(boundsA.y1 - boundsB.y2) <= tolerance;

    if (atALeft && (atBBottom || atBTop)) {
      return { type: "corner", aEdge: "left", bEdge: atBBottom ? "bottom" : "top" };
    }
    if (atARight && (atBBottom || atBTop)) {
      return { type: "corner", aEdge: "right", bEdge: atBBottom ? "bottom" : "top" };
    }
    // T-joint: horizontal meets vertical mid-span
    return { type: "t-joint", aEdge: "left", bEdge: "bottom" };
  }

  if (orientA === "horizontal" && orientB === "vertical") {
    const atBLeft = Math.abs(boundsB.x1 - boundsA.x1) <= tolerance;
    const atBRight = Math.abs(boundsB.x2 - boundsA.x2) <= tolerance;
    const atABottom = Math.abs(boundsB.y2 - boundsA.y1) <= tolerance;
    const atATop = Math.abs(boundsB.y1 - boundsA.y2) <= tolerance;

    if (atBLeft && (atABottom || atATop)) {
      return { type: "corner", aEdge: atABottom ? "bottom" : "top", bEdge: "left" };
    }
    if (atBRight && (atABottom || atATop)) {
      return { type: "corner", aEdge: atABottom ? "bottom" : "top", bEdge: "right" };
    }
    return { type: "t-joint", aEdge: "bottom", bEdge: "left" };
  }

  // Two verticals side by side
  if (orientA === "vertical" && orientB === "vertical") {
    return { type: "butt", aEdge: "right", bEdge: "left" };
  }

  // Two horizontals stacked
  if (orientA === "horizontal" && orientB === "horizontal") {
    const aAboveB = Math.abs(boundsA.y1 - boundsB.y2) <= tolerance;
    const bAboveA = Math.abs(boundsB.y1 - boundsA.y2) <= tolerance;
    if (aAboveB) return { type: "butt", aEdge: "bottom", bEdge: "top" };
    if (bAboveA) return { type: "butt", aEdge: "top", bEdge: "bottom" };
  }

  // Back panel connections
  if (orientA === "back" || orientB === "back") {
    return { type: "butt", aEdge: "back", bEdge: "front" };
  }

  return { type: "butt", aEdge: "right", bEdge: "left" };
}

/**
 * Detect all joints for a panel being added to existing assembly
 */
function detectJointsForPanel(
  panel: Panel,
  assembledPanels: Panel[],
  thickness: number,
  furnitureDepth: number,
): Joint[] {
  const joints: Joint[] = [];

  for (const other of assembledPanels) {
    const jointInfo = detectJointType(panel, other, thickness, furnitureDepth);
    if (jointInfo) {
      joints.push({
        panelAId: panel.id,
        panelBId: other.id,
        type: jointInfo.type,
        panelAEdge: jointInfo.aEdge,
        panelBEdge: jointInfo.bEdge,
      });
    }
  }

  return joints;
}

// ============================================
// Stability Analysis System
// ============================================

interface MassPoint {
  x: number;
  y: number;
  z: number;
  mass: number;
}

/**
 * Calculate center of mass for a set of panels
 */
function calculateCenterOfMass(
  panels: Panel[],
  thickness: number,
  furnitureDepth: number,
): { x: number; y: number; z: number } {
  if (panels.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  let totalMass = 0;
  let weightedX = 0;
  let weightedY = 0;
  let weightedZ = 0;

  for (const panel of panels) {
    const bounds = get3DBounds(panel, thickness, furnitureDepth);
    // Mass proportional to volume (simplified - assumes uniform density)
    const volume = bounds.width * bounds.height * bounds.depth;
    const mass = volume;

    const centerX = (bounds.x1 + bounds.x2) / 2;
    const centerY = (bounds.y1 + bounds.y2) / 2;
    const centerZ = (bounds.z1 + bounds.z2) / 2;

    weightedX += centerX * mass;
    weightedY += centerY * mass;
    weightedZ += centerZ * mass;
    totalMass += mass;
  }

  return {
    x: weightedX / totalMass,
    y: weightedY / totalMass,
    z: weightedZ / totalMass,
  };
}

/**
 * Get the support polygon (floor contact points) for the assembly
 */
function getSupportPolygon(
  panels: Panel[],
  thickness: number,
  furnitureDepth: number,
): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  // Find panels that touch the floor (y = 0 or near global minimum)
  const allBounds = panels.map((p) => get3DBounds(p, thickness, furnitureDepth));
  const globalMinY = Math.min(...allBounds.map((b) => b.y1));

  const floorPanels = panels.filter((p) => {
    const bounds = get3DBounds(p, thickness, furnitureDepth);
    return Math.abs(bounds.y1 - globalMinY) < thickness;
  });

  if (floorPanels.length === 0) {
    return null; // Nothing on the floor - definitely unstable!
  }

  const floorBounds = floorPanels.map((p) =>
    get3DBounds(p, thickness, furnitureDepth),
  );

  return {
    minX: Math.min(...floorBounds.map((b) => b.x1)),
    maxX: Math.max(...floorBounds.map((b) => b.x2)),
    minZ: Math.min(...floorBounds.map((b) => b.z1)),
    maxZ: Math.max(...floorBounds.map((b) => b.z2)),
  };
}

/**
 * Check if the assembly is stable (center of mass within support polygon)
 */
function checkStability(
  panels: Panel[],
  thickness: number,
  furnitureDepth: number,
): { stable: boolean; tipDirection: TipDirection; margin: number } {
  if (panels.length === 0) {
    return { stable: true, tipDirection: "none", margin: 1 };
  }

  const com = calculateCenterOfMass(panels, thickness, furnitureDepth);
  const support = getSupportPolygon(panels, thickness, furnitureDepth);

  if (!support) {
    return { stable: false, tipDirection: "forward", margin: -1 };
  }

  // Check if center of mass projects within support polygon
  const marginX = Math.min(com.x - support.minX, support.maxX - com.x);
  const marginZ = Math.min(com.z - support.minZ, support.maxZ - com.z);

  const supportWidth = support.maxX - support.minX;
  const supportDepth = support.maxZ - support.minZ;

  // Normalize margins
  const normalizedMarginX = marginX / (supportWidth / 2);
  const normalizedMarginZ = marginZ / (supportDepth / 2);

  const stable = marginX > 0 && marginZ > 0;
  const minMargin = Math.min(normalizedMarginX, normalizedMarginZ);

  let tipDirection: TipDirection = "none";
  if (!stable || minMargin < 0.2) {
    if (marginX < marginZ) {
      tipDirection = com.x < (support.minX + support.maxX) / 2 ? "left" : "right";
    } else {
      tipDirection = com.z < (support.minZ + support.maxZ) / 2 ? "forward" : "backward";
    }
  }

  return { stable, tipDirection, margin: minMargin };
}

// ============================================
// Support Hint System
// ============================================

/**
 * Determine if a panel needs temporary support during assembly
 */
function determineSupportNeeded(
  panel: Panel,
  assembledPanels: Panel[],
  thickness: number,
  furnitureDepth: number,
): SupportHint | undefined {
  const orientation = panel.orientation || "horizontal";
  const bounds = get3DBounds(panel, thickness, furnitureDepth);

  // Get global floor level from assembled panels
  const allBounds = [...assembledPanels, panel].map((p) =>
    get3DBounds(p, thickness, furnitureDepth),
  );
  const globalMinY = Math.min(...allBounds.map((b) => b.y1));

  const isOnFloor = Math.abs(bounds.y1 - globalMinY) < thickness;

  // Vertical panel not on floor needs support
  if (orientation === "vertical" && !isOnFloor) {
    // Check if it rests on a horizontal panel
    const hasHorizontalBase = assembledPanels.some((p) => {
      if (p.orientation !== "horizontal") return false;
      const pBounds = get3DBounds(p, thickness, furnitureDepth);
      const yMatch = Math.abs(bounds.y1 - pBounds.y2) < thickness * 2;
      const xOverlap = bounds.x1 < pBounds.x2 && bounds.x2 > pBounds.x1;
      return yMatch && xOverlap;
    });

    if (!hasHorizontalBase) {
      return {
        type: "hold",
        instruction: "Have a helper hold this panel in position while securing.",
        targetPanelIds: [panel.id],
      };
    }
  }

  // Single vertical panel on floor - might tip
  if (orientation === "vertical" && isOnFloor && assembledPanels.length === 0) {
    return {
      type: "lean",
      instruction: "Lean panel against a wall or have a helper steady it.",
      targetPanelIds: [panel.id],
    };
  }

  // Check overall stability after adding this panel
  const futureAssembly = [...assembledPanels, panel];
  const stability = checkStability(futureAssembly, thickness, furnitureDepth);

  if (!stability.stable) {
    return {
      type: "prop",
      instruction: `Structure may tip ${stability.tipDirection}. Use a prop or clamp to stabilize.`,
      targetPanelIds: futureAssembly.map((p) => p.id),
    };
  }

  if (stability.margin < 0.3) {
    return {
      type: "hold",
      instruction: "Assembly is marginally stable. Work carefully or use clamps.",
      targetPanelIds: [panel.id],
    };
  }

  // Horizontal panel with only one support point
  if (orientation === "horizontal") {
    const verticalSupports = assembledPanels.filter((p) => {
      if (p.orientation !== "vertical") return false;
      const pBounds = get3DBounds(p, thickness, furnitureDepth);
      const atLeft = Math.abs(pBounds.x1 - bounds.x1) < thickness * 2 ||
        Math.abs(pBounds.x2 - bounds.x1) < thickness * 2;
      const atRight = Math.abs(pBounds.x1 - bounds.x2) < thickness * 2 ||
        Math.abs(pBounds.x2 - bounds.x2) < thickness * 2;
      const yOverlap = pBounds.y1 <= bounds.y1 && pBounds.y2 >= bounds.y1;
      return (atLeft || atRight) && yOverlap;
    });

    if (verticalSupports.length === 1) {
      return {
        type: "clamp",
        instruction: "Use a clamp or have someone hold the unsupported end.",
        targetPanelIds: [panel.id],
      };
    }
  }

  return undefined;
}

// ============================================
// Alignment Tip Generator
// ============================================

function generateAlignmentTip(
  panel: Panel,
  joints: Joint[],
  assembledPanels: Panel[],
  thickness: number,
  furnitureDepth: number,
  idToLetter: Map<string, string>,
): string | undefined {
  if (joints.length === 0) return undefined;

  const orientation = panel.orientation || "horizontal";
  const bounds = get3DBounds(panel, thickness, furnitureDepth);
  const tips: string[] = [];

  // Check front/back alignment
  if (orientation !== "back") {
    const zAlign = panel.zAlign || "front";
    if (zAlign === "front") {
      tips.push("Align flush with front edge");
    } else if (zAlign === "back") {
      tips.push("Set back from front edge");
    }
  }

  // Check for centered positioning
  for (const joint of joints) {
    const otherPanel = assembledPanels.find((p) => p.id === joint.panelBId);
    if (!otherPanel) continue;

    const otherBounds = get3DBounds(otherPanel, thickness, furnitureDepth);
    const letter = idToLetter.get(otherPanel.id) || "?";

    // Check if centered on the other panel
    if (orientation === "horizontal" && otherPanel.orientation === "vertical") {
      const centerMatch =
        Math.abs((bounds.x1 + bounds.x2) / 2 - (otherBounds.x1 + otherBounds.x2) / 2) <
        thickness;
      if (centerMatch) {
        tips.push(`Center on panel ${letter}`);
      }
    }
  }

  return tips.length > 0 ? tips.join(". ") : undefined;
}

// Get panel 2D bounds (for dependency graph - backward compatibility)
function getBounds(panel: Panel, thickness: number) {
  const dims = getDimensions(panel, thickness);
  return {
    left: panel.x,
    right: panel.x + dims.w,
    bottom: panel.y,
    top: panel.y + dims.h,
    width: dims.w,
    height: dims.h,
  };
}

function findVerticalSupports(
  horizontal: Panel,
  allPanels: Panel[],
  thickness: number,
): Panel[] {
  const hBounds = getBounds(horizontal, thickness);
  const supports: Panel[] = [];
  const tolerance = thickness * 2;

  for (const panel of allPanels) {
    if (panel.id === horizontal.id) continue;
    if (panel.orientation !== "vertical") continue;

    const vBounds = getBounds(panel, thickness);

    // Check if vertical's X position is at horizontal's left or right edge
    const atLeftEdge =
      Math.abs(vBounds.left - hBounds.left) <= tolerance ||
      Math.abs(vBounds.right - hBounds.left) <= tolerance;
    const atRightEdge =
      Math.abs(vBounds.left - hBounds.right) <= tolerance ||
      Math.abs(vBounds.right - hBounds.right) <= tolerance;

    // Check Y overlap - horizontal must be within vertical's height
    const yOverlap =
      hBounds.bottom >= vBounds.bottom - tolerance &&
      hBounds.bottom <= vBounds.top + tolerance;

    if ((atLeftEdge || atRightEdge) && yOverlap) {
      supports.push(panel);
    }
  }

  return supports;
}

/**
 * Find which horizontal panels a vertical panel sits on.
 * A vertical panel sits on a horizontal if:
 * - The vertical's bottom Y is at or near the horizontal's top Y
 * - There's X overlap
 */
function findHorizontalBase(
  vertical: Panel,
  allPanels: Panel[],
  thickness: number,
): Panel[] {
  const vBounds = getBounds(vertical, thickness);
  const bases: Panel[] = [];
  const tolerance = thickness * 2;

  for (const panel of allPanels) {
    if (panel.id === vertical.id) continue;
    if (panel.orientation !== "horizontal") continue;

    const hBounds = getBounds(panel, thickness);

    // Check if vertical sits on this horizontal
    const yMatch =
      Math.abs(vBounds.bottom - hBounds.top) <= tolerance ||
      Math.abs(vBounds.bottom - hBounds.bottom) <= tolerance;

    // Check X overlap
    const xOverlap =
      vBounds.left < hBounds.right + tolerance &&
      vBounds.right > hBounds.left - tolerance;

    if (yMatch && xOverlap) {
      bases.push(panel);
    }
  }

  return bases;
}

/**
 * Build dependency graph based on support relationships.
 * Edge [A, B] means: A must be assembled before B
 */
function buildDependencyGraph(
  panels: Panel[],
  thickness: number,
): Array<[string, string]> {
  const edges: Array<[string, string]> = [];
  const bounds = new Map<string, ReturnType<typeof getBounds>>();

  // Pre-calculate bounds
  panels.forEach((p) => bounds.set(p.id, getBounds(p, thickness)));

  // Find global bounds
  const allBounds = Array.from(bounds.values());
  const globalMinY = Math.min(...allBounds.map((b) => b.bottom));
  const globalMaxY = Math.max(...allBounds.map((b) => b.top));
  const globalMinX = Math.min(...allBounds.map((b) => b.left));
  const globalMaxX = Math.max(...allBounds.map((b) => b.right));

  for (const panel of panels) {
    const orientation = panel.orientation || "horizontal";
    const pBounds = bounds.get(panel.id)!;

    // Rule 1: Horizontal panels depend on vertical supports
    if (orientation === "horizontal") {
      const supports = findVerticalSupports(panel, panels, thickness);
      for (const support of supports) {
        edges.push([support.id, panel.id]);
      }
    }

    // Rule 2: Vertical panels that don't start at floor depend on horizontal base
    if (orientation === "vertical") {
      const isAtFloor = Math.abs(pBounds.bottom - globalMinY) < thickness * 2;
      if (!isAtFloor) {
        const bases = findHorizontalBase(panel, panels, thickness);
        for (const base of bases) {
          edges.push([base.id, panel.id]);
        }
      }
    }

    // Rule 3: Back panel depends on ALL other panels
    if (orientation === "back") {
      for (const other of panels) {
        if (other.id !== panel.id && other.orientation !== "back") {
          edges.push([other.id, panel.id]);
        }
      }
    }
  }

  return edges;
}

/**
 * Calculate priority for tie-breaking in topological sort.
 * Lower priority = assemble earlier when there are no dependencies
 */
function getPriority(
  panel: Panel,
  thickness: number,
  allPanels: Panel[],
): number {
  const orientation = panel.orientation || "horizontal";
  const bounds = getBounds(panel, thickness);

  // Get global bounds
  const allBounds = allPanels.map((p) => getBounds(p, thickness));
  const globalMinY = Math.min(...allBounds.map((b) => b.bottom));
  const globalMaxY = Math.max(...allBounds.map((b) => b.top));
  const globalMinX = Math.min(...allBounds.map((b) => b.left));
  const globalMaxX = Math.max(...allBounds.map((b) => b.right));

  let priority = 0;

  // Orientation priority (vertical structural panels first)
  if (orientation === "vertical") {
    priority += 0;
  } else if (orientation === "horizontal") {
    priority += 10000;
  } else if (orientation === "back") {
    priority += 100000; // Always last
  }

  // Full-height verticals before partial-height
  if (orientation === "vertical") {
    const isFullHeight =
      Math.abs(bounds.height - (globalMaxY - globalMinY)) < thickness * 3;
    if (isFullHeight) priority -= 1000;

    // Outer sides before inner dividers
    const isLeftEdge = Math.abs(bounds.left - globalMinX) < thickness * 2;
    const isRightEdge = Math.abs(bounds.right - globalMaxX) < thickness * 2;
    if (isLeftEdge) priority -= 500;
    if (isRightEdge) priority -= 400;
  }

  // For horizontals: full-width before partial, lower Y before higher
  if (orientation === "horizontal") {
    const isFullWidth =
      Math.abs(bounds.width - (globalMaxX - globalMinX)) < thickness * 3;
    if (isFullWidth) priority -= 500;

    // Bottom before top
    const relativeY = (bounds.bottom - globalMinY) / (globalMaxY - globalMinY);
    priority += relativeY * 1000;
  }

  return priority;
}

/**
 * Generate instruction text based on panel role and connections
 */
function generateInstruction(
  panel: Panel,
  letterLabel: string,
  connectsToLetters: string[],
  stepNumber: number,
  thickness: number,
  allPanels: Panel[],
  joints: Joint[] = [],
  idToLetter: Map<string, string> = new Map(),
): string {
  const orientation = panel.orientation || "horizontal";
  const bounds = getBounds(panel, thickness);

  // Get global bounds
  const allBounds = allPanels.map((p) => getBounds(p, thickness));
  const globalMinY = Math.min(...allBounds.map((b) => b.bottom));
  const globalMaxY = Math.max(...allBounds.map((b) => b.top));
  const globalMinX = Math.min(...allBounds.map((b) => b.left));
  const globalMaxX = Math.max(...allBounds.map((b) => b.right));

  // Check panel role
  const isLeftEdge = Math.abs(bounds.left - globalMinX) < thickness * 2;
  const isRightEdge = Math.abs(bounds.right - globalMaxX) < thickness * 2;
  const isAtFloor = Math.abs(bounds.bottom - globalMinY) < thickness * 2;
  const isAtTop = Math.abs(bounds.top - globalMaxY) < thickness * 2;
  const isFullWidth =
    Math.abs(bounds.width - (globalMaxX - globalMinX)) < thickness * 3;
  const isFullHeight =
    Math.abs(bounds.height - (globalMaxY - globalMinY)) < thickness * 3;

  const heightFromBase = Math.round(bounds.bottom - globalMinY);

  // Generate joint description for enhanced instructions
  const jointDescriptions = joints.map((j) => {
    const otherLetter = idToLetter.get(j.panelBId) || "?";
    switch (j.type) {
      case "corner":
        return `corner joint with ${otherLetter}`;
      case "t-joint":
        return `T-joint into ${otherLetter}`;
      case "dado":
        return `dado joint with ${otherLetter}`;
      default:
        return `connects to ${otherLetter}`;
    }
  });

  const jointText =
    jointDescriptions.length > 0
      ? ` (${jointDescriptions.slice(0, 2).join(", ")})`
      : "";

  // Vertical panels (sides and dividers)
  if (orientation === "vertical") {
    if (isFullHeight && isLeftEdge) {
      return `Stand panel ${letterLabel} upright. This is the LEFT SIDE of the unit.${stepNumber === 1 ? " This is your starting point." : ""}`;
    }
    if (isFullHeight && isRightEdge) {
      const connRef = connectsToLetters[0] || "the first panel";
      return `Stand panel ${letterLabel} upright, parallel to ${connRef}. This is the RIGHT SIDE.${jointText}`;
    }
    if (isFullHeight) {
      const connText =
        connectsToLetters.length > 0
          ? ` between ${connectsToLetters.join(" and ")}`
          : "";
      return `Position panel ${letterLabel} as a vertical DIVIDER${connText}. It spans the full height.${jointText}`;
    }
    // Partial height divider
    const connText =
      connectsToLetters.length > 0
        ? `, resting on ${connectsToLetters.join(" and ")}`
        : "";
    return `Attach panel ${letterLabel} as a vertical divider${connText}.${jointText}`;
  }

  // Horizontal panels (bottom, top, shelves)
  if (orientation === "horizontal") {
    const connText =
      connectsToLetters.length > 0
        ? ` Secure to ${connectsToLetters.join(" and ")}.`
        : "";

    if (isAtFloor && isFullWidth) {
      return `Place panel ${letterLabel} as the BOTTOM, spanning between the side panels.${connText}${jointText}`;
    }
    if (isAtTop && isFullWidth) {
      return `Place panel ${letterLabel} as the TOP, completing the frame.${connText}${jointText}`;
    }
    if (isFullWidth) {
      return `Insert panel ${letterLabel} as a SHELF at ${heightFromBase}mm from the base.${connText}${jointText}`;
    }
    // Partial width shelf (within a compartment)
    return `Insert panel ${letterLabel} as a compartment shelf at ${heightFromBase}mm height.${connText}${jointText}`;
  }

  // Back panel
  if (orientation === "back") {
    return `Attach panel ${letterLabel} to the BACK of the assembled frame. This squares up the unit and adds rigidity.`;
  }

  return `Install panel ${letterLabel} as shown.${jointText}`;
}

/**
 * Get action verb based on panel type
 */
function getAction(panel: Panel): string {
  const orientation = panel.orientation || "horizontal";
  switch (orientation) {
    case "vertical":
      return "Stand";
    case "horizontal":
      return "Place";
    case "back":
      return "Attach";
    default:
      return "Install";
  }
}

/**
 * Main function: Generate assembly steps
 * 
 * PRACTICAL ASSEMBLY ORDER for furniture:
 * 1. Side panels (vertical, at edges) - these form the frame
 * 2. Bottom shelf - connects the sides at the bottom
 * 3. Top shelf/panel - completes the frame box
 * 4. Inner dividers (vertical) - from left to right
 * 5. Inner shelves (horizontal) - from bottom to top
 * 6. Back panel - always last, squares up the unit
 */
export function generateAssemblySteps(
  panels: Panel[],
  settings: Settings,
): AssemblyStep[] {
  if (panels.length === 0) return [];

  const thickness = settings.thickness;
  const furnitureDepth = settings.furnitureDepth || 400;

  // Calculate bounds for all panels
  const boundsMap = new Map<string, ReturnType<typeof getBounds>>();
  panels.forEach((p) => boundsMap.set(p.id, getBounds(p, thickness)));

  // Find global bounds (the overall furniture dimensions)
  const allBounds = Array.from(boundsMap.values());
  const globalMinX = Math.min(...allBounds.map((b) => b.left));
  const globalMaxX = Math.max(...allBounds.map((b) => b.right));
  const globalMinY = Math.min(...allBounds.map((b) => b.bottom));
  const globalMaxY = Math.max(...allBounds.map((b) => b.top));
  const globalWidth = globalMaxX - globalMinX;
  const globalHeight = globalMaxY - globalMinY;

  // Categorize panels by their role
  const categorized: {
    leftSide: Panel[];      // Vertical at left edge
    rightSide: Panel[];     // Vertical at right edge
    bottom: Panel[];        // Horizontal at bottom
    top: Panel[];           // Horizontal at top
    innerDividers: Panel[]; // Vertical panels in the middle
    innerShelves: Panel[];  // Horizontal panels in the middle
    back: Panel[];          // Back panels
  } = {
    leftSide: [],
    rightSide: [],
    bottom: [],
    top: [],
    innerDividers: [],
    innerShelves: [],
    back: [],
  };

  const edgeTolerance = thickness * 2;

  for (const panel of panels) {
    const orientation = panel.orientation || "horizontal";
    const bounds = boundsMap.get(panel.id)!;

    if (orientation === "back") {
      categorized.back.push(panel);
      continue;
    }

    const isAtLeft = Math.abs(bounds.left - globalMinX) < edgeTolerance;
    const isAtRight = Math.abs(bounds.right - globalMaxX) < edgeTolerance;
    const isAtBottom = Math.abs(bounds.bottom - globalMinY) < edgeTolerance;
    const isAtTop = Math.abs(bounds.top - globalMaxY) < edgeTolerance;
    const isFullHeight = Math.abs(bounds.height - globalHeight) < thickness * 3;
    const isFullWidth = Math.abs(bounds.width - globalWidth) < thickness * 3;

    if (orientation === "vertical") {
      if (isAtLeft && isFullHeight) {
        categorized.leftSide.push(panel);
      } else if (isAtRight && isFullHeight) {
        categorized.rightSide.push(panel);
      } else {
        categorized.innerDividers.push(panel);
      }
    } else if (orientation === "horizontal") {
      if (isAtBottom && isFullWidth) {
        categorized.bottom.push(panel);
      } else if (isAtTop && isFullWidth) {
        categorized.top.push(panel);
      } else {
        categorized.innerShelves.push(panel);
      }
    }
  }

  // Sort inner dividers left to right
  categorized.innerDividers.sort((a, b) => {
    const boundsA = boundsMap.get(a.id)!;
    const boundsB = boundsMap.get(b.id)!;
    return boundsA.left - boundsB.left;
  });

  // Sort inner shelves bottom to top
  categorized.innerShelves.sort((a, b) => {
    const boundsA = boundsMap.get(a.id)!;
    const boundsB = boundsMap.get(b.id)!;
    return boundsA.bottom - boundsB.bottom;
  });

  // Build ordered list - this is the practical assembly order
  const orderedPanels: Panel[] = [
    ...categorized.leftSide,      // 1. Left side first (stands on floor)
    ...categorized.rightSide,     // 2. Right side (stands on floor)
    ...categorized.bottom,        // 3. Bottom shelf (connects sides)
    ...categorized.top,           // 4. Top (completes frame)
    ...categorized.innerDividers, // 5. Inner dividers (left to right)
    ...categorized.innerShelves,  // 6. Inner shelves (bottom to top)
    ...categorized.back,          // 7. Back panel (always last)
  ];

  // Handle any panels that didn't fit into categories (shouldn't happen, but safety)
  const orderedIds = new Set(orderedPanels.map((p) => p.id));
  for (const panel of panels) {
    if (!orderedIds.has(panel.id)) {
      // Insert before back panels
      const backIndex = orderedPanels.findIndex((p) => p.orientation === "back");
      if (backIndex >= 0) {
        orderedPanels.splice(backIndex, 0, panel);
      } else {
        orderedPanels.push(panel);
      }
    }
  }

  // Assign letter labels - panels with identical cut dimensions share the same letter
  const idToLetter = new Map<string, string>();
  const dimensionToLetter = new Map<string, string>();
  let nextLetterIndex = 0;
  
  orderedPanels.forEach((p) => {
    // Calculate cut dimensions for this panel
    const orientation = p.orientation || "horizontal";
    const panelDepth = p.depth || furnitureDepth;
    let cutW: number, cutH: number;
    
    switch (orientation) {
      case "horizontal":
        cutW = p.width;
        cutH = panelDepth;
        break;
      case "vertical":
        cutW = p.height;
        cutH = panelDepth;
        break;
      case "back":
        cutW = p.width;
        cutH = p.height;
        break;
      default:
        cutW = p.width;
        cutH = panelDepth;
    }
    
    // Normalize dimensions (larger first) for consistent keys
    const dimKey = cutW >= cutH ? `${cutW}x${cutH}` : `${cutH}x${cutW}`;
    
    // Check if we already have a letter for these dimensions
    let letter = dimensionToLetter.get(dimKey);
    if (!letter) {
      letter = String.fromCharCode(65 + nextLetterIndex); // A, B, C...
      dimensionToLetter.set(dimKey, letter);
      nextLetterIndex++;
    }
    
    idToLetter.set(p.id, letter);
  });

  // Build simple dependency edges for joint detection
  const edges = buildDependencyGraph(panels, thickness);

  // Generate steps
  const assembledSoFar: string[] = [];
  const assembledPanels: Panel[] = [];

  return orderedPanels.map((panel, index) => {
    const letterLabel = idToLetter.get(panel.id) || "?";
    const bounds = boundsMap.get(panel.id)!;

    // Find connections to already-assembled panels
    const connectsToIds = edges
      .filter(([from, to]) => to === panel.id && assembledSoFar.includes(from))
      .map(([from]) => from);

    const connectsToLetters = connectsToIds
      .map((id) => idToLetter.get(id))
      .filter((l): l is string => !!l);

    // Detect joints with assembled panels
    const joints = detectJointsForPanel(
      panel,
      assembledPanels,
      thickness,
      furnitureDepth,
    );

    // Check stability after adding this panel
    const futureAssembly = [...assembledPanels, panel];
    const stability = checkStability(futureAssembly, thickness, furnitureDepth);

    // Determine stability status
    let stabilityStatus: StabilityStatus = "stable";
    if (!stability.stable) {
      stabilityStatus = "unstable";
    } else if (stability.margin < 0.3) {
      stabilityStatus = "needs-support";
    }

    // Get support hint if needed
    const supportHint = determineSupportNeeded(
      panel,
      assembledPanels,
      thickness,
      furnitureDepth,
    );

    // Generate alignment tip
    const alignmentTip = generateAlignmentTip(
      panel,
      joints,
      assembledPanels,
      thickness,
      furnitureDepth,
      idToLetter,
    );

    // Generate practical instruction
    const instruction = generatePracticalInstruction(
      panel,
      letterLabel,
      connectsToLetters,
      bounds,
      {
        globalMinX,
        globalMaxX,
        globalMinY,
        globalMaxY,
        globalWidth,
        globalHeight,
      },
      thickness,
      assembledPanels,
      idToLetter,
    );

    // Update assembled state
    assembledSoFar.push(panel.id);
    assembledPanels.push(panel);

    return {
      stepNumber: index + 1,
      panelId: panel.id,
      panelLabel: panel.label || `Panel ${panel.id.slice(0, 4)}`,
      letterLabel,
      action: getAction(panel),
      instruction,
      connectsTo: connectsToIds,
      connectsToLetters,
      cumulativePanels: [...assembledSoFar],
      joints,
      stabilityStatus,
      supportHint,
      tipWarning: !stability.stable ? stability.tipDirection : undefined,
      alignmentTip,
    };
  });
}

/**
 * Generate practical, human-readable instruction
 */
function generatePracticalInstruction(
  panel: Panel,
  letterLabel: string,
  connectsToLetters: string[],
  bounds: ReturnType<typeof getBounds>,
  global: {
    globalMinX: number;
    globalMaxX: number;
    globalMinY: number;
    globalMaxY: number;
    globalWidth: number;
    globalHeight: number;
  },
  thickness: number,
  assembledPanels: Panel[],
  idToLetter: Map<string, string>,
): string {
  const orientation = panel.orientation || "horizontal";
  const { globalMinX, globalMaxX, globalMinY, globalMaxY, globalWidth, globalHeight } = global;
  const edgeTolerance = thickness * 2;

  const isAtLeft = Math.abs(bounds.left - globalMinX) < edgeTolerance;
  const isAtRight = Math.abs(bounds.right - globalMaxX) < edgeTolerance;
  const isAtBottom = Math.abs(bounds.bottom - globalMinY) < edgeTolerance;
  const isAtTop = Math.abs(bounds.top - globalMaxY) < edgeTolerance;
  const isFullHeight = Math.abs(bounds.height - globalHeight) < thickness * 3;
  const isFullWidth = Math.abs(bounds.width - globalWidth) < thickness * 3;

  // Connection text
  const connText = connectsToLetters.length > 0
    ? ` Connect to panel${connectsToLetters.length > 1 ? "s" : ""} ${connectsToLetters.join(", ")}.`
    : "";

  // Vertical panels (sides and dividers)
  if (orientation === "vertical") {
    if (isAtLeft && isFullHeight) {
      return `Stand the LEFT SIDE panel (${letterLabel}) upright on the floor. This forms the left edge of your furniture.`;
    }
    if (isAtRight && isFullHeight) {
      return `Stand the RIGHT SIDE panel (${letterLabel}) upright, parallel to the left side.${connText}`;
    }
    // Inner divider
    const distFromLeft = bounds.left - globalMinX;
    return `Stand divider ${letterLabel} upright at ${Math.round(distFromLeft)}mm from the left side.${connText}`;
  }

  // Horizontal panels (shelves)
  if (orientation === "horizontal") {
    if (isAtBottom && isFullWidth) {
      return `Lay the BOTTOM panel (${letterLabel}) flat, connecting the left and right sides at the base.${connText}`;
    }
    if (isAtTop && isFullWidth) {
      return `Place the TOP panel (${letterLabel}) to complete the outer frame.${connText}`;
    }
    // Inner shelf
    const heightFromBase = Math.round(bounds.bottom - globalMinY);
    if (isFullWidth) {
      return `Insert shelf ${letterLabel} at ${heightFromBase}mm from the bottom, spanning the full width.${connText}`;
    }
    return `Insert shelf ${letterLabel} at ${heightFromBase}mm height.${connText}`;
  }

  // Back panel
  if (orientation === "back") {
    return `Attach the BACK panel (${letterLabel}) to the rear of the assembled frame. This squares the unit and adds rigidity.`;
  }

  return `Install panel ${letterLabel}.${connText}`;
}

/**
 * Get assembly summary
 */
export function getAssemblySummary(steps: AssemblyStep[]): {
  totalSteps: number;
  estimatedTime: string;
} {
  const totalSteps = steps.length;
  const minutesPerPanel = 3;
  const totalMinutes = totalSteps * minutesPerPanel;

  let estimatedTime: string;
  if (totalMinutes < 60) {
    estimatedTime = `${totalMinutes} minutes`;
  } else {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    estimatedTime =
      mins > 0
        ? `${hours}h ${mins}min`
        : `${hours} hour${hours > 1 ? "s" : ""}`;
  }

  return { totalSteps, estimatedTime };
}
