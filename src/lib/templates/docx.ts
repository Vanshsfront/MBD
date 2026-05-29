// MBD Clinic OS — DOCX template rendering (PRD §6.1).
//
// Loads a template DOCX from /templates, fills {{placeholder}} markers with
// data via docxtemplater, and returns the .docx bytes.
//
// NOTE: server-side PDF conversion (LibreOffice/soffice) was removed — it
// cannot run on Vercel's serverless runtime. Documents are served as .docx.
// To re-introduce PDF, add a converter that works off-Vercel (e.g. a
// Gotenberg sidecar called over HTTP) rather than shelling out to soffice.

import { promises as fs } from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
// Image module: lets us embed PNG signatures via {{%signature}} placeholders.
// CommonJS package — keep `require` style import for compatibility.
import ImageModule from "docxtemplater-image-module-free";

import { DOCX_TEMPLATES, type DocxTemplateKey } from "@/lib/templates/keys";

const TEMPLATES_ROOT = path.join(process.cwd(), "templates");

/**
 * Flatten a nested object so docxtemplater's default key-lookup parser can
 * resolve dot-notation placeholders like `{{patient.name}}`. Arrays and
 * scalar leaves are kept as-is (arrays remain accessible as `key` for loops).
 */
function flatten(
  data: Record<string, unknown>,
  prefix = "",
  out: Record<string, unknown> = {},
): Record<string, unknown> {
  for (const [k, v] of Object.entries(data)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      // Keep the array itself so docxtemplater loops can iterate it…
      out[fullKey] = v;
      // …and also flatten by index so `{{key.0.field}}` resolves directly.
      v.forEach((item, idx) => {
        const indexedKey = `${fullKey}.${idx}`;
        if (item !== null && typeof item === "object" && !(item instanceof Date)) {
          flatten(item as Record<string, unknown>, indexedKey, out);
        } else {
          out[indexedKey] = item;
        }
      });
      continue;
    }
    if (v !== null && typeof v === "object" && !(v instanceof Date)) {
      flatten(v as Record<string, unknown>, fullKey, out);
    } else {
      out[fullKey] = v;
    }
  }
  return out;
}

/**
 * Decode a signature data URL ("data:image/png;base64,…") into raw bytes for
 * the docxtemplater image module. Falls back to an empty 1×1 PNG when the
 * value is missing or malformed so renders never crash because a signature
 * isn't on file yet.
 */
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
function decodeSignature(value: unknown): Buffer {
  if (typeof value !== "string" || value.length === 0) return TRANSPARENT_PNG;
  const m = /^data:image\/(?:png|jpe?g);base64,(.+)$/.exec(value);
  if (!m) return TRANSPARENT_PNG;
  try {
    return Buffer.from(m[1]!, "base64");
  } catch {
    return TRANSPARENT_PNG;
  }
}

/**
 * Configures the image module. Templates use `{{%signature}}` (or any other
 * key starting with `%`) — the value should be a data-URL PNG/JPEG; we
 * decode it and embed at the configured size.
 *
 * docxtemplater's Module type isn't exported in its public d.ts, so we cast
 * via a narrow `unknown` bridge — the runtime contract is enforced by
 * docxtemplater-image-module-free itself.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildImageModule(): any {
  return new ImageModule({
    centered: false,
    fileType: "docx",
    getImage: (tagValue: unknown): Buffer => decodeSignature(tagValue),
    getSize: (): [number, number] => [180, 60],
  });
}

/**
 * Render a DOCX template with `data`. Returns the byte Buffer of the produced
 * .docx. The template is opened fresh on each call so concurrent renders do
 * not stomp on each other.
 */
export async function renderDocxTemplate(
  key: DocxTemplateKey,
  data: Record<string, unknown>,
): Promise<Buffer> {
  const filename = DOCX_TEMPLATES[key];
  const fullPath = path.join(TEMPLATES_ROOT, filename);
  const content = await fs.readFile(fullPath);

  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    nullGetter: () => "",
    modules: [buildImageModule()],
  });

  doc.render(flatten(data));

  const out = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
  return out;
}
