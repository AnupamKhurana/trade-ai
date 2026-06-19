"""
Tool schema generator — adapted from llm_chat project.

Converts typed Python functions with docstrings into OpenAI-compatible
function-calling JSON schemas that llama.cpp understands.
"""
import inspect
from typing import List, Dict, Any, Callable


def function_to_openai_tool(func: Callable) -> Dict[str, Any]:
    """
    Convert a Python function with docstrings and type annotations into
    a standard OpenAI tool schema suitable for llama.cpp /v1/chat/completions.

    Rules:
    - Function description comes from lines before 'Args:' in the docstring.
    - Parameter descriptions come from lines starting with '<param_name>:' in the docstring.
    - Supports str, int, float, bool, List[str/int/float/bool], dict.
    """
    sig = inspect.signature(func)
    doc = func.__doc__ or ""

    # Extract function description: lines before 'Args:' / 'Parameters:' / 'Returns:'
    doc_lines = [line.strip() for line in doc.split("\n")]
    description_parts = []
    for line in doc_lines:
        if line.startswith(("Args:", "Parameters:", "Returns:")):
            break
        description_parts.append(line)
    description = " ".join(p for p in description_parts if p).strip()

    properties: Dict[str, Any] = {}
    required: List[str] = []

    for name, param in sig.parameters.items():
        annotation = param.annotation
        param_type = "string"  # safe default
        items_type = None

        if annotation == str:
            param_type = "string"
        elif annotation == int:
            param_type = "integer"
        elif annotation == float:
            param_type = "number"
        elif annotation == bool:
            param_type = "boolean"
        elif hasattr(annotation, "__origin__"):
            origin = annotation.__origin__
            if origin in (list, List):
                param_type = "array"
                args = getattr(annotation, "__args__", None)
                if args:
                    type_map = {str: "string", int: "integer", float: "number", bool: "boolean"}
                    items_type = type_map.get(args[0], "string")
            elif origin in (dict, Dict):
                param_type = "object"
        elif annotation in (list, List):
            param_type = "array"
            items_type = "string"
        elif annotation in (dict, Dict):
            param_type = "object"

        # Extract per-parameter description from docstring
        param_desc = ""
        for line in doc_lines:
            if line.startswith(f"{name} ") or line.startswith(f"{name}:"):
                parts = line.split(":", 1)
                param_desc = parts[1].strip() if len(parts) > 1 else line.replace(name, "").strip()
                break

        param_schema: Dict[str, Any] = {"type": param_type}
        if param_desc:
            param_schema["description"] = param_desc
        if items_type:
            param_schema["items"] = {"type": items_type}

        properties[name] = param_schema
        if param.default == inspect.Parameter.empty:
            required.append(name)

    return {
        "type": "function",
        "function": {
            "name": func.__name__,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
        },
    }


def tools_to_schemas(funcs: List[Callable]) -> List[Dict[str, Any]]:
    """Convert a list of Python functions to a list of OpenAI tool schemas."""
    return [function_to_openai_tool(f) for f in funcs]
