import {
  FACE_MIN_BOX_RATIO,
  FACE_MIN_SCORE,
  MATCH_THRESHOLD,
} from "@/lib/config";

export type FaceCapture = {
  descriptor: number[];
  score: number;
  boxRatio: number;
  landmarks: number[][];
};

export type LivenessHint = {
  ok: boolean;
  reason: string;
  verdict: "pass" | "fail" | "skipped";
};

let modelsReady = false;
let modelsLoading: Promise<void> | null = null;

type FaceApi = typeof import("@vladmandic/face-api");

async function faceApi(): Promise<FaceApi> {
  return import("@vladmandic/face-api");
}

export async function loadFaceModels() {
  if (modelsReady) return;
  if (!modelsLoading) {
    modelsLoading = (async () => {
      const faceapi = await faceApi();
      const tf = faceapi.tf as unknown as {
        setBackend: (name: string) => Promise<boolean>;
        ready: () => Promise<void>;
      };
      try {
        await tf.setBackend("webgl");
        await tf.ready();
      } catch {
        await tf.setBackend("cpu");
        await tf.ready();
      }
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
        faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
        faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
      ]);
      modelsReady = true;
    })();
  }
  await modelsLoading;
}

export async function detectFace(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
): Promise<FaceCapture | null> {
  await loadFaceModels();
  const faceapi = await faceApi();
  const detection = await faceapi
    .detectSingleFace(
      input,
      new faceapi.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: FACE_MIN_SCORE,
      }),
    )
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!detection) return null;
  const { width, height } = "videoWidth" in input
    ? { width: input.videoWidth || 640, height: input.videoHeight || 480 }
    : { width: input.width, height: input.height };
  const box = detection.detection.box;
  const boxRatio = (box.width * box.height) / Math.max(width * height, 1);
  return {
    descriptor: Array.from(detection.descriptor),
    score: detection.detection.score,
    boxRatio,
    landmarks: detection.landmarks.positions.map((p) => [p.x, p.y]),
  };
}

export async function detectAllBoxes(
  input: HTMLVideoElement,
): Promise<Array<{ x: number; y: number; width: number; height: number; score: number }>> {
  if (!modelsReady) return [];
  const faceapi = await faceApi();
  const detections = await faceapi.detectAllFaces(
    input,
    new faceapi.TinyFaceDetectorOptions({
      inputSize: 224,
      scoreThreshold: 0.4,
    }),
  );
  return detections.map((d) => ({
    x: d.box.x,
    y: d.box.y,
    width: d.box.width,
    height: d.box.height,
    score: d.score,
  }));
}

function eyeAspect(points: number[][], idxs: number[]) {
  const [p1, p2, p3, p4, p5, p6] = idxs.map((i) => points[i]);
  const dist = (a: number[], b: number[]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1]);
  return (dist(p2, p6) + dist(p3, p5)) / (2 * dist(p1, p4) + 1e-6);
}

export function livenessHint(
  first: FaceCapture,
  second: FaceCapture | null,
): LivenessHint {
  if (first.score < FACE_MIN_SCORE) {
    return {
      ok: false,
      reason: "La cámara no ve el rostro con suficiente nitidez.",
      verdict: "fail",
    };
  }
  if (first.boxRatio < FACE_MIN_BOX_RATIO) {
    return {
      ok: false,
      reason: "Acérquese a la cámara. El rostro debe llenar el óvalo.",
      verdict: "fail",
    };
  }
  if (!second) {
    return {
      ok: true,
      reason: "Comprobación DEMO básica (sin PAD de producción).",
      verdict: "skipped",
    };
  }
  const left = eyeAspect(first.landmarks, [36, 37, 38, 39, 40, 41]);
  const right = eyeAspect(first.landmarks, [42, 43, 44, 45, 46, 47]);
  const left2 = eyeAspect(second.landmarks, [36, 37, 38, 39, 40, 41]);
  const right2 = eyeAspect(second.landmarks, [42, 43, 44, 45, 46, 47]);
  const earDelta = Math.abs((left + right) / 2 - (left2 + right2) / 2);
  const nose = first.landmarks[30];
  const nose2 = second.landmarks[30];
  const motion = nose && nose2 ? Math.hypot(nose[0] - nose2[0], nose[1] - nose2[1]) : 0;
  if (earDelta < 0.01 && motion < 1.2) {
    return {
      ok: false,
      reason: "Parece una foto fija. Mueva un poco la cabeza o parpadee (DEMO).",
      verdict: "fail",
    };
  }
  return {
    ok: true,
    reason: "Indicio de presencia viva (heurística DEMO, no PAD).",
    verdict: "pass",
  };
}

export { MATCH_THRESHOLD };
