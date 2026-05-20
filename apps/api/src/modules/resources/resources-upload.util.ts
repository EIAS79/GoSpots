import {
  assertImageUploadFile,
  type ImageUploadFile,
} from "../../common/image-media.util";

export type ResourceImageUpload = ImageUploadFile;

export function assertResourceImageFile(file: ResourceImageUpload | undefined) {
  assertImageUploadFile(file, "Resource image");
}
