// Minimal type shim for the CommonJS docxtemplater image module.
// We treat the constructed module as `unknown` from docxtemplater's perspective
// because its public Modules<T> generic is loose.

declare module "docxtemplater-image-module-free" {
  interface ImageModuleOptions {
    centered?: boolean;
    fileType?: "docx" | "pptx";
    getImage: (tagValue: unknown, tagName: string) => Buffer | Uint8Array;
    getSize: (
      img: Buffer | Uint8Array,
      tagValue: unknown,
      tagName: string,
    ) => [number, number];
  }

  class ImageModule {
    constructor(options: ImageModuleOptions);
  }

  export default ImageModule;
}
