/** Matches API upload limit (compressed server-side before DB storage). */
export const IMAGE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

export const IMAGE_UPLOAD_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,image/avif";

/** @deprecated Use IMAGE_UPLOAD_MAX_BYTES */
export const RESOURCE_IMAGE_MAX_BYTES = IMAGE_UPLOAD_MAX_BYTES;

/** @deprecated Use IMAGE_UPLOAD_ACCEPT */
export const RESOURCE_IMAGE_ACCEPT = IMAGE_UPLOAD_ACCEPT;

const ALLOWED_TYPES = new Set(IMAGE_UPLOAD_ACCEPT.split(","));

export function formatImageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateImageUploadFile(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) {
    return "Use JPEG, PNG, WebP, GIF, or AVIF.";
  }
  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    return `Image is too large (${formatImageSize(file.size)}). Maximum upload is ${formatImageSize(IMAGE_UPLOAD_MAX_BYTES)}.`;
  }
  return null;
}

/** @deprecated Use validateImageUploadFile */
export function validateResourceImageFile(file: File): string | null {
  return validateImageUploadFile(file);
}
