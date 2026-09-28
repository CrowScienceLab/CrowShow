/**
 * Generates a valid multi-slide PDF 1.4 document in memory for instant demonstration.
 * Creates 5 beautifully designed slides with high contrast, modern typography, and graphics.
 */
export function createSamplePdfBytes(): Uint8Array {
  // A clean, valid PDF 1.4 document with 5 presentation slides (16:9 aspect ratio: 960 x 540 pt)
  const slides = [
    {
      title: "Gemini Notebook Slide Player",
      subtitle: "Dedicated Presentation Player for AI & PDF Presentations",
      bullets: [
        "Direct PDF Rendering with Mozilla PDF.js",
        "PowerPoint-grade Pen & Highlighter Annotation",
        "Hardware-Accelerated Slide Transitions",
        "Laser Pointer, Spotlight & Presenter Mode"
      ],
      tag: "OVERVIEW",
      bg: [0.08, 0.12, 0.22],
      accent: [0.24, 0.55, 0.98]
    },
    {
      title: "Modern 5-Layer Architecture",
      subtitle: "Clean separation of original document and presentation layers",
      bullets: [
        "Layer 1: PDF Render Layer (Cached multi-page canvas)",
        "Layer 2: Slide Display Layer (Auto-fit & Zoom/Pan)",
        "Layer 3: Annotation Layer (Vector strokes with normalized coords)",
        "Layer 4: Presentation Effect Layer (Laser trail, Spotlight, Curtains)",
        "Layer 5: Presentation Control Layer (Floating toolbar & HUD)"
      ],
      tag: "ARCHITECTURE",
      bg: [0.10, 0.15, 0.28],
      accent: [0.18, 0.80, 0.65]
    },
    {
      title: "Real-Time Annotation & Stylus",
      subtitle: "Natural handwriting feel with Surface Pen and Touch support",
      bullets: [
        "Smooth Quadratic Bezier Stroke Interpolation",
        "Pen & Semi-transparent Highlighter Modes",
        "Smart Stroke-based Vector Eraser (Hit-testing)",
        "Full Undo / Redo History (Ctrl+Z / Ctrl+Y)",
        "Independent Annotation Storage (.crowshow format)"
      ],
      tag: "PEN TOOLS",
      bg: [0.14, 0.11, 0.25],
      accent: [0.93, 0.35, 0.55]
    },
    {
      title: "Dynamic Slide Transitions",
      subtitle: "Fluid visual flow between slides without delay",
      bullets: [
        "PowerPoint-Style Transitions: Fade, Slide, Zoom, Dissolve",
        "Nearby Slide Preloading (Zero-lag switching)",
        "Interactive Laser Pointer with Glowing Trail",
        "Focus Spotlight for highlighting key concepts",
        "Black (B) & White (W) Curtain shortcuts"
      ],
      tag: "TRANSITIONS",
      bg: [0.09, 0.18, 0.24],
      accent: [0.96, 0.65, 0.18]
    },
    {
      title: "Ready for Your Next Presentation",
      subtitle: "Press F5 to start full-screen slide show anytime",
      bullets: [
        "Drag & drop any PDF from Gemini / NotebookLM / PPT export",
        "Use keyboard arrows, spacebar, or presentation remote",
        "Export annotations or continue seamlessly",
        "Questions & Feedback Welcome!"
      ],
      tag: "GET STARTED",
      bg: [0.12, 0.12, 0.16],
      accent: [0.38, 0.72, 0.98]
    }
  ];

  const pageWidth = 960;
  const pageHeight = 540;

  const objects: { id: number; content: string }[] = [];

  // Helper to add object (IDs 1, 2, 3 are reserved for Catalog, Pages, Font)
  function addObject(content: string): number {
    const id = objects.length + 4;
    objects.push({ id, content });
    return id;
  }

  // Obj 1: Catalog
  // Will reference Pages obj 2
  // We'll prepare font obj
  const fontObjId = 3;

  // Build streams for each page
  const pageObjIds: number[] = [];

  slides.forEach((slide, index) => {
    // Content stream in PostScript PDF syntax
    let stream = "q\n";

    // Background fill
    stream += `${slide.bg[0]} ${slide.bg[1]} ${slide.bg[2]} rg\n`;
    stream += `0 0 ${pageWidth} ${pageHeight} re f\n`;

    // Accent header line
    stream += `${slide.accent[0]} ${slide.accent[1]} ${slide.accent[2]} rg\n`;
    stream += `48 480 ${pageWidth - 96} 4 re f\n`;

    // Category Tag badge
    stream += `48 495 120 22 re f\n`;
    stream += `1 1 1 rg\n`;
    stream += `BT /F1 11 Tf 58 502 Td (${escapePdfText(slide.tag)}) Tj ET\n`;

    // Slide Number badge
    stream += `0.7 0.7 0.7 rg\n`;
    stream += `BT /F1 12 Tf ${pageWidth - 110} 502 Td (Slide ${index + 1} / ${slides.length}) Tj ET\n`;

    // Title
    stream += `1 1 1 rg\n`;
    stream += `BT /F1 32 Tf 48 430 Td (${escapePdfText(slide.title)}) Tj ET\n`;

    // Subtitle
    stream += `0.75 0.82 0.92 rg\n`;
    stream += `BT /F1 16 Tf 48 396 Td (${escapePdfText(slide.subtitle)}) Tj ET\n`;

    // Card background for bullets
    stream += `0 0 0 rg 0.25 w\n`;
    stream += `q 1 1 1 rg 0.05 0.08 0.15 rg 48 80 ${pageWidth - 96} 280 re f Q\n`;
    stream += `0.25 0.35 0.50 RG 1 w 48 80 ${pageWidth - 96} 280 re S\n`;

    // Bullet points
    let yPos = 310;
    slide.bullets.forEach((bullet) => {
      // Bullet dot
      stream += `${slide.accent[0]} ${slide.accent[1]} ${slide.accent[2]} rg\n`;
      stream += `80 ${yPos + 4} 8 8 re f\n`;

      // Bullet text
      stream += `0.92 0.94 0.98 rg\n`;
      stream += `BT /F1 17 Tf 105 ${yPos} Td (${escapePdfText(bullet)}) Tj ET\n`;
      yPos -= 52;
    });

    // Footer
    stream += `0.5 0.55 0.65 rg\n`;
    stream += `BT /F1 11 Tf 48 45 Td (PDF Presentation Player - Interactive Slide Mode) Tj ET\n`;

    stream += "Q\n";

    // Add content stream obj
    const streamObjId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);

    // Add Page obj
    const pageObjId = addObject(`<<
  /Type /Page
  /Parent 2 0 R
  /MediaBox [0 0 ${pageWidth} ${pageHeight}]
  /Contents ${streamObjId} 0 R
  /Resources <<
    /Font << /F1 ${fontObjId} 0 R >>
  >>
>>`);
    pageObjIds.push(pageObjId);
  });

  // Fonts
  const fontObj = `<<
  /Type /Font
  /Subtype /Type1
  /BaseFont /Helvetica-Bold
>>`;

  // Pages obj (obj 2)
  const pagesObj = `<<
  /Type /Pages
  /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}]
  /Count ${pageObjIds.length}
>>`;

  // Catalog obj (obj 1)
  const catalogObj = `<<
  /Type /Catalog
  /Pages 2 0 R
>>`;

  // Assemble all objects in order 1, 2, 3...
  const allObjects = [
    `1 0 obj\n${catalogObj}\nendobj\n`,
    `2 0 obj\n${pagesObj}\nendobj\n`,
    `3 0 obj\n${fontObj}\nendobj\n`,
    ...objects.map((o) => `${o.id} 0 obj\n${o.content}\nendobj\n`),
  ];

  let header = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  let body = "";
  const finalOffsets: number[] = [];

  let currentOffset = header.length;
  for (let i = 0; i < allObjects.length; i++) {
    finalOffsets.push(currentOffset);
    body += allObjects[i];
    currentOffset += allObjects[i].length;
  }

  const xrefOffset = currentOffset;
  let xref = `xref\n0 ${allObjects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 0; i < finalOffsets.length; i++) {
    xref += `${String(finalOffsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  const trailer = `trailer\n<<
  /Size ${allObjects.length + 1}
  /Root 1 0 R
>>
startxref
${xrefOffset}
%%EOF\n`;

  const fullPdfStr = header + body + xref + trailer;
  const bytes = new Uint8Array(fullPdfStr.length);
  for (let i = 0; i < fullPdfStr.length; i++) {
    bytes[i] = fullPdfStr.charCodeAt(i) & 0xff;
  }
  return bytes;
}

function escapePdfText(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
