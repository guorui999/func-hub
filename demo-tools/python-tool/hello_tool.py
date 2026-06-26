from funchub import funchub_tool

@funchub_tool(
    name="hello_greeter",
    description="Generate a personalized greeting message based on name and language",
    version="1.0.0",
)
def hello_greeter(name: str, language: str = "en") -> str:
    """Generate a greeting for the given name in the specified language."""
    greetings = {
        "en": f"Hello, {name}! Welcome to FuncHub.",
        "zh": f"{name}，你好！欢迎使用 FuncHub。",
        "ja": f"{name}さん、こんにちは！FuncHubへようこそ。",
        "fr": f"Bonjour {name} ! Bienvenue sur FuncHub.",
        "de": f"Hallo {name}! Willkommen bei FuncHub.",
    }
    return greetings.get(language, greetings["en"])
