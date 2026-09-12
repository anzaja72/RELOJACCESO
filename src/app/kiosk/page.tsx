import { Suspense } from "react";
import { KioskClient } from "./kiosk-client";

export default function KioskPage() {
  return (
    <Suspense fallback={<div className="kiosk-skin p-8">Cargando kiosco…</div>}>
      <KioskClient />
    </Suspense>
  );
}
