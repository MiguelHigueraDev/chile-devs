const LINGUIST_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Go: '#00ADD8',
  Rust: '#dea584',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  Vue: '#41b883',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  SQL: '#e38c00',
  PLpgSQL: '#336791',
  Scala: '#c22d40',
  R: '#198CE7',
  Elixir: '#6e4a7e',
  Haskell: '#5e5086',
  Lua: '#000080',
  Perl: '#0298c3',
  'Objective-C': '#438eff',
  'Objective-C++': '#6866fb',
  PowerShell: '#012456',
  Dockerfile: '#384d54',
  Makefile: '#427819',
  YAML: '#cb171e',
  JSON: '#292929',
  Markdown: '#083fa1',
  Jupyter: '#DA5B0B',
  Svelte: '#ff3e00',
  Zig: '#ec915c',
  Clojure: '#db5855',
  OCaml: '#3be133',
  FSharp: '#b845fc',
  'F#': '#b845fc',
  Groovy: '#4298b8',
  Terraform: '#5c4ee5',
  HCL: '#844FBA',
  Solidity: '#AA6746',
  Assembly: '#6E4C13',
  Nix: '#7e7eff',
  Gleam: '#ffaff3',
  Erlang: '#B83998',
};

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

export function getLanguageColor(name: string): string {
  return LINGUIST_COLORS[name] ?? `hsl(${hashString(name) % 360} 45% 55%)`;
}
