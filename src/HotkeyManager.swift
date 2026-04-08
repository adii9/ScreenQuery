import AppKit
import Carbon

class HotkeyManager {
    
    typealias HotkeyHandler = () -> Void
    
    private var handler: HotkeyHandler
    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var registeredKeyCode: CGKeyCode = 0
    private var registeredModifiers: CGEventFlags = []
    
    init(handler: @escaping HotkeyHandler) {
        self.handler = handler
    }
    
    deinit {
        unregister()
    }
    
    func register(keyCode: CGKeyCode, modifiers: NSEvent.ModifierFlags) {
        unregister()
        
        registeredKeyCode = keyCode
        registeredModifiers = cgEventFlags(from: modifiers)
        
        // Create event tap for key down
        let eventMask = (1 << CGEventType.keyDown.rawValue)
        
        // Use a class-based approach for the callback
        let refcon = UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque())
        
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: CGEventMask(eventMask),
            callback: { (proxy, type, event, refcon) -> Unmanaged<CGEvent>? in
                guard let refcon = refcon else { return Unmanaged.passRetained(event) }
                
                let manager = Unmanaged<HotkeyManager>.fromOpaque(refcon).takeUnretainedValue()
                return manager.handleEvent(proxy: proxy, type: type, event: event)
            },
            userInfo: refcon
        ) else {
            print("Failed to create event tap. Check Accessibility permissions in System Settings > Privacy > Accessibility")
            promptAccessibilityPermission()
            return
        }
        
        eventTap = tap
        runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
    }
    
    func unregister() {
        if let tap = eventTap {
            CGEvent.tapEnable(tap: tap, enable: false)
        }
        if let source = runLoopSource {
            CFRunLoopRemoveSource(CFRunLoopGetCurrent(), source, .commonModes)
        }
        eventTap = nil
        runLoopSource = nil
    }
    
    private func handleEvent(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
        if type == .keyDown {
            let keyCode = CGKeyCode(event.getIntegerValueField(.keyboardEventKeycode))
            let flags = event.flags
            
            // Check if modifiers match (ignore caps lock)
            let keyMatches = keyCode == registeredKeyCode
            let modifiersMatch = (flags.rawValue & ~CGEventFlags.maskCommand.rawValue) == (registeredModifiers.rawValue & ~CGEventFlags.maskCommand.rawValue)
            
            if keyMatches && modifiersMatch {
                // Execute handler on main thread
                DispatchQueue.main.async { [weak self] in
                    self?.handler()
                }
                return nil // Consume the event
            }
        }
        
        return Unmanaged.passRetained(event)
    }
    
    private func cgEventFlags(from modifiers: NSEvent.ModifierFlags) -> CGEventFlags {
        var flags: CGEventFlags = []
        if modifiers.contains(.command) { flags.insert(.maskCommand) }
        if modifiers.contains(.shift) { flags.insert(.maskShift) }
        if modifiers.contains(.option) { flags.insert(.maskAlternate) }
        if modifiers.contains(.control) { flags.insert(.maskControl) }
        return flags
    }
    
    private func promptAccessibilityPermission() {
        DispatchQueue.main.async {
            let options: NSDictionary = [kAXTrustedCheckOptionPrompt.takeRetainedValue: true]
            let accessEnabled = AXIsProcessTrustedWithOptions(options)
            if !accessEnabled {
                print("ScreenQuery needs Accessibility permission to register global hotkeys.")
                print("Please enable in System Settings > Privacy & Security > Accessibility")
            }
        }
    }
}
