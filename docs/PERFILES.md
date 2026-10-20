# Perfiles de Reloj CR: qué ve y qué puede hacer cada uno

Cada usuario tiene un **perfil** (qué puede hacer) y un **alcance** (de qué sedes ve datos). Fuera de su alcance, una persona o una sede "no existe" para el usuario.

| Perfil | Alcance | En una frase |
|---|---|---|
| **Superadmin** | Todas las regiones y sedes | Administra todo: estructura, ajustes, marca y usuarios |
| **Gerente de zona** | Las sedes de su región | Opera y supervisa su región; no cambia la configuración |
| **Gerente de sede** | Solo su sede | Opera y supervisa su restaurante |
| **Operador de kiosco** | Solo su sede | Da de alta personas, activa tablets y atiende el kiosco; sin dinero ni auditoría |
| **Auditor** | Todas las sedes, solo lectura | Revisa y exporta; no modifica nada |

## Qué ve cada uno

| Dato o pantalla | Superadmin | Zona | Sede | Operador | Auditor |
|---|---|---|---|---|---|
| Personas y marcaciones | Todas | Su región | Su sede | Su sede | Todas |
| Reportes y panel del mes | Sí | Su región | Su sede | Su sede | Todas |
| Horas de cada trabajador | Sí | Sí | Sí | Sí | Sí |
| **Sueldos y valores en dinero** | Sí | Sí | Sí | **No** | Sí |
| Auditoría e integridad del registro | Todo | Su región | Su sede | **No** | Todo |
| IAnálisis | Sí | Su región | Su sede | Su sede | Todas |
| Ajustes | Sí, edita | Solo lectura | Solo lectura | Solo lectura | Solo lectura |
| Lista de usuarios | Sí | No | No | No | No |

## Qué puede hacer cada uno

| Acción | Superadmin | Zona | Sede | Operador | Auditor |
|---|---|---|---|---|---|
| Crear persona y capturar rostro | Sí | Sí | Sí | Sí | No |
| Activar un terminal (tablet) | Sí | Sí | Sí | Sí | No |
| Corregir una marca | Sí | Sí | Sí | No | No |
| Registrar una excepción (justificar una ausencia) | Sí | Sí | Sí | No | No |
| Fijar sueldo y asignar turnos | Sí | Sí | Sí | No | No |
| Exportar y descargar expediente PDF | Sí | Sí | Sí | No | Sí |
| Revocar una tablet | Sí | Sí | Sí | No | No |
| Crear o editar regiones y sedes | Sí | No | No | No | No |
| Cambiar ajustes, marca y logo | Sí | No | No | No | No |
| Crear o cambiar el catálogo de turnos | Sí | No | No | No | No |
| Enviar el informe mensual al sistema externo | Sí | No | No | No | No |

## Cosas que conviene saber

- **El menú lateral es igual para todos.** Lo que cambia son los datos y las acciones permitidas: una acción no autorizada muestra un mensaje de permiso, no desaparece del menú.
- **Un kiosco activado marca para quien esté frente a la tablet**, sin importar quién inició sesión en el navegador. El perfil solo importa para activarlo.
- **Un auditor nunca modifica datos**: no crea personas, no captura rostros, no corrige marcas ni cambia ajustes.
- **Cada acción sensible queda en la auditoría** con quién la hizo, sobre quién, en qué sede y cuándo.
- Todos los usuarios de prueba comparten la contraseña del servidor; en un piloto real cada persona debe tener la suya.
