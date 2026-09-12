"use client";

import { useEffect, useRef, useState } from "react";
import { CameraOff } from "lucide-react";
import { detectAllBoxes, detectFace, type FaceCapture } from "@/lib/face";

export function WebcamPanel({
  ready,
  onReadyChange,
  error,
  onError,
  hint,
}: {
  ready: boolean;
  onReadyChange: (ready: boolean) => void;
  error: string | null;
  onError: (message: string | null) => void;
  hint?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 720 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraOn(true);
        onError(null);
      } catch {
        onError(
          "No se pudo abrir la cámara. Permita getUserMedia en Chrome/Chromium (HTTPS o localhost).",
        );
        setCameraOn(false);
      }
    }
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onError]);

  useEffect(() => {
    let timer = 0;
    let running = true;
    async function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (ready) {
            const boxes = await detectAllBoxes(video);
            ctx.strokeStyle = "#7CFFB2";
            ctx.lineWidth = 4;
            for (const box of boxes) {
              ctx.strokeRect(box.x, box.y, box.width, box.height);
            }
          }
        }
      }
      if (running) timer = window.setTimeout(tick, 280);
    }
    void tick();
    return () => {
      running = false;
      window.clearTimeout(timer);
    };
  }, [ready]);

  return (
    <div className="camera-frame">
      <video
        ref={videoRef}
        className="camera-video"
        playsInline
        muted
        autoPlay
      />
      <canvas ref={canvasRef} className="camera-overlay" />
      <div className="face-guide" aria-hidden />
      {!cameraOn && (
        <div className="camera-empty">
          <CameraOff className="size-10" />
          <p>{error || "Esperando cámara…"}</p>
        </div>
      )}
      <div className="camera-meta">
        <span>{ready ? "Modelos listos" : "Cargando modelos faciales…"}</span>
        {hint ? <span>{hint}</span> : null}
      </div>
    </div>
  );
}

export async function captureFromVideo(video: HTMLVideoElement | null) {
  if (!video) return null;
  return detectFace(video);
}

export function getVideoElement(root: HTMLElement | null): HTMLVideoElement | null {
  return root?.querySelector("video") ?? null;
}

export type { FaceCapture };
