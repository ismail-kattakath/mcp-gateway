# MCP Gateway UI

Web interface for managing MCP Gateway backends, OAuth connections, environment variables, and viewing live logs.

## Features

- **Dashboard** - Overview of backend status, active connections, and recent activity
- **Backend Configuration** - Visual registry editor with enable/disable toggles and JSON editing
- **OAuth Panel** - Connect GitHub and Smithery with one-click authentication
- **Environment Editor** - Manage .env variables with secret masking
- **Logs Viewer** - Live log streaming with filtering and search

## Tech Stack

- React 18 with Vite
- Tailwind CSS for styling
- React Router for navigation
- TanStack Query for data fetching
- Lucide React for icons
- Axios for API calls

## Getting Started

### Install Dependencies

```bash
npm install
```

### Development

```bash
npm run dev
```

The UI will be available at http://localhost:5173 and will proxy API calls to the backend at http://localhost:3000.

### Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
ui/
├── src/
│   ├── main.jsx              # App entry point
│   ├── App.jsx               # Main app with routing
│   ├── index.css             # Global styles
│   ├── api/
│   │   └── client.js         # API client
│   └── components/
│       ├── Dashboard.jsx     # Status overview
│       ├── BackendConfig.jsx # Backend registry editor
│       ├── LogsViewer.jsx    # Live logs viewer
│       ├── OAuthPanel.jsx    # OAuth connections
│       └── EnvEditor.jsx     # Environment variables
├── public/                   # Static assets
├── index.html                # HTML template
├── vite.config.js            # Vite configuration
├── tailwind.config.js        # Tailwind configuration
└── package.json              # Dependencies
```

## API Integration

The UI communicates with the backend through these endpoints:

- `GET /api/status` - Get gateway and backend status
- `GET /api/config` - Get backend registry
- `POST /api/config` - Update backend configuration
- `GET /api/logs` - Get logs (with SSE streaming)
- `POST /api/backends/:id/start` - Start a backend
- `POST /api/backends/:id/stop` - Stop a backend
- `GET /oauth/status` - Get OAuth connection status
- `POST /oauth/:provider/start` - Start OAuth flow
- `POST /oauth/:provider/disconnect` - Disconnect OAuth
- `GET /api/env` - Get environment variables
- `POST /api/env` - Update environment variables

## Dark Theme

The UI uses a dark theme by default to match the Claude Code aesthetic:

- Background: `#1a1a1a`
- Surface: `#242424`
- Border: `#333333`
- Hover: `#2a2a2a`
- Primary: `#3b82f6`

## Future Enhancements

- Add Backend wizard with type selection
- Backend health check visualization
- Metrics dashboard with charts
- Export/import registry configuration
- Bulk backend operations
- Advanced log analysis
