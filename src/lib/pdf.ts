import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/**
 * Export an HTML element to PDF
 */
export async function exportToPDF(
  element: HTMLElement,
  filename: string = "craftcut-production.pdf",
  options: {
    title?: string;
    orientation?: "portrait" | "landscape";
    margin?: number;
  } = {}
): Promise<void> {
  const { orientation = "portrait", margin = 10 } = options;

  // Create canvas from the element
  const canvas = await html2canvas(element, {
    scale: 2, // Higher resolution
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });

  // Calculate dimensions
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;

  // A4 dimensions in mm
  const pdfWidth = orientation === "portrait" ? 210 : 297;
  const pdfHeight = orientation === "portrait" ? 297 : 210;

  // Available space after margins
  const availableWidth = pdfWidth - margin * 2;
  const availableHeight = pdfHeight - margin * 2;

  // Calculate scaling to fit content
  const scale = Math.min(
    availableWidth / (imgWidth / 2), // Divide by 2 because of scale: 2
    availableHeight / (imgHeight / 2)
  );

  const scaledWidth = (imgWidth / 2) * scale;
  const scaledHeight = (imgHeight / 2) * scale;

  // Create PDF
  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: "a4",
  });

  // Add image to PDF
  const imgData = canvas.toDataURL("image/png");
  
  // Center the content
  const xOffset = (pdfWidth - scaledWidth) / 2;
  const yOffset = margin;

  pdf.addImage(imgData, "PNG", xOffset, yOffset, scaledWidth, scaledHeight);

  // Save PDF
  pdf.save(filename);
}

/**
 * Export multiple pages to PDF (for long documents)
 */
export async function exportMultiPagePDF(
  elements: HTMLElement[],
  filename: string = "craftcut-production.pdf",
  options: {
    title?: string;
    orientation?: "portrait" | "landscape";
    margin?: number;
  } = {}
): Promise<void> {
  const { orientation = "portrait", margin = 10 } = options;

  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: "a4",
  });

  const pdfWidth = orientation === "portrait" ? 210 : 297;
  const pdfHeight = orientation === "portrait" ? 297 : 210;
  const availableWidth = pdfWidth - margin * 2;

  for (let i = 0; i < elements.length; i++) {
    if (i > 0) {
      pdf.addPage();
    }

    const canvas = await html2canvas(elements[i], {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");
    const imgWidth = canvas.width / 2;
    const imgHeight = canvas.height / 2;

    const scale = availableWidth / imgWidth;
    const scaledWidth = imgWidth * scale;
    const scaledHeight = imgHeight * scale;

    const xOffset = margin;
    const yOffset = margin;

    pdf.addImage(imgData, "PNG", xOffset, yOffset, scaledWidth, scaledHeight);
  }

  pdf.save(filename);
}
