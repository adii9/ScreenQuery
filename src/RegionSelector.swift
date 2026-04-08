import AppKit

class RegionSelector {
    
    typealias CompletionHandler = (CGRect) -> Void
    
    private var overlayWindow: NSWindow!
    private var selectionView: SelectionView!
    private var completion: CompletionHandler
    private var trackingArea: NSTrackingArea?
    
    init(completion: @escaping CompletionHandler) {
        self.completion = completion
    }
    
    func show() {
        guard let screen = NSScreen.main else { return }
        
        // Create transparent full-screen overlay
        overlayWindow = NSWindow(
            contentRect: screen.frame,
            styleMask: .borderless,
            backing: .buffered,
            defer: false,
            screen: screen
        )
        
        overlayWindow.level = .screenSaver          // Above everything including menu bar
        overlayWindow.backgroundColor = NSColor.black.withAlphaComponent(0.3)
        overlayWindow.isOpaque = false
        overlayWindow.hasShadow = false
        overlayWindow.ignoresMouseEvents = false
        overlayWindow.acceptsMouseMovedEvents = true
        overlayWindow.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        
        // Selection view handles the drawing
        selectionView = SelectionView(frame: screen.frame)
        selectionView.onSelectionComplete = { [weak self] rect in
            self?.complete(with: rect)
        }
        selectionView.onCancel = { [weak self] in
            self?.cancel()
        }
        
        overlayWindow.contentView = selectionView
        overlayWindow.makeKeyAndOrderFront(nil)
        
        // Set crosshair cursor
        NSCursor.crosshair.set()
        
        // Make sure we capture all key events
        overlayWindow.makeFirstResponder(selectionView)
    }
    
    func cancel() {
        overlayWindow.close()
        NSCursor.arrow.set()
        completion(CGRect.zero)
    }
    
    private func complete(with rect: CGRect) {
        overlayWindow.close()
        NSCursor.arrow.set()
        
        // Convert from our view's coordinate system to screen coordinates
        if let screen = NSScreen.main {
            let flippedRect = CGRect(
                x: rect.origin.x,
                y: screen.frame.height - rect.origin.y - rect.height,
                width: rect.width,
                height: rect.height
            )
            completion(flippedRect)
        } else {
            completion(rect)
        }
    }
}

// MARK: - Selection View

class SelectionView: NSView {
    
    var onSelectionComplete: ((CGRect) -> Void)?
    var onCancel: (() -> Void)?
    
    private var startPoint: CGPoint = .zero
    private var currentRect: CGRect = .zero
    private var isDragging = false
    
    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    override var acceptsFirstResponder: Bool { true }
    
    override func mouseDown(with event: NSEvent) {
        startPoint = convert(event.locationInWindow, from: nil)
        currentRect = CGRect(origin: startPoint, size: .zero)
        isDragging = true
        needsDisplay = true
    }
    
    override func mouseDragged(with event: NSEvent) {
        guard isDragging else { return }
        let currentPoint = convert(event.locationInWindow, from: nil)
        currentRect = rectFromPoints(startPoint, currentPoint)
        needsDisplay = true
    }
    
    override func mouseUp(with event: NSEvent) {
        guard isDragging else { return }
        isDragging = false
        
        // Only complete if rect is meaningful size
        if currentRect.width > 10 && currentRect.height > 10 {
            onSelectionComplete?(currentRect)
        } else {
            onCancel?()
        }
    }
    
    override func keyDown(with event: NSEvent) {
        if event.keyCode == 53 { // Escape key
            onCancel?()
        }
    }
    
    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        
        // Draw dimmed overlay
        NSColor.black.withAlphaComponent(0.3).setFill()
        dirtyRect.fill()
        
        // Clear the selection rect (make it transparent)
        if currentRect.width > 0 && currentRect.height > 0 {
            NSColor.clear.setFill()
            currentRect.fill(using: .copy)
            
            // Draw border around selection
            NSColor.white.setStroke()
            let path = NSBezierPath(rect: currentRect)
            path.lineWidth = 2
            path.stroke()
            
            // Draw corner handles
            let handleSize: CGFloat = 8
            NSColor.white.setFill()
            for corner in corners(of: currentRect) {
                let handleRect = CGRect(
                    x: corner.x - handleSize/2,
                    y: corner.y - handleSize/2,
                    width: handleSize,
                    height: handleSize
                )
                let handlePath = NSBezierPath(ovalIn: handleRect)
                handlePath.fill()
            }
            
            // Draw size label
            let sizeLabel = "\(Int(currentRect.width)) × \(Int(currentRect.height))"
            let attrs: [NSAttributedString.Key: Any] = [
                .font: NSFont.monospacedSystemFont(ofSize: 12, weight: .medium),
                .foregroundColor: NSColor.white,
                .backgroundColor: NSColor.black.withAlphaComponent(0.7)
            ]
            let attrString = NSAttributedString(string: " \(sizeLabel) ", attributes: attrs)
            let labelPoint = CGPoint(
                x: currentRect.midX - attrString.size().width/2,
                y: currentRect.maxY + 8
            )
            attrString.draw(at: labelPoint)
        }
    }
    
    private func rectFromPoints(_ p1: CGPoint, _ p2: CGPoint) -> CGRect {
        return CGRect(
            x: min(p1.x, p2.x),
            y: min(p1.y, p2.y),
            width: abs(p2.x - p1.x),
            height: abs(p2.y - p1.y)
        )
    }
    
    private func corners(of rect: CGRect) -> [CGPoint] {
        return [
            CGPoint(x: rect.minX, y: rect.minY),
            CGPoint(x: rect.maxX, y: rect.minY),
            CGPoint(x: rect.minX, y: rect.maxY),
            CGPoint(x: rect.maxX, y: rect.maxY)
        ]
    }
}
