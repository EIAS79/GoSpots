import {
  assertImageUploadFile,
  type ImageUploadFile,
} from '../../common/image-media.util';

export type GalleryImageUpload = ImageUploadFile;

export function assertGalleryImageFile(file: GalleryImageUpload | undefined) {
  assertImageUploadFile(file, 'Gallery image');
}
