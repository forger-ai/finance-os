# AGENTS

## Qué es este proyecto

`FinanceOS Lite` es la versión liviana de FinanceOS: una herramienta personal para registrar, revisar y reclasificar movimientos financieros con apoyo de agentes.

No es una aplicación de producción generalista. No está diseñada como producto multiusuario, ni como servicio expuesto públicamente, ni con supuestos de alta escala.

Si el usuario no ha instalado nada aún, puedes guiarlo usando `BOOTSTRAP.md`.

## Stack actual

- **Backend**: Python 3.12, FastAPI, SQLModel, SQLite (volumen local), `uv`.
- **Frontend**: TypeScript, React 18, Vite, MUI.
- **Empaquetado opcional**: Docker Compose (servicio `backend` + servicio `frontend`).

## Supuesto operativo

El sistema vive en un computador personal o en un servidor dedicado del dueño. El flujo principal esperado es:

1. Un humano entrega imágenes, capturas, PDFs, estados de cuenta o cualquier otro formato al agente.
2. El agente interpreta la fuente.
3. El agente transforma esa información a CSV estructurado.
4. El agente usa la skill del repo, que está basada en CSV.
5. El agente carga o corrige movimientos en la base de datos vía `scripts/import_movements.py` o el endpoint `POST /api/imports/movements-csv`.
6. El humano revisa la clasificación y la fecha contable en la UI.

La entrada no está limitada por el proyecto. La única limitación real es la capacidad del agente para interpretar el material fuente.

## Regla importante para agentes

- El agente puede leer cualquier formato que sea capaz de interpretar.
- Pero para interactuar con el flujo del repo debe convertir la información a CSV.
- La skill de este proyecto está pensada para trabajar sobre CSV, no sobre PDFs o imágenes directamente.

## Cómo deben pensar los agentes sobre este repo

- Priorizar pragmatismo sobre complejidad de producto.
- No introducir arquitectura enterprise innecesaria.
- No asumir múltiples usuarios, roles o permisos si no se piden explícitamente.
- Favorecer flujos simples, auditables y fáciles de corregir manualmente.
- Mantener el proyecto operable por una sola persona.

## Modelo mental de datos

- `date`: fecha raw/original del movimiento.
- `accountingDate`: fecha contable usada para período, dashboard y reportes.
- La fecha raw se usa para detectar posibles duplicados en importación.
- La fecha contable define dónde cae el movimiento en el análisis mensual.
- Los montos se almacenan internamente como **enteros en cents** para evitar errores de precisión, pero la API y la UI los manejan como pesos (float).

## Restricciones de diseño

- La UI debe ser utilitaria y rápida de corregir.
- La app puede apoyarse en agentes para tareas semiestructuradas.
- Las acciones destructivas deben ser claras.
- Si hay movimientos asociados, no se debe permitir eliminar categorías o subcategorías.

## Qué evitar

- Features de producto tipo onboarding, billing, auth compleja o colaboración en tiempo real.
- Complejidad operativa que no aporte al uso personal.
- Automatismos opacos que dificulten depuración o revisión manual.
- Recuperar el stack viejo (Next.js, Prisma, PostgreSQL) salvo que el usuario lo pida explícitamente.

## Preferencias prácticas

- Usa Docker como forma preferida de operar este repo.
- Prefiere Docker porque esta herramienta está pensada para correr de forma personal pero reproducible, sin depender del entorno local del host.
- Evita instalar dependencias del proyecto en la máquina host si el mismo flujo puede correrse dentro de los contenedores `backend` o `frontend`.
- Mantén documentación simple y orientada al uso real.
- Si agregas flujos para agentes, recuerda que la entrada puede ser cualquier formato interpretable, pero la skill local trabaja sobre CSV.
- Si agregas importadores, conserva trazabilidad entre fuente, fecha raw y fecha contable.
- Para verificaciones rápidas, prefiere `scripts/verify.py` (backend) y `npm run verify` (frontend) sobre construir imágenes o builds completos.

## Comandos típicos (Docker)

- Levantar entorno: `docker compose up`
- Levantar entorno construyendo imágenes: `docker compose up --build`
- Crear tablas: `docker compose exec backend uv run python scripts/init_db.py`
- Cargar categorías por defecto: `docker compose exec backend uv run python scripts/seed.py`
- Ver categorías actuales: `docker compose exec backend uv run python scripts/list_categories.py`
- Ver últimos movimientos: `docker compose exec backend uv run python scripts/list_movements.py --limit 50`
- Verificación rápida: `docker compose exec backend uv run python scripts/verify.py`
- Importar movimientos desde CSV: `docker compose exec backend uv run python scripts/import_movements.py /app/scripts/data/<archivo>.csv`
- Crear o actualizar categorías desde JSON: `docker compose exec backend uv run python scripts/upsert_categories.py /app/scripts/data/categories.json`

## Comandos típicos (local sin Docker)

- Backend dev: `cd backend && uv run uvicorn app.main:app --reload`
- Frontend dev: `cd frontend && npm run dev`
- Verificar backend: `cd backend && uv run python scripts/verify.py`
- Verificar frontend: `cd frontend && npm run verify`

Cuando el usuario no tenga nada instalado todavía, usa `BOOTSTRAP.md` como guía principal.
