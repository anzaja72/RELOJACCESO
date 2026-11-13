#!/usr/bin/env python3
"""Arma el Excel del corte de nómina a partir de la respuesta JSON de la herramienta horas_nomina de Reloj CR.

Uso:  python3 corte_nomina.py corte.json corte.xlsx
      (sin openpyxl escribe corte.csv y corte-pendientes.csv)

Hojas: «Corte» (una fila por empleado, horas por categoría y novedades), «Pendientes» (lo que hay que
resolver antes de enviar a nómina) y «Notas» (período y criterios). No lleva salarios ni valores.
"""
import csv, json, sys
from datetime import datetime

ORDEN = ["ord_dia", "ord_noche", "ord_dom_dia", "ord_dom_noche", "ext_dia", "ext_noche", "ext_dom_dia", "ext_dom_noche"]


def pendientes(e):
    out = []
    for d in e.get("trabajo_sin_turno_aprobado") or []:
        out.append(("Trabajó sin turno aprobado", d, "Sus horas cuentan como extra hasta que el regional apruebe el cronograma o se justifique."))
    for d in e.get("ausencias_por_revisar") or []:
        out.append(("Ausencia por revisar", d, "Tenía turno aprobado y no marcó: confirmar si es justificada (incapacidad, permiso) o descontable."))
    for w in e.get("horas_adicionales") or []:
        if str(w.get("estado")) != "aprobada":
            out.append(("Horas adicionales sin aprobar", w.get("semana"), f"Exceso de {w.get('exceso')} en la semana; estado: {w.get('estado')}. No liquidar hasta que el regional apruebe."))
    if e.get("incidencias_de_marcacion"):
        out.append(("Incidencias de marcación", "", f"{e['incidencias_de_marcacion']} marca(s) incompletas o repetidas: revisar en Horas antes de cerrar."))
    return out


def filas(data):
    cats = data.get("categorias") or {}
    cab = ["Código", "Cédula", "Nombre", "Tienda", "Tipo de jornada", "Horas trabajadas"] + [cats.get(k, k) for k in ORDEN] + [
        "Días con tardanza", "Minutos tarde", "Días almuerzo excedido", "Minutos de almuerzo excedido",
        "Ausencias por revisar", "Novedades (días)", "Horas adicionales (semana: estado)", "Pendientes",
    ]
    rows = []
    for e in sorted(data["empleados"], key=lambda x: (x.get("tienda") or "", x.get("empleado") or "")):
        h = e.get("horas") or {}
        t = e.get("tardanzas") or {}
        a = e.get("almuerzo_excedido") or {}
        rows.append([
            e.get("codigo"), e.get("cedula"), e.get("empleado"), e.get("tienda"), e.get("tipo_jornada"), e.get("horas_trabajadas", 0),
            *[h.get(k, 0) for k in ORDEN],
            t.get("dias", 0), t.get("minutos", 0), a.get("dias", 0), a.get("minutos", 0),
            ", ".join(e.get("ausencias_por_revisar") or []),
            ", ".join(f"{k}: {v}" for k, v in (e.get("novedades_dias") or {}).items()),
            ", ".join(f"{w.get('semana')}: {w.get('exceso')} {w.get('estado')}" for w in e.get("horas_adicionales") or []),
            len(pendientes(e)),
        ])
    pend = [[e.get("codigo"), e.get("empleado"), e.get("tienda"), *p] for e in data["empleados"] for p in pendientes(e)]
    return cab, rows, pend


def main(src, dst):
    data = json.load(open(src, encoding="utf-8"))
    cab, rows, pend = filas(data)
    periodo = data.get("periodo", {})
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Font, PatternFill
        from openpyxl.utils import get_column_letter
    except ImportError:
        base = dst.rsplit(".", 1)[0]
        with open(f"{base}.csv", "w", newline="", encoding="utf-8-sig") as f:
            csv.writer(f).writerows([cab, *rows])
        with open(f"{base}-pendientes.csv", "w", newline="", encoding="utf-8-sig") as f:
            csv.writer(f).writerows([["Código", "Empleado", "Tienda", "Pendiente", "Fecha", "Qué hacer"], *pend])
        print(f"Sin openpyxl: escribí {base}.csv y {base}-pendientes.csv")
        return
    wb = Workbook()
    head = PatternFill("solid", fgColor="C27BA0")
    ws = wb.active
    ws.title = "Corte"
    ws.append(cab)
    for r in rows:
        ws.append(r)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = head
        c.alignment = Alignment(wrap_text=True, vertical="center")
    alerta = PatternFill("solid", fgColor="FDE2E2")
    for row in ws.iter_rows(min_row=2):
        if row[-1].value:
            for c in row:
                c.fill = alerta
    for i in range(1, len(cab) + 1):
        ws.column_dimensions[get_column_letter(i)].width = 16 if i > 5 else 22
    ws.freeze_panes = "D2"
    ws.row_dimensions[1].height = 48
    wp = wb.create_sheet("Pendientes")
    wp.append(["Código", "Empleado", "Tienda", "Pendiente", "Fecha", "Qué hacer"])
    for p in pend:
        wp.append(p)
    for c in wp[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = head
    for col, w in zip("ABCDEF", (10, 32, 18, 30, 14, 90)):
        wp.column_dimensions[col].width = w
    wn = wb.create_sheet("Notas")
    for linea in [
        ["Corte de nómina", f"{periodo.get('desde')} a {periodo.get('hasta')}"],
        ["Generado", datetime.now().strftime("%Y-%m-%d %H:%M")],
        ["Fuente", "Reloj CR (horas_nomina): marcaciones contra el cronograma aprobado de cada día"],
        ["Horas", "En decimales (7,5 = 7 h 30 min). Nocturna desde las 19:00 (Ley 2466 de 2025); dominicales y festivos de Colombia."],
        ["Sin valores", "No incluye salarios ni valores: los liquida el sistema de nómina."],
        ["Pendientes", f"{len(pend)} punto(s) por resolver antes de enviar (hoja Pendientes)."],
    ]:
        wn.append(linea)
    wn.column_dimensions["A"].width = 16
    wn.column_dimensions["B"].width = 110
    wb.save(dst)
    print(f"Escribí {dst}: {len(rows)} empleado(s), {len(pend)} pendiente(s)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("Uso: python3 corte_nomina.py corte.json corte.xlsx")
    main(sys.argv[1], sys.argv[2])
