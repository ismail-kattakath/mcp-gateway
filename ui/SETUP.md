# UI Setup Instructions

## Quick Start

1. **Install dependencies:**
   ```bash
   cd ui
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Access the UI:**
   Open http://localhost:5173 in your browser

## Prerequisites

- Node.js 18+ or Bun
- Backend server running on port 3000

## Troubleshooting

### Port already in use
If port 5173 is already in use, Vite will automatically try the next available port.

### Backend connection failed
Make sure the backend server is running:
```bash
cd ../server
npm run dev
```

### API proxy issues
The Vite dev server proxies these paths to localhost:3000:
- `/api/*`
- `/oauth/*`
- `/mcp/*`

If you're running the backend on a different port, update `vite.config.js`:
```js
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:YOUR_PORT',
      changeOrigin: true,
    },
  },
}
```

## Development Tips

### Hot Module Replacement
Vite provides instant HMR - changes to components will reflect immediately without full page reload.

### React Query DevTools
To add React Query DevTools for debugging API calls:
```bash
npm install @tanstack/react-query-devtools
```

Then in `src/main.jsx`:
```jsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// Add inside QueryClientProvider
<ReactQueryDevtools initialIsOpen={false} />
```

### Component Development
All components are in `src/components/`. Each component:
- Uses TanStack Query for data fetching
- Follows dark theme design system
- Has responsive layouts (mobile-friendly)
- Handles loading and error states

## Building for Production

1. **Build:**
   ```bash
   npm run build
   ```

2. **Preview build:**
   ```bash
   npm run preview
   ```

3. **Deploy:**
   The `dist` directory contains optimized static files ready for deployment to any static hosting service (Vercel, Netlify, S3, etc.)

## Docker Deployment

The UI will be included in the main Docker compose setup. See root `docker-compose.yml` for full stack deployment.
