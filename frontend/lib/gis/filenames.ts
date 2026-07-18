export function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-");
}
