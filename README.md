# 🎬 DRAM PlaySV - Media Server

A modern web-based media server for managing and playing videos/photos with MPV remote control.

## ✨ Features

- **Web Player** - Stream videos directly in browser with advanced controls
- **Photo Viewer** - Slideshow with navigation and fullscreen support
- **MPV Remote** - Control MPV player on your PC from any device
- **Smart Filters** - Filter by type, orientation, size, cloud provider
- **Auto Thumbnails** - Automatic thumbnail generation
- **Continue Watching** - Resume playback from where you left off

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open browser
http://localhost:3000
```

## 📁 Project Structure

```
├── client/          # Frontend (HTML, CSS, JS)
│   └── public/
│       ├── js/modules/   # Player, UI, API modules
│       └── css/          # Styles
├── server/          # Backend (Express.js)
│   └── v2/
│       ├── controllers/  # Route handlers
│       ├── services/     # Business logic
│       └── routes/       # API routes
├── data/            # Database & thumbnails (gitignored)
└── mpv/             # MPV binaries (gitignored, install separately)
```

## 🛠️ Requirements

- Node.js 18+
- MPV Player (for remote control feature)

## 📱 Mobile Access

Scan QR code displayed in the app to access from your phone on the same network.

## 📝 License

MIT
