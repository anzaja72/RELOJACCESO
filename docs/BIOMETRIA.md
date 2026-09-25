# Biometría y PAD — Reloj CR · Oferta software v1

Este documento declara umbrales, pipeline y límites del control facial **en el navegador**. No sustituye un ensayo de laboratorio ni una certificación ISO/IEC 30107 (PAD).

## Pipeline (G01)

1. Cámara vía `getUserMedia` (misma URL en tablet o Chromium en Pi).
2. Detección: TinyFaceDetector (`inputSize` 320, `scoreThreshold` **0.55**).
3. Alineación: Face Landmark 68.
4. Descriptor: FaceRecognitionNet **128-d**.
5. Matching 1:N en el cliente (y `POST /api/identify` como respaldo online).
6. Plantillas cifradas en reposo con AES-256-GCM (`TEMPLATE_KEY`, obligatorio en producción). **No se guardan fotos.**

Modelos servidos desde `/public/models` (~6.8 MB la primera vez).

## Umbrales (código: `src/lib/config.ts`, `src/lib/face.ts`, `src/lib/match.ts`)

| Control | Valor | Efecto |
| --- | --- | --- |
| `FACE_MIN_SCORE` | 0.55 | Rechaza detecciones débiles |
| `FACE_MIN_BOX_RATIO` | 0.16 | El rostro debe ocupar ≥16 % del frame |
| `MATCH_THRESHOLD` | 0.48 | Distancia euclidiana máxima 1:N |
| Cooldown duplicado | 45 s | Misma persona + mismo tipo → `duplicate` |
| Enrolamiento | 2–3 descriptores | Media de galería por colaborador |

## PAD / liveness (pasivo + desafío corto)

Implementación: dos (o tres) capturas ~350–420 ms. Heurística:

- **Parpadeo:** variación del eye-aspect-ratio (EAR) de landmarks 36–47. Se exige `ΔEAR ≥ 0.01` **o**
- **Giro / movimiento:** desplazamiento de la nariz (landmark 30) `≥ 1.2 px`.

Si ambas fallan: se interpreta como foto fija y se ofrece **respaldo PIN de supervisor** (F08), nunca marcación libre.

Veredicto persistido en `punches.liveness_hint`: `pass` | `fail` | `skipped`.

### Lo que esto NO es

- No es PAD certificado (ISO/IEC 30107-3).
- FAR / FRR **no** están medidos en laboratorio. Los umbrales son operativos de PoC browser, documentados para la oferta de software.
- No hay prueba de profundidad, IR ni desafío activo de hardware.

Una oferta productiva debería adjuntar un ensayo de laboratorio independiente y, si el RFP lo exige, un motor PAD de terceros. Reloj CR deja el gancho de software (umbral, bitácora, fallback controlado) listo para sustituir la heurística sin cambiar el kiosco.

## Enrolamiento (F02)

Cada alta o borrado de plantilla escribe `enrollment_audit`:

- marca de tiempo
- operador (usuario JWT o clave API)
- `user-agent` del dispositivo
- sede
- acción: `enroll` | `wipe` | `revoke` | `fallback_pin`

## Baja (S06 / S08)

La baja lógica del colaborador **borra en duro** las plantillas faciales. Revocar consentimiento hace lo mismo.
