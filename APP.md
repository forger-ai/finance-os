# APP

## Identidad
- id: finance-os-lite
- nombre: FinanceOS Lite
- version: 0.1.0
- tipo: app de finanzas personales local

## Objetivo funcional
Ayudar a una persona a revisar y ordenar sus movimientos financieros.
Permite importar movimientos, clasificarlos por categoria/subcategoria y revisar avances de limpieza de datos.

## Usuario objetivo
- Usuario no tecnico que quiere entender y ordenar gastos/ingresos.
- Prioriza claridad en el flujo y seguridad sobre cambios de datos.

## Stack
- Backend: Python 3.12 + FastAPI + SQLModel + SQLite + uv
- Frontend: Vite + React + MUI

## Servicios
- Backend HTTP
  - base: `http://localhost:8000`
  - docs: `/docs`
  - health: `/health`
- Frontend HTTP
  - base: `http://localhost:5180`

## Endpoints API clave
### Salud
- `GET /health`

### Movimientos
- `GET /api/movements`
- `POST /api/movements`
- `PATCH /api/movements/{movement_id}`
- `DELETE /api/movements/{movement_id}`
- `GET /api/summary`

### Categorias y subcategorias
- `GET /api/categories`
- `POST /api/categories`
- `PATCH /api/categories/{category_id}`
- `DELETE /api/categories/{category_id}`
- `POST /api/categories/{category_id}/move-subcategories`
- `POST /api/subcategories`
- `PATCH /api/subcategories/{subcategory_id}`
- `DELETE /api/subcategories/{subcategory_id}`
- `POST /api/subcategories/{subcategory_id}/move-movements`

### Importacion
- `POST /api/imports/movements-csv`

## Flujos funcionales principales
1. Cargar movimientos desde CSV.
2. Revisar y corregir categoria/subcategoria en movimientos.
3. Marcar movimientos revisados.
4. Revisar resumen general (`/api/summary`).
5. Ajustar catalogo de categorias/subcategorias sin dejar datos huerfanos.

## Reglas funcionales importantes
- No eliminar categorias/subcategorias con movimientos asociados sin mover datos primero.
- Evitar cambios masivos irreversibles sin confirmacion.
- Respetar validaciones de nombre y consistencia de relaciones.

## Scripts utiles (backend)
- `init_db`
- `seed`
- `list_categories`
- `list_movements`
- `import_movements`
- `upsert_categories`
- `edit_movement`
- `delete_movement`
- `verify`

## Notas para agentes
- Explicar cambios en lenguaje simple, orientado a impacto para usuario no tecnico.
- Para cambios de datos, priorizar integridad y posibilidad de rollback.
- Si hay ambiguedad funcional, preguntar objetivo de negocio, no detalles de implementacion.
