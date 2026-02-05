/**
 * Capture a thumbnail from an SVG element
 */
export async function captureSvgThumbnail(
  svgElement: SVGSVGElement,
  width = 300,
  height = 200
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // Clone the SVG to avoid modifying the original
      const clone = svgElement.cloneNode(true) as SVGSVGElement;
      
      // Get current viewBox
      const viewBox = svgElement.getAttribute("viewBox");
      if (viewBox) {
        clone.setAttribute("viewBox", viewBox);
      }
      
      // Set fixed dimensions for the thumbnail
      clone.setAttribute("width", String(width));
      clone.setAttribute("height", String(height));
      
      // Remove any selection or UI elements from clone
      clone.querySelectorAll(".selection-handles, .measure-tool, .snap-guide").forEach(el => el.remove());
      
      // Serialize to string
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clone);
      
      // Create a blob and image
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      
      const img = new Image();
      img.onload = () => {
        // Create canvas and draw
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("Could not get canvas context"));
          return;
        }
        
        // Fill with background
        ctx.fillStyle = "#f1f5f9";
        ctx.fillRect(0, 0, width, height);
        
        // Draw the SVG
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to base64
        const dataUrl = canvas.toDataURL("image/png", 0.8);
        
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load SVG as image"));
      };
      
      img.src = url;
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Store for accessing the canvas SVG ref globally
 */
let canvasSvgRef: SVGSVGElement | null = null;

export function setCanvasSvgRef(ref: SVGSVGElement | null) {
  canvasSvgRef = ref;
}

export function getCanvasSvgRef(): SVGSVGElement | null {
  return canvasSvgRef;
}

export async function captureCurrentCanvasThumbnail(): Promise<string | null> {
  if (!canvasSvgRef) return null;
  
  try {
    return await captureSvgThumbnail(canvasSvgRef);
  } catch (error) {
    console.warn("Failed to capture thumbnail:", error);
    return null;
  }
}
