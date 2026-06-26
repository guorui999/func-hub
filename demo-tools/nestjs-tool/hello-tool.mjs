const greetings = {
  en: (name) => `Hello, ${name}! Welcome to FuncHub.`,
  zh: (name) => `${name}，你好！欢迎使用 FuncHub。`,
  ja: (name) => `${name}さん、こんにちは！FuncHubへようこそ。`,
  fr: (name) => `Bonjour ${name} ! Bienvenue sur FuncHub.`,
  de: (name) => `Hallo ${name}! Willkommen bei FuncHub.`,
};

export async function hello_greeter({ name, language = "en" }) {
  const greet = greetings[language] || greetings.en;
  return greet(name);
}
