import AppKit

class AnswerPanel {
    
    private var panel: NSPanel!
    private var textView: NSTextView!
    private var onClose: () -> Void
    private var onCopy: (String) -> Void
    private var answerText: String
    
    init(text: String, imagePath: String?, onClose: @escaping () -> Void, onCopy: @escaping (String) -> Void) {
        self.onClose = onClose
        self.onCopy = onCopy
        self.answerText = text
        setupPanel(text: text, imagePath: imagePath)
    }
    
    private func setupPanel(text: String, imagePath: String?) {
        let contentRect = CGRect(x: 0, y: 0, width: 480, height: 280)
        
        panel = NSPanel(
            contentRect: contentRect,
            styleMask: [.titled, .closable, .resizable, .nonactivatingPanel, .hudWindow],
            backing: .buffered,
            defer: false
        )
        
        panel.title = "ScreenQuery"
        panel.level = .floating
        panel.isFloatingPanel = true
        panel.becomesKeyOnlyIfNeeded = true
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        
        // Make it compact and non-invasive
        panel.backgroundColor = NSColor.windowBackgroundColor
        panel.isOpaque = false
        
        // Center on screen initially
        if let screen = NSScreen.main {
            panel.center(in: screen.visibleFrame)
        }
        
        // Content view
        let container = NSView(frame: contentRect)
        panel.contentView = container
        
        // Text scroll view
        let scrollView = NSScrollView(frame: CGRect(x: 16, y: 50, width: contentRect.width - 32, height: contentRect.height - 66))
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder
        
        textView = NSTextView(frame: scrollView.bounds)
        textView.isEditable = false
        textView.isSelectable = true
        textView.font = NSFont.systemFont(ofSize: 14)
        textView.textColor = NSColor.labelColor
        textView.backgroundColor = .clear
        textView.string = text
        textView.textContainerInset = NSSize(width: 0, height: 4)
        
        // Enable link detection
        textView.isAutomaticLinkDetectionEnabled = true
        textView.urlsAlwaysTypset = true
        
        scrollView.documentView = textView
        container.addSubview(scrollView)
        
        // Button row
        let buttonY: CGFloat = 14
        let buttonHeight: CGFloat = 28
        
        // Close button
        let closeButton = NSButton(frame: CGRect(x: contentRect.width - 80 - 16, y: buttonY, width: 70, height: buttonHeight))
        closeButton.title = "Close"
        closeButton.bezelStyle = .rounded
        closeButton.target = self
        closeButton.action = #selector(closeAction)
        container.addSubview(closeButton)
        
        // Copy button
        let copyButton = NSButton(frame: CGRect(x: contentRect.width - 160 - 16, y: buttonY, width: 70, height: buttonHeight))
        copyButton.title = "Copy"
        copyButton.bezelStyle = .rounded
        copyButton.target = self
        copyButton.action = #selector(copyAction)
        container.addSubview(copyButton)
        
        // Model label
        let modelLabel = NSTextField(labelWithString: "LLaVA 1.5 7B · ON-DEVICE")
        modelLabel.frame = CGRect(x: 16, y: buttonY, width: 200, height: buttonHeight)
        modelLabel.font = NSFont.monospacedSystemFont(ofSize: 10, weight: .regular)
        modelLabel.textColor = NSColor.secondaryLabelColor
        container.addSubview(modelLabel)
        
        // Resize handle
        panel.minSize = NSSize(width: 300, height: 150)
        panel.maxSize = NSSize(width: 800, height: 600)
    }
    
    func show() {
        panel.makeKeyAndOrderFront(nil)
        panel.orderFrontRegardless()
        NSApp.activate(ignoringOtherApps: true)
    }
    
    func close() {
        panel.close()
    }
    
    @objc private func closeAction() {
        close()
        onClose()
    }
    
    @objc private func copyAction() {
        close()
        onCopy(answerText)
    }
}

// MARK: - Panel Centering Extension

extension NSPanel {
    func center(in rect: CGRect) {
        guard let screen = NSScreen.main else { return }
        let screenRect = screen.visibleFrame
        let panelSize = self.frame.size
        
        // Position in lower-center of screen (near capture location)
        let x = screenRect.midX - panelSize.width / 2
        let y = screenRect.minY + panelSize.height / 2 + 100
        
        self.setFrameOrigin(CGPoint(x: x, y: y))
    }
}
