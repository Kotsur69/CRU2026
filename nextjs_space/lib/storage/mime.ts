import path from "path";

/** Content types for the extensions actually present in the Bytom export. */
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  docm: "application/vnd.ms-word.document.macroEnabled.12",
  dotx: "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsb: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  msg: "application/vnd.ms-outlook",
  oft: "application/vnd.ms-outlook",
  eml: "message/rfc822",
  rtf: "application/rtf",
  txt: "text/plain; charset=utf-8",
  htm: "text/html; charset=utf-8",
  html: "text/html; charset=utf-8",
  mht: "message/rfc822",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  tif: "image/tiff",
  zip: "application/zip",
  "7z": "application/x-7z-compressed",
};

export function mimeFor(filename: string): string {
  const ext = path.extname(filename).slice(1).toLowerCase();
  return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}
