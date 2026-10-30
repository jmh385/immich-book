/**
 * Minimal dependency-free PDF writer for the example book.
 *
 * The app itself renders PDFs with @react-pdf/renderer; that package is ESM
 * only and cannot be loaded by Jest, so the example test uses this writer to
 * produce a real, openable PDF with the layout boxes and captions. It is not
 * part of the shipped app bundle.
 */

export interface ExamplePhotoRect {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  /** 0-255 RGB fill color. */
  color: [number, number, number];
}

export interface ExamplePageSpec {
  width: number;
  height: number;
  rects: ExamplePhotoRect[];
  /** Automatic group caption, drawn at the bottom like the app does. */
  caption?: string;
  footer?: string;
}

/** Escape text for a PDF string literal and drop non-Latin-1 characters. */
function pdfText(text: string): string {
  return text
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/** Approximate centered text placement for the base Helvetica font. */
function textCommand(
  text: string,
  centerX: number,
  baselineY: number,
  size: number,
): string {
  const estimatedWidth = text.length * size * 0.5;
  return `BT /F1 ${size} Tf ${(centerX - estimatedWidth / 2).toFixed(2)} ${baselineY.toFixed(2)} Td (${pdfText(text)}) Tj ET`;
}

/** PDF coordinates have their origin at the bottom left. */
function flipY(y: number, height: number): number {
  return height - y;
}

export function renderExamplePdf(pages: ExamplePageSpec[]): Buffer {
  const objects: string[] = [];

  // 1: catalog, 2: page tree, then two objects per page (page + contents).
  const pageObjectNumbers = pages.map((_, index) => 3 + index * 2);

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Kids [${pageObjectNumbers
      .map((number) => `${number} 0 R`)
      .join(" ")}] /Count ${pages.length} >>`,
  );

  pages.forEach((page, index) => {
    const contentObjectNumber = pageObjectNumbers[index] + 1;

    const commands: string[] = [];
    for (const rect of page.rects) {
      const [r, g, b] = rect.color;
      const bottom = flipY(rect.y + rect.height, page.height);
      // Fill, then a thin gray border.
      commands.push(
        `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} rg`,
      );
      commands.push(
        `${rect.x.toFixed(2)} ${bottom.toFixed(2)} ${rect.width.toFixed(2)} ${rect.height.toFixed(2)} re f`,
      );
      commands.push("0.6 0.6 0.6 RG 0.5 w");
      commands.push(
        `${rect.x.toFixed(2)} ${bottom.toFixed(2)} ${rect.width.toFixed(2)} ${rect.height.toFixed(2)} re S`,
      );
      commands.push(
        textCommand(
          rect.label,
          rect.x + rect.width / 2,
          bottom + rect.height / 2 - 4,
          Math.min(9, Math.max(5, rect.height / 8)),
        ),
      );
    }

    if (page.caption) {
      commands.push(textCommand(page.caption, page.width / 2, 24, 10));
    }
    if (page.footer) {
      commands.push(textCommand(page.footer, page.width - 60, 14, 7));
    }

    const content = commands.join("\n");

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width.toFixed(
        2,
      )} ${page.height.toFixed(2)}] /Resources << /Font << /F1 ${
        3 + pages.length * 2
      } 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    );
  });

  // Font object at the end so page objects can reference it by number.
  objects.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}
