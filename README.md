# ScreenQuery

**Point at anything on your screen. Get instant AI answers. 100% local, no cloud, no subscription.**

A macOS menu bar app for querying anything you see on screen — error messages, documentation, images, charts, code — using local AI vision models.

```
Press Cmd+Shift+2 → Select region → Get AI description
```

---

## ✨ Features

| | |
|---|---|
| 🎯 **Global Hotkey** | `Cmd+Shift+2` captures any region, any app |
| 🤖 **Local AI** | Runs entirely on your Mac (M1/M2/M3 optimized) |
| 🔒 **Private** | No screenshots leave your machine |
| ⚡ **Fast** | LLaVA via Ollama, Apple Silicon GPU accelerated |


---

## 🚀 Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Install Ollama

```bash
brew install ollama
```

### 3. Pull a vision model

```bash
ollama pull llava
```

### 4. Start Ollama

```bash
ollama serve
```

> Keep Ollama running in the background. It loads the model once and stays ready.

### 5. Launch ScreenQuery

```bash
npm start
```

### 6. Grant permissions

On first run, macOS will prompt for:
- **Screen Recording** — required for screen capture
- **Accessibility** — required for global hotkeys

> System Settings → Privacy & Security → Screen Recording / Accessibility

---

## 📖 How It Works

1. **Trigger** — Press `Cmd+Shift+2` (or click the menu bar icon)
2. **Select** — Drag to select any region on screen
3. **Analyze** — LLaVA describes what it sees in one sentence
4. **Copy** — Click Copy to grab the text, or Close to dismiss

---

## ⚙️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | Electron |
| Vision Model | [LLaVA 1.5](https://llava-vl.github.io/) via [Ollama](https://ollama.ai) |
| Screen Capture | macOS `desktopCapturer` API |
| Language | JavaScript / Node.js |
| Platform | macOS (Apple Silicon optimized) |

---

## 🔒 Privacy

ScreenQuery is built with privacy first:
- **100% offline** — All AI inference runs locally on your Mac
- **No data leaves your machine** — Screenshots are processed by LLaVA, not sent anywhere
- **No telemetry** — No analytics, no tracking, no cloud dependencies
- **Works in airplane mode**

---

## 💬 Example Use Cases

- "What does this error message mean?"
- "Summarize this chart"
- "Extract all the dates from this table"
- "What UI is shown in this screenshot?"
- "Explain what this code snippet does"

---

## 🏗️ Build from Source

```bash
# Clone
git clone https://github.com/adii9/ScreenQuery.git
cd ScreenQuery

# Install deps
npm install

# Run dev
npm start

# Build .app bundle
npm run build
```

---

## 🤝 Contributing

Contributions welcome! Open an issue or submit a PR.

---

## 📄 License

MIT

---

*Built with ⚡ by [Adii](https://github.com/adii9)*
