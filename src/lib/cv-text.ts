import "server-only";

/** Extract plain text from an uploaded CV (PDF, DOCX, TXT/MD). */
export async function extractCvText(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buf });
    try {
      const res = await parser.getText();
      return res.text;
    } finally {
      await parser.destroy();
    }
  }
  if (name.endsWith(".docx") || file.type.includes("officedocument.wordprocessingml")) {
    const mammoth = await import("mammoth");
    const res = await mammoth.extractRawText({ buffer: buf });
    return res.value;
  }
  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
    return buf.toString("utf8");
  }
  throw new Error("Unsupported file type. Please upload a PDF or DOCX.");
}
