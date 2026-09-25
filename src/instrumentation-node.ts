import { productionSecretErrors } from "@/lib/secrets";

// Falla al arrancar, no en la primera petición, si faltan secretos de producción.
const errors = productionSecretErrors();
if (errors.length > 0) {
  console.error(
    [
      "Reloj CR no arranca: faltan secretos de producción.",
      ...errors.map((e) => `  - ${e}`),
      "Vea .env.example y docs/RENDER.md.",
    ].join("\n"),
  );
  process.exit(1);
}
