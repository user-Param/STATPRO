#!/usr/bin/env python3
"""
Research Executor Backend
Handles code execution requests from the Research/Editor page
Executes Python, C++, and Jupyter notebook cells
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import json
import tempfile
import os
import sys
import ast
import re
from pathlib import Path

app = Flask(__name__)
CORS(app)

# Strategy storage directory - relative to this script
STRATEGY_DIR = Path(__file__).parent.absolute() / "algos"
STRATEGY_DIR.mkdir(parents=True, exist_ok=True)

@app.route('/validate', methods=['POST'])
def validate_code():
    """Validate strategy code before saving"""
    try:
        data = request.json
        code = data.get('code', '')
        language = data.get('language', 'python')
        
        if not code:
            return jsonify({'valid': False, 'error': 'No code provided'}), 400
            
        if language == 'python':
            return validate_python(code)
        elif language == 'cpp':
            return validate_cpp(code)
        elif language == 'ipynb':
            return validate_ipynb(code)
        else:
            return jsonify({'valid': False, 'error': f'Unsupported language: {language}'}), 400
            
    except Exception as e:
        return jsonify({'valid': False, 'error': str(e)}), 500

def validate_python(code):
    try:
        tree = ast.parse(code)
        has_class = False
        has_on_tick = False
        
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                has_class = True
                for subnode in node.body:
                    if isinstance(subnode, ast.FunctionDef) and (subnode.name == 'on_tick' or subnode.name == 'onTick'):
                        has_on_tick = True
                        break
        
        if not has_class:
            return jsonify({'valid': False, 'error': 'Missing strategy class.'})
        if not has_on_tick:
            return jsonify({'valid': False, 'error': "Missing 'on_tick' method."})
            
        return jsonify({'valid': True})
    except SyntaxError as e:
        return jsonify({'valid': False, 'error': f'Syntax Error: {str(e)}'})
    except Exception as e:
        return jsonify({'valid': False, 'error': str(e)})

def validate_cpp(code):
    # Check for required symbols
    if 'onTick' not in code:
        return jsonify({'valid': False, 'error': "Missing 'onTick' method."})
    if 'Algo' not in code:
        return jsonify({'valid': False, 'error': "Strategy must inherit from 'Algo'."})
        
    # Attempt compilation
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            cpp_file = os.path.join(tmpdir, 'validate.cpp')
            with open(cpp_file, 'w') as f:
                f.write(code)
            
            result = subprocess.run(
                ['clang++', '-std=c++17', '-fsyntax-only', cpp_file],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                return jsonify({'valid': False, 'error': f'Compilation Error:\n{result.stderr}'})
                
        return jsonify({'valid': True})
    except Exception as e:
        return jsonify({'valid': False, 'error': f'Validation failed: {str(e)}'})

def validate_ipynb(code):
    try:
        notebook = json.loads(code)
        python_code = ""
        for cell in notebook:
            if cell.get('type') == 'code':
                python_code += cell.get('content', '') + "\n"
        
        if not python_code.strip():
            return jsonify({'valid': False, 'error': 'No code cells found in notebook.'})
            
        # Basic syntax check on combined code
        ast.parse(python_code)
        return jsonify({'valid': True})
    except Exception as e:
        return jsonify({'valid': False, 'error': f'Invalid Notebook Format: {str(e)}'})


def execute_python_cell_with_capture(code):
    """
    Run Python code in a subprocess with a wrapper that captures
    stdout and any matplotlib figures. Returns a list of output dicts.
    """
    wrapper = r"""
import sys, json, base64, io, traceback
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

# Capture stdout
_old_stdout = sys.stdout
_captured = io.StringIO()
sys.stdout = _captured

_result_outputs = []

try:
    exec(sys.argv[1])
finally:
    sys.stdout = _old_stdout
    _text = _captured.getvalue()
    if _text.strip():
        _result_outputs.append({"type": "text", "data": _text.rstrip()})

    # Check for any figures created
    _fig_nums = plt.get_fignums()
    if _fig_nums:
        for _num in _fig_nums:
            _fig = plt.figure(_num)
            _buf = io.BytesIO()
            _fig.savefig(_buf, format='png')
            _buf.seek(0)
            _img_b64 = base64.b64encode(_buf.read()).decode('ascii')
            _result_outputs.append({"type": "image/png", "data": _img_b64})
            plt.close(_fig)

    # Print JSON result to stdout for the parent to capture
    print(json.dumps(_result_outputs))
"""

    try:
        # Pass the user code as an argument to the wrapper script
        result = subprocess.run(
            [sys.executable, '-c', wrapper, code],
            capture_output=True, text=True, timeout=10
        )
        # The wrapper's final print is the JSON outputs list
        if result.stdout.strip():
            try:
                outputs = json.loads(result.stdout.strip())
                return outputs
            except json.JSONDecodeError:
                # If something went wrong, return the raw output as text
                return [{"type": "text", "data": result.stdout.strip()}]
        else:
            return [{"type": "text", "data": result.stderr.strip()}] if result.stderr.strip() else []
    except subprocess.TimeoutExpired:
        return [{"type": "error", "data": "Execution timed out (>10s)"}]
    except Exception as e:
        return [{"type": "error", "data": f"Internal error: {str(e)}"}]











@app.route('/run', methods=['POST'])
def run_code():
    """Execute code from the editor"""
    try:
        data = request.json
        code = data.get('code', '')
        language = data.get('language', 'python')
        
        if not code:
            return jsonify({'error': 'No code provided'}), 400
        
        if language == 'python':
            return run_python(code)
        elif language == 'cpp':
            return run_cpp(code)
        elif language == 'ipynb':
            # Extract Python code from notebook cells
            try:
                notebook = json.loads(code)
                python_code = ""
                for cell in notebook:
                    if cell.get('type') == 'code':
                        python_code += cell.get('content', '') + "\n"
                if not python_code.strip():
                    return jsonify({'error': 'No code cells found in notebook.'}), 400
                return run_python(python_code)
            except json.JSONDecodeError:
                return jsonify({'error': 'Invalid notebook format'}), 400
        else:
            return jsonify({'error': f'Unsupported language: {language}'}), 400
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    

@app.route('/run-cell', methods=['POST'])
def run_cell():
    """Execute a single notebook cell and return rich outputs (text, images, error)."""
    try:
        data = request.json
        code = data.get('code', '')
        language = data.get('language', 'python')
        
        if not code:
            return jsonify({'error': 'No code provided'}), 400
        
        # Only Python cells can produce rich output; C++ would need separate handling.
        if language == 'python':
            outputs = execute_python_cell_with_capture(code)
        else:
            # For other languages, fall back to the existing subprocess runner
            # but we still return a uniform output format.
            result = subprocess.run(
                [sys.executable, '-c', code],
                capture_output=True, text=True, timeout=10
            )
            stdout = result.stdout.strip()
            stderr = result.stderr.strip()
            outputs = []
            if stdout:
                outputs.append({"type": "text", "data": stdout})
            if stderr:
                outputs.append({"type": "error", "data": stderr})
        
        return jsonify({'success': True, 'outputs': outputs})
    except Exception as e:
        return jsonify({'success': False, 'outputs': [{'type': 'error', 'data': str(e)}]}), 500


def run_python(code):
    """Execute Python code"""
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(code)
            f.flush()
            temp_file = f.name
        
        try:
            result = subprocess.run(
                [sys.executable, temp_file],
                capture_output=True,
                text=True,
                timeout=10
            )
            output = result.stdout if result.stdout else result.stderr
            return jsonify({
                'success': result.returncode == 0,
                'output': output,
                'error': result.stderr if result.returncode != 0 else None
            })
        finally:
            os.unlink(temp_file)
            
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Code execution timeout (>10s)'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def run_cpp(code):
    """Execute C++ code (compile then run)"""
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            cpp_file = os.path.join(tmpdir, 'strategy.cpp')
            exe_file = os.path.join(tmpdir, 'strategy')
            
            with open(cpp_file, 'w') as f:
                f.write(code)
            
            # Compile C++ code
            compile_result = subprocess.run(
                ['clang++', '-std=c++17', cpp_file, '-o', exe_file],
                capture_output=True,
                text=True,
                timeout=15
            )
            
            if compile_result.returncode != 0:
                return jsonify({
                    'success': False,
                    'output': '',
                    'error': compile_result.stderr
                })
            
            # Run compiled executable
            run_result = subprocess.run(
                [exe_file],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            return jsonify({
                'success': run_result.returncode == 0,
                'output': run_result.stdout if run_result.stdout else "Compiled and executed successfully",
                'error': run_result.stderr if run_result.returncode != 0 else None
            })
            
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Code execution timeout (>10s)'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/save-strategy', methods=['POST'])
def save_strategy():
    """Save a strategy file to disk"""
    try:
        data = request.json
        name = data.get('name', 'strategy')
        content = data.get('content', '')
        language = data.get('language', 'python')
        
        # Determine file extension
        ext_map = {'python': 'py', 'cpp': 'cpp', 'ipynb': 'ipynb'}
        ext = ext_map.get(language, 'py')
        
        # Save to strategy directory
        strategy_file = STRATEGY_DIR / f"{name}.{ext}"
        with open(strategy_file, 'w') as f:
            f.write(content)
        
        return jsonify({
            'success': True,
            'message': f'Strategy saved to {strategy_file}',
            'path': str(strategy_file)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/list-strategies', methods=['GET'])
def list_strategies():
    """List all saved strategy files"""
    try:
        strategies = []
        for file in STRATEGY_DIR.glob('*'):
            if file.is_file():
                strategies.append({
                    'name': file.stem,
                    'language': 'ipynb' if file.suffix == '.ipynb' else file.suffix.lstrip('.'),
                    'path': str(file),
                    'size': file.stat().st_size
                })
        
        return jsonify({'strategies': strategies})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/load-strategy', methods=['GET'])
def load_strategy():
    """Load a strategy file"""
    try:
        name = request.args.get('name')
        if not name:
            return jsonify({'error': 'Strategy name required'}), 400
        
        # Search for file with any extension
        for file in STRATEGY_DIR.glob(f"{name}.*"):
            if file.is_file():
                with open(file, 'r') as f:
                    content = f.read()
                
                ext_to_lang = {
                    '.py': 'python',
                    '.cpp': 'cpp',
                    '.ipynb': 'ipynb'
                }
                language = ext_to_lang.get(file.suffix, 'python')
                
                return jsonify({
                    'name': file.stem,
                    'language': language,
                    'content': content,
                    'path': str(file)
                })
        
        return jsonify({'error': f'Strategy {name} not found'}), 404
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'service': 'research_executor'})

if __name__ == '__main__':
    port = int(os.getenv('RESEARCH_BACKEND_PORT', '5001'))
    print("Research Executor Backend starting on http://localhost:" + str(port))
    print(f"Strategies stored in: {STRATEGY_DIR}")
    app.run(debug=False, host='0.0.0.0', port=port)
