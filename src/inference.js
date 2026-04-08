/**
 * ScreenQuery LLM Inference Module
 * 
 * Handles communication with local LLaVA model via MLX (Apple Silicon)
 * or llama.cpp (Intel Mac).
 * 
 * Usage:
 *   node inference.js <imagePath> <prompt>
 * 
 * Output:
 *   JSON: { success: true, answer: "..." }
 *   or { success: false, error: "..." }
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: node inference.js <imagePath> <prompt>');
  process.exit(1);
}

const imagePath = args[0];
const prompt = args.slice(1).join(' ');
const homeDir = require('os').homedir();

// Check if MLX is available (Apple Silicon)
function checkMLX() {
  return new Promise((resolve) => {
    const proc = spawn('which', ['mlx-lm']);
    proc.on('close', (code) => resolve(code === 0));
  });
}

// Check if llama-cli is available (Intel)
function checkLlamaCLI() {
  return new Promise((resolve) => {
    const proc = spawn('which', ['llama-cli']);
    proc.on('close', (code) => resolve(code === 0));
  });
}

// Run LLaVA via MLX
async function runWithMLX(imagePath, prompt) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [
      '-c',
      `
from mlx_lm import generate, load
from mlx_vlm import load as vlm_load
import sys

try:
    model, tokenizer = vlm_load("mlx-community/llava-v1.5-7b")
    output = generate(model, tokenizer, prompt=prompt, image=sys.argv[1])
    print(output)
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
`,
      imagePath
    ], { shell: false });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || 'MLX inference failed'));
      }
    });
  });
}

// Run via llama-cli with vision model
async function runWithLlamaCLI(imagePath, prompt) {
  return new Promise((resolve, reject) => {
    const modelPath = path.join(homeDir, '.llama', 'checkpoints', 'llava-v1.5-7b.gguf');
    
    if (!fs.existsSync(modelPath)) {
      reject(new Error(`Model not found at ${modelPath}. Run setup_llm.sh first.`));
      return;
    }

    const proc = spawn('llama-cli', [
      '-m', modelPath,
      '--image', imagePath,
      '-p', prompt,
      '--no-display-prompt',
      '-s', '0'
    ]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || 'Llama CLI inference failed'));
      }
    });
  });
}

// Main inference function
async function infer() {
  try {
    // Verify image exists
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image not found: ${imagePath}`);
    }

    const hasMLX = await checkMLX();
    
    if (hasMLX) {
      console.error('Using MLX...');
      const result = await runWithMLX(imagePath, prompt);
      console.log(JSON.stringify({ success: true, answer: result }));
    } else {
      const hasLlama = await checkLlamaCLI();
      if (hasLlama) {
        console.error('Using llama-cli...');
        const result = await runWithLlamaCLI(imagePath, prompt);
        console.log(JSON.stringify({ success: true, answer: result }));
      } else {
        throw new Error(
          'No inference engine found. Install either:\n' +
          '  MLX (Apple Silicon): pip3 install mlx-lm\n' +
          '  Llama.cpp (Intel): brew install llama.cpp'
        );
      }
    }
  } catch (err) {
    console.error('Inference error:', err.message);
    console.log(JSON.stringify({ success: false, error: err.message }));
    process.exit(1);
  }
}

infer();
