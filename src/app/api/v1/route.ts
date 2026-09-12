import { APP } from "@/lib/config";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export function GET(request: Request) {
  return json(
    {
      name: APP.name,
      edition: APP.edition,
      rfp: APP.rfp,
      version: "1.0.0",
      sandbox: process.env.SANDBOX === "true",
      docs: "/api/v1/openapi",
      openapi: "/openapi.yaml",
      auth: {
        apiKey: "X-API-Key o Authorization: Bearer <DEMO_API_KEY>",
        jwt: "POST /api/v1/auth/login → Bearer JWT",
        oidc: "GET /api/v1/auth/oidc (stub listo para IdP empresarial)",
      },
    },
    200,
    request,
  );
}
