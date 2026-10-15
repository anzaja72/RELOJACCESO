import assert from "node:assert/strict";
import { extractWidgets } from "../src/lib/ai-widgets.ts";

const r = extractWidgets(
  'Resumen: 17 % llegó tarde.\n<ui-widget>{"type":"bar_chart","title":"Tarde por sede","unit":"%","items":[{"label":"R01","value":14.6},{"label":"R02","value":"14,1"}]}</ui-widget>\n```json\n<ui-widget>{"type":"kpi_cards","items":[{"label":"Tarde","value":"155","tone":"warn"}]}</ui-widget>\n```\n<ui-widget>{no es json}</ui-widget>\n<ui-widget>{"type":"script","title":"x"}</ui-widget>',
);
assert.equal(r.widgets.length, 2);
assert.equal(r.widgets[0].items[1].value, 14.1);
assert.equal(r.widgets[1].items[0].tone, "warn");
assert.ok(!r.text.includes("ui-widget") && !r.text.includes("```"));
assert.equal(r.text, "Resumen: 17 % llegó tarde.");
// Un gráfico de línea necesita al menos dos puntos; una tabla, dos columnas.
assert.equal(extractWidgets('<ui-widget>{"type":"line_chart","title":"t","points":[{"label":"a","value":1}]}</ui-widget>').widgets.length, 0);
assert.equal(extractWidgets('<ui-widget>{"type":"comparison_table","title":"t","columns":["a"],"rows":[["1"]]}</ui-widget>').widgets.length, 0);
console.log("ai-widgets.test.mjs ok");
