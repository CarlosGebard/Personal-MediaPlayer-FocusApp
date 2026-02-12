# Ethos - Enfoque, Hábitos y Estadísticas

Ethos es una aplicación de productividad con autenticación, sesiones de enfoque, seguimiento de hábitos y análisis de progreso.

## Funcionalidades principales

- Autenticación con sesión basada en cookie (`/auth/login`, `/auth/me`, `/auth/logout`)
- Temporizador de enfoque con selección de objetivo (objetivos de tiempo), pausar/reanudar/cancelar/completar
- Gestión de hábitos (crear, editar, eliminar)
- Tipos de objetivo: `time`, `count`, `boolean`
- Registro manual diario con progreso hacia el objetivo
- Mapa de calor de estadísticas (cumplimiento de objetivos por día)
- Gráfico mensual de objetivos (minutos por día para un objetivo seleccionado)
- Tabla de verificación de metas (ventana de 10 días con marcas de cumplimiento)
- Service worker + soporte PWA
- Selector de gif en el header desde `public/gifs`
- Notificación al completar sesión de enfoque (escritorio y PWA instalada cuando los permisos están otorgados)

## Stack tecnológico

- Frontend: React + TypeScript + Vite
- Backend: FastAPI + SQLAlchemy + Alembic
- Base de datos: PostgreSQL
- Despliegue / ejecución: Docker Compose

## Desarrollo local (Docker)

1. Completa los valores requeridos en `.env` usando `.env.example` (base de datos + auth + CORS + secretos).

2. Construir y ejecutar:

```bash
docker compose -f docker-compose.yml up -d --build
```
Ejecutar migraciones:

```bash
docker compose -f docker-compose.yml exec api alembic upgrade head
```

## URLs de la aplicación
- App web: http://localhost:5173
- API: http://localhost:8000
- Documentación OpenAPI: http://localhost:8000/docs

Notas
- Para notificaciones móviles en iOS, instala como PWA y habilita las notificaciones.