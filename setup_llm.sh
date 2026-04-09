#!/bin/bash
set -e

echo "🔧 ScreenQuery LLM Setup"
echo "========================"

# Detect Apple Silicon
if [[ "$(uname -m)" == "arm64" ]]; then
    echo "✅ Apple Silicon Mac detected"
    
    # Check for mlx-lm
    if ! command -v mlx-lm &> /dev/null; then
        echo "📦 Installing mlx-lm (using --user to avoid system package conflict)..."
        pip3 install --user mlx-lm 2>&1 || pip3 install --user --break-system-packages mlx-lm 2>&1
    else
        echo "✅ mlx-lm already installed"
    fi
    
    # Check if model is cached
    HF_BIN="/Users/adiimathur/Library/Python/3.14/bin/hf"
    MLX_LM_BIN="/Users/adiimathur/Library/Python/3.14/bin/mlx_lm"
    
    if [ -d "$HOME/.cache/huggingface/hub/models--mlx-community--llava-v1.5-7b" ]; then
        echo "✅ LLaVA model already downloaded"
    else
        echo "📥 Downloading LLaVA 1.5 7B model (~6GB)..."
        $HF_BIN download mlx-community/llava-v1.5-7b
        echo "✅ Model downloaded"
    fi
    
    echo ""
    echo "✅ Setup complete!"
    echo "   Model location: $MODEL_DIR"
    
else
    echo "⚠️  Intel Mac detected"
    echo "📦 Building llama.cpp from source..."
    
    if ! command -v llama-cli &> /dev/null; then
        cd /tmp
        git clone https://github.com/ggerganov/llama.cpp.git
        cd llama.cpp
        cmake . && make llama-cli -j$(sysctl -n hw.ncpu)
        
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
echo "   Restart the app: cd ~/Projects/screenquery && npm start"
