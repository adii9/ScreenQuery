#!/bin/bash
set -e

echo "🔧 ScreenQuery LLM Setup"
echo "========================"

# Detect Apple Silicon
if [[ "$(uname -m)" == "arm64" ]]; then
    echo "✅ Apple Silicon Mac detected"
    
    # Check for mlx-lm
    if ! command -v mlx-lm &> /dev/null; then
        echo "📦 Installing mlx-lm..."
        pip3 install mlx-lm
    else
        echo "✅ mlx-lm already installed"
    fi
    
    echo "📥 Downloading LLaVA 1.5 7B model (~6GB)..."
    python3 -c "from mlx_lm import download; download('mlx-community/llava-v1.5-7b')"
    
    echo ""
    echo "✅ Setup complete!"
    echo "LLaVA model downloaded to: ~/.cache/mlx/lm/"
    
else
    echo "⚠️  Intel Mac detected"
    echo "📦 Building llama.cpp from source..."
    
    if ! command -v llama-cli &> /dev/null; then
        cd /tmp
        git clone https://github.com/ggerganov/llama.cpp.git
        cd llama.cpp
        cmake . && make llama-cli -j$(sysctl -n hw.ncpu)
        
        # Copy to path
        mkdir -p ~/bin
        cp llama-cli ~/bin/
        
        echo "✅ llama.cpp installed to ~/bin/llama-cli"
        
        echo ""
        echo "⚠️  MANUAL STEP REQUIRED:"
        echo "   Download a vision GGUF model from HuggingFace:"
        echo "   https://huggingface.co/llama-cpp/llava-v1.5-7b-GGUF"
        echo "   Place it in ~/.llama/checkpoints/"
    else
        echo "✅ llama-cli already installed"
    fi
fi

echo ""
echo "🚀 Ready to run ScreenQuery!"
echo "   Launch the app and press Cmd+Shift+2 to capture."
