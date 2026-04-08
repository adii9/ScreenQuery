import AppKit
import CoreGraphics

struct ScreenCapture {
    
    /// Capture a specific region of the screen
    static func capture(rect: CGRect) -> NSImage? {
        guard let cgImage = CGWindowListCreateImage(
            rect,
            .optionOnScreenOnly,
            kCGNullWindowID,
            [.boundsIgnoreFraming, .nominalResolution]
        ) else {
            return nil
        }
        
        return NSImage(cgImage: cgImage, size: rect.size)
    }
    
    /// Capture the entire main screen
    static func captureFullScreen() -> NSImage? {
        guard let screen = NSScreen.main else { return nil }
        return capture(rect: screen.frame)
    }
    
    /// Capture a specific point on screen (for future use with click detection)
    static func capturePoint(_ point: CGPoint) -> NSImage? {
        let rect = CGRect(x: point.x, y: point.y, width: 1, height: 1)
        return capture(rect: rect)
    }
}

extension NSImage {
    var pngRepresentation: Data? {
        guard let tiffData = self.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiffData) else {
            return nil
        }
        return bitmap.representation(using: .png, properties: [:])
    }
}
