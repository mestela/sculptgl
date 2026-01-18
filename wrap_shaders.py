import os

def wrap_glsl(root_dir):
    for dirpath, _, filenames in os.walk(root_dir):
        for filename in filenames:
            if filename.endswith('.glsl'):
                glsl_path = os.path.join(dirpath, filename)
                js_path = glsl_path + '.js'
                
                with open(glsl_path, 'r') as f:
                    content = f.read()
                
                # Escape backticks and backslashes for template literal
                content = content.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
                
                js_content = f"const shader = `{content}`;\nexport default shader;"
                
                with open(js_path, 'w') as f:
                    f.write(js_content)
                print(f"Wrapped {glsl_path} -> {js_path}")

wrap_glsl('src/render/shaders/glsl')
