import { access, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";

const files = [
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model.bin",
  "face_landmark_68_model-weights_manifest.json",
  "face_landmark_68_model.bin",
  "face_recognition_model-weights_manifest.json",
  "face_recognition_model.bin",
];

const dest = path.join(process.cwd(), "public", "models");
const bases = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/",
  "https://unpkg.com/@vladmandic/face-api@1.7.15/model/",
];

await mkdir(dest, { recursive: true });

for (const file of files) {
  const out = path.join(dest, file);
  try {
    await access(out);
    continue;
  } catch {
    /* download */
  }
  let ok = false;
  for (const base of bases) {
    try {
      const res = await fetch(base + file);
      if (!res.ok) throw new Error(String(res.status));
      await pipeline(Readable.fromWeb(res.body), createWriteStream(out));
      ok = true;
      break;
    } catch {
      /* try next mirror */
    }
  }
  if (!ok) {
    console.error(`No se pudo descargar ${file}`);
    process.exit(1);
  }
  console.log("descargado", file);
}
