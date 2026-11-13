"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setStoreKiosk } from "@/lib/terminal";

// Enlace para las tablets de tienda: deja el navegador en modo kiosco de tienda y abre /kiosk,
// que en ese modo solo muestra el ingreso del kiosco o la captura (y funciona sin internet).
export default function KioscoPage() {
  const router = useRouter();
  useEffect(() => {
    setStoreKiosk();
    router.replace("/kiosk");
  }, [router]);
  return <div className="kiosk-standalone p-8">Abriendo kiosco…</div>;
}
