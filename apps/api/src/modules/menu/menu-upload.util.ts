import {
  assertImageUploadFile,
  type ImageUploadFile,
} from '../../common/image-media.util';

export type MenuImageUpload = ImageUploadFile;

export function assertMenuImageFile(file: MenuImageUpload | undefined) {
  assertImageUploadFile(file, 'Menu image');
}
