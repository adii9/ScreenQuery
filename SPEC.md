# ScreenQuery — Specification

## What it is
A macOS menu bar app for querying anything on your screen using local AI vision.

## Core Flow
1. Global hotkey (Cmd+Shift+2) → screen dims, crosshair cursor activates
2. User drags rectangle to select region
3. Screenshot captured → sent to LLaVA 1.6 (MLX, local)
4. Floating panel shows answer
5. Copy / Close

## State Machine
- `idle` → hotkey pressed → `selecting`
- `selecting` → region captured → `inferring`
- `inferring` → response ready → `showing`
- `showing` → close pressed → `idle`

## Files
- `src/main.swift` — entry point, NSApplication, menu bar icon
- `src/ScreenCapture.swift` — CGWindowListCreateImage wrapper
- `src/RegionSelector.swift` — transparent full-screen overlay window
- `src/VLMInference.swift` — LLaVA via MLX subprocess call
- `src/HistoryStore.swift` — SQLite.swift history
- `src/AnswerPanel.swift` — floating NSPanel
- `src/HotkeyManager.swift` — CGEvent tap global hotkey
- `src/AppState.swift` — state machine enum
- `Info.plist` — LSUIElement=true (no dock icon)
- `project.yml` — XcodeGen config

## Privacy
100% offline. No telemetry. No network except LLaVA inference.

## Pricing
$15 one-time. No subscription.
