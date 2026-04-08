import Foundation

/// Simple state machine for ScreenQuery app flow
enum AppState: Equatable {
    /// Idle — waiting for hotkey or menu interaction
    case idle
    
    /// Selecting — user is dragging to select a screen region
    case selecting
    
    /// Inferring — screenshot captured, sending to LLaVA
    case inferring
    
    /// Showing — answer panel is displayed
    case showing
    
    /// Error — something went wrong, reset to idle
    case error(String)
    
    var description: String {
        switch self {
        case .idle:      return "Ready"
        case .selecting: return "Select a region..."
        case .inferring: return "Analyzing..."
        case .showing:   return "Answer ready"
        case .error(let msg): return "Error: \(msg)"
        }
    }
    
    /// Whether the app is currently processing something
    var isProcessing: Bool {
        switch self {
        case .selecting, .inferring, .showing:
            return true
        case .idle, .error:
            return false
        }
    }
}
