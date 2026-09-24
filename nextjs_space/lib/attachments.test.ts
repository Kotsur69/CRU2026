import { describe, expect, it } from "vitest";
import { contentDisposition, fileKind, formatBytes, isInlineRenderable } from "./attachments";

describe("attachment rules", () => {
  it("normalises legacy's free-text file types on read", () => {
    expect(fileKind("PDF")).toBe("pdf");
    expect(fileKind(" Docx ")).toBe("word");
    expect(fileKind("umowy zlecenia")).toBe("other");
    expect(fileKind(null)).toBe("other");
  });

  it("renders inline only PDFs and images — never saved HTML or an executable", () => {
    expect(isInlineRenderable("PDF")).toBe(true);
    expect(isInlineRenderable("png")).toBe(true);
    for (const t of ["htm", "html", "mht", "exe", "docx", "msg"]) {
      expect(isInlineRenderable(t)).toBe(false);
    }
  });

  it("formats sizes the Polish way", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1,5 kB");
    expect(formatBytes(1_258_291)).toBe("1,2 MB");
  });

  it("keeps a Polish filename in the UTF-8 form and an ASCII fallback", () => {
    const header = contentDisposition("attachment", "Umowa łączna.pdf");
    expect(header).toContain('attachment; filename="Umowa __czna.pdf";');
    expect(header).toContain("filename*=UTF-8''Umowa%20%C5%82%C4%85czna.pdf");
  });
});
