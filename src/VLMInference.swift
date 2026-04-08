import Foundation

enum VLMError: Error {
    case modelNotInstalled
    case inferenceFailed(String)
    case imageNotFound
}

struct VLMInference {
    
    /// Run LLaVA inference on an image
    /// Uses MLX for Apple Silicon GPU acceleration
    static func run(imagePath: String, prompt: String, completion: @escaping (Result<String, VLMError>) -> Void) {
        
        // Check if mlx-lm is installed
        let mlxPath = checkMLXInstallation()
        
        if mlxPath == nil {
            // Fallback: try llama-cli
            runWithLlamaCLI(imagePath: imagePath, prompt: prompt, completion: completion)
        } else {
            runWithMLX(imagePath: imagePath, prompt: prompt, completion: completion)
        }
    }
    
    // MARK: - MLX Path Check
    
    private static func checkMLXInstallation() -> String? {
        let paths = [
            "/opt/homebrew/bin/mlx-lm",
            "/usr/local/bin/mlx-lm",
            "\(NSHomeDirectory())/.local/bin/mlx-lm"
        ]
        
        for path in paths {
            if FileManager.default.fileExists(atPath: path) {
                return path
            }
        }
        
        // Check if it's in PATH
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        process.arguments = ["mlx-lm"]
        
        let pipe = Pipe()
        process.standardOutput = pipe
        try? process.run()
        process.waitUntilExit()
        
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        if let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
           !path.isEmpty {
            return path
        }
        
        return nil
    }
    
    // MARK: - MLX LLaVA
    
    private static func runWithMLX(imagePath: String, prompt: String, completion: @escaping (Result<String, VLMError>) -> Void) {
        
        // MLX LLaVA command
        // Note: mlx-lm uses --model to specify model, and accepts prompt input
        // For vision, we need llava or a vision-capable model
        let command = """
        mlx-lm.generate --model mlx-community/llava-v1.5-7b --image "\(imagePath)" --prompt "\(prompt)"
        """
        
        runShellCommand(command) { output, error in
            if let error = error, !error.isEmpty {
                completion(.failure(.inferenceFailed(error)))
            } else {
                completion(.success(output ?? "No response"))
            }
        }
    }
    
    // MARK: - Llama CLI Fallback
    
    private static func runWithLlamaCLI(imagePath: String, prompt: String, completion: @escaping (Result<String, VLMError>) -> Void) {
        
        // Check for llama-cli
        let llamaPaths = [
            "/opt/homebrew/bin/llama-cli",
            "/usr/local/bin/llama-cli",
            "\(NSHomeDirectory())/.local/bin/llama-cli"
        ]
        
        var llamaPath: String?
        for path in llamaPaths {
            if FileManager.default.fileExists(atPath: path) {
                llamaPath = path
                break
            }
        }
        
        guard let cliPath = llamaPath else {
            completion(.failure(.modelNotInstalled))
            return
        }
        
        // For vision models in llama-cli, you'd use --image flag
        let command = """
        \(cliPath) -m ~/.llama/checkpoints/llava-v1.5-7b.gguf --image "\(imagePath)" -p "\(prompt)" --no-display-prompt
        """
        
        runShellCommand(command) { output, error in
            if let error = error, !error.isEmpty {
                completion(.failure(.inferenceFailed(error)))
            } else {
                completion(.success(output ?? "No response"))
            }
        }
    }
    
    // MARK: - Shell Command Helper
    
    private static func runShellCommand(_ command: String, completion: @escaping (String?, String?) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/bin/zsh")
            process.arguments = ["-c", command]
            
            let outputPipe = Pipe()
            let errorPipe = Pipe()
            process.standardOutput = outputPipe
            process.standardError = errorPipe
            
            do {
                try process.run()
                process.waitUntilExit()
                
                let outputData = outputPipe.fileHandleForReading.readDataToEndOfFile()
                let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()
                
                let output = String(data: outputData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
                let error = String(data: errorData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
                
                completion(output, error)
            } catch {
                completion(nil, error.localizedDescription)
            }
        }
    }
    
    // MARK: - Setup Script Generation
    
    /// Generates a setup script for installing required models
    static func generateSetupScript() -> String {
        return """
        #!/bin/bash
        # ScreenQuery LLM Setup Script
        
        echo "Setting up LLaVA for ScreenQuery..."
        
        # Check for mlx-lm (Apple Silicon)
        if [[ "$(uname -m)" == "arm64" ]]; then
            echo "Detected Apple Silicon Mac"
            
            # Install mlx-lm if not present
            if ! command -v mlx-lm &> /dev/null; then
                echo "Installing mlx-lm..."
                pip3 install mlx-lm
            fi
            
            # Download LLaVA model
            echo "Downloading LLaVA 1.5 7B model..."
            python3 -c "from mlx_lm import download; download('mlx-community/llava-v1.5-7b')"
            
            echo "Setup complete!"
        else
            echo "Intel Mac detected - using llama.cpp"
            
            # Install llama.cpp
            if ! command -v llama-cli &> /dev/null; then
                echo "Building llama.cpp..."
                git clone https://github.com/ggerganov/llama.cpp.git
                cd llama.cpp
                cmake . && make llama-cli
                cp llama-cli ~/bin/
                cd ..
            fi
            
            # Download vision model (if available in gguf format)
            echo "Please download a vision-capable GGUF model to ~/.llama/checkpoints/"
            echo "Model: https://huggingface.co/llama-cpp/llava-v1.5-7b-GGUF"
        fi
        """
    }
}
