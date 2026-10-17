# SaludClick — Frontend migrado a Astro + React

Esta carpeta contiene la nueva interfaz modular. Se conservaron los HTML originales en `../frontend-original` como respaldo; el backend de `../backend` no se modificó.

## Requisitos
- Node.js 20 o superior recomendado
- Backend Express iniciado en `http://localhost:3000`

## Instalación y ejecución
Desde esta carpeta:

```bash
npm install
npm run check
npm run dev
```

Abre `http://localhost:4321/`. El servidor de desarrollo reenvía `/api/*` al backend configurado en `BACKEND_URL` (por defecto `http://localhost:3000`). Para PowerShell puedes definirlo con `$env:BACKEND_URL="http://localhost:3000"` antes de iniciar Astro.

## Arquitectura
- `src/pages/`: rutas Astro. Se conservan las rutas `.html` heredadas para no romper enlaces ni los guardias de autenticación actuales.
- `src/layouts/Layout.astro`: documento base, estilos globales y slots para recursos específicos de página.
- `src/components/`: componentes React reutilizables para marca y buscador de la portada.
- `public/css`, `public/js`, `public/images`: recursos estáticos originales preservados.
- `../backend`: API Express original, sin modificaciones.

## Importante
El backend original sirve todavía el frontend antiguo desde `../frontend` cuando se abre su raíz `/`. Para probar la nueva interfaz, entra por `http://localhost:4321/`; las llamadas API se proxyfican a Express. No reemplaces ni borres `frontend-original` hasta validar visualmente todas las pantallas y los flujos con el backend en ejecución.
