import { APP } from "@/lib/config";

export function DemoBanner() {
  return (
    <div className="demo-banner" role="status">
      <strong>DEMO</strong>
      <span>
        {APP.rfp} · Costa Rica · no es un sistema productivo. Sin garantía de
        liveness/PAD ni cifrado E2EE de plantillas.
      </span>
    </div>
  );
}
