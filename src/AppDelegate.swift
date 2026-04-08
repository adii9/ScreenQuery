import AppKit

class AppDelegate: NSObject, NSApplicationDelegate {
    
    private var statusItem: NSStatusItem!
    private var hotkeyManager: HotkeyManager!
    private var state: AppState = .idle
    private var currentSelector: RegionSelector?
    private var currentPanel: AnswerPanel?
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        setupStatusItem()
        setupHotkey()
        
        // Hide dock icon (LSUIElement in Info.plist handles this, but double-check)
        NSApp.setActivationPolicy(.accessory)
    }
    
    // MARK: - Status Item
    
    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "magnifyingglass.circle", accessibilityDescription: "ScreenQuery")
            button.image?.isTemplate = true
        }
        
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Capture Region (⌘⇧2)", action: #selector(startCapture), keyEquivalent: ""))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "History", action: #selector(showHistory), keyEquivalent: ""))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Quit ScreenQuery", action: #selector(quit), keyEquivalent: "q"))
        
        statusItem.menu = menu
    }
    
    // MARK: - Hotkey
    
    private func setupHotkey() {
        hotkeyManager = HotkeyManager { [weak self] in
            self?.startCapture()
        }
        hotkeyManager.register(keyCode: 0x13, modifiers: [.command, .shift]) // Cmd+Shift+2 (keycode 19 = '2')
    }
    
    // MARK: - Actions
    
    @objc func startCapture() {
        guard state == .idle else { return }
        state = .selecting
        
        DispatchQueue.main.async { [weak self] in
            self?.showRegionSelector()
        }
    }
    
    @objc func showHistory() {
        // TODO: Show history window
    }
    
    @objc func quit() {
        NSApp.terminate(nil)
    }
    
    // MARK: - Region Selection
    
    private func showRegionSelector() {
        let selector = RegionSelector { [weak self] rect in
            self?.handleRegionSelected(rect)
        }
        currentSelector = selector
        selector.show()
    }
    
    private func handleRegionSelected(_ rect: CGRect) {
        currentSelector = nil
        state = .inferring
        
        // Capture the selected region
        guard let image = ScreenCapture.capture(rect: rect) else {
            resetToIdle()
            return
        }
        
        // Save image to temp
        let tempPath = NSTemporaryDirectory() + "screenquery_\(UUID().uuidString).png"
        if let pngData = image.pngRepresentation {
            try? pngData.write(to: URL(fileURLWithPath: tempPath))
        }
        
        // Show "Analyzing..." panel immediately
        DispatchQueue.main.async { [weak self] in
            self?.showAnswerPanel(text: "Analyzing...", imagePath: tempPath)
        }
        
        // Run inference
        VLMInference.run(imagePath: tempPath, prompt: "Describe what you see in this image in detail.") { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success(let description):
                    // Save to history
                    HistoryStore.shared.save(query: "Describe this", answer: description, imagePath: tempPath)
                    self?.showAnswerPanel(text: description, imagePath: tempPath)
                case .failure(let error):
                    self?.showAnswerPanel(text: "Error: \(error.localizedDescription)", imagePath: nil)
                }
                self?.state = .showing
            }
        }
    }
    
    // MARK: - Answer Panel
    
    private func showAnswerPanel(text: String, imagePath: String?) {
        currentPanel?.close()
        
        let panel = AnswerPanel(text: text, imagePath: imagePath) { [weak self] in
            self?.resetToIdle()
        } onCopy: { [weak self] text in
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(text, forType: .string)
            self?.resetToIdle()
        }
        
        currentPanel = panel
        panel.show()
    }
    
    private func resetToIdle() {
        currentPanel?.close()
        currentPanel = nil
        state = .idle
    }
}
