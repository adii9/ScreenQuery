import Foundation

struct HistoryEntry: Codable {
    let id: Int
    let timestamp: Date
    let question: String
    let answer: String
    let imagePath: String?
}

class HistoryStore {
    
    static let shared = HistoryStore()
    
    private var entries: [HistoryEntry] = []
    private let maxEntries = 50
    private let filePath: URL
    
    private init() {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let screenQueryDir = appSupport.appendingPathComponent("ScreenQuery", isDirectory: true)
        try? FileManager.default.createDirectory(at: screenQueryDir, withIntermediateDirectories: true)
        filePath = screenQueryDir.appendingPathComponent("history.json")
        load()
    }
    
    private func load() {
        guard FileManager.default.fileExists(atPath: filePath.path) else { return }
        do {
            let data = try Data(contentsOf: filePath)
            entries = try JSONDecoder().decode([HistoryEntry].self, from: data)
        } catch {
            print("Failed to load history: \(error)")
        }
    }
    
    private func save() {
        do {
            let data = try JSONEncoder().encode(entries)
            try data.write(to: filePath)
        } catch {
            print("Failed to save history: \(error)")
        }
    }
    
    func save(query: String, answer: String, imagePath: String?) {
        let entry = HistoryEntry(
            id: entries.count,
            timestamp: Date(),
            question: query,
            answer: answer,
            imagePath: imagePath
        )
        
        entries.insert(entry, at: 0)
        
        // Keep only last 50
        if entries.count > maxEntries {
            entries = Array(entries.prefix(maxEntries))
        }
        
        save()
    }
    
    func getRecent(limit: Int = 50) -> [HistoryEntry] {
        return Array(entries.prefix(limit))
    }
}
