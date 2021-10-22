import * as fmt from "https://deno.land/std@0.111.0/fmt/colors.ts";
import { parse } from "https://deno.land/std@0.111.0/flags/mod.ts";
import { countTokens } from "https://raw.githubusercontent.com/eibens/gpt3_utils/v1.0.0-alpha/tokenize.ts";
import {
  query,
  QueryData,
} from "https://raw.githubusercontent.com/eibens/gpt3_utils/v1.0.0-alpha/mod.ts";
import { parse as parseVersion } from "https://deno.land/x/module_url@v0.2.0/mod.ts";

// PRESETS

type Preset = {
  template: (x: string) => string;
  tokens: number;
  temperature: number;
  engine: string;
};

const presets: Record<string, Preset> = {
  default: {
    engine: "cushman-codex",
    tokens: 100,
    temperature: 0.2,
    template: (x) => x,
  },
  bash: {
    engine: "cushman-codex",
    tokens: 100,
    temperature: 0.2,
    template: (x: string) =>
      [
        "# ---",
        "# List all files in the directory.",
        "ls",
        ``,
        "# ---",
        "# Navigate out of the current directory.",
        "cd ..",
        ``,
        "# ---",
        `# ${x.trim()}`,
        ``,
      ].join("\n"),
  },
  react: {
    engine: "cushman-codex",
    tokens: 1000,
    temperature: 0.2,
    template: (x: string) =>
      [
        'import * as React from "react";',
        "",
        `// ${x}`,
      ].join("\n"),
  },
};

// CLI PAGES

const HELP = `
shill: generates code using OpenAI's Codex

USAGE:
\tshill [...options] <prompt>

ARGUMENTS:
\tprompt
\t\tinput text for the Codex API query

OPTIONS: 
\t-h, --help
\t\tshow this help message and exit
\t-v, --version
\t\tshow the shill command's version and exit
\t-p, --preset=<name>
\t\tname of the preset that should be used
\t-e, --engine=<name>
\t\tname of codex engine (davinci-codex or cushman-codex)
\t-t, --temp=<num>
\t\tquery temperature (between 0 and 1)
\t-n, --tokens=<num>
\t\tmaximum output length (does not include prompt)

PRESETS:
${Object.keys(presets).map((x) => `\t${x}\n`).join("")}

ENVIRONMENT:
\tGPT3_API_KEY
\t\tOpenAI API key with Codex access
`.trimStart();

const version = parseVersion(import.meta.url);
const VERSION = `
shill ${version.tag || "<unknown>"}
url: ${version}
`.trim();

// OPTIONS

export type CliOptions = {
  stdin: Deno.Reader;
  stdout: Deno.Writer;
  args: string[];
  env: { get: (key: string) => string | undefined };
};

export type Options = {
  help: boolean;
  version: boolean;
  temp: number;
  tokens: number;
  prompt: string;
  engine: string;
  key: string;
  template: (x: string) => string;
};

function parseArgs(options: CliOptions): Options {
  const flags = parse(options.args, {
    string: ["preset", "temp", "tokens", "engine"],
    boolean: ["help", "version"],
    alias: {
      preset: "p",
      engine: "e",
      temp: "t",
      tokens: "n",
      help: "h",
      version: "v",
    },
  });

  const help = Boolean(flags.help);
  const version = Boolean(flags.version);

  const presetName = flags.preset || "default";
  const preset = presets[presetName];
  if (!preset) {
    throw new Error(`Option 'preset' must be a valid preset.`);
  }

  const engine = flags.engine || preset.engine;

  const temp = parseFloat(flags.temp || preset.temperature);
  if (isNaN(temp) || temp < 0 || 1 < temp) {
    throw new Error(
      `Option 'temp' must be a floating point number from 0 to 1.`,
    );
  }

  const tokens = parseInt(flags.tokens || preset.tokens);
  if (isNaN(tokens) || tokens < 1) {
    throw new Error(`Option 'tokens' must be a positive integer.`);
  }

  const prompt = String(flags._[0] || "");
  const keyEnv = "GPT3_API_KEY";
  const key = options.env.get(keyEnv) || "";

  if (!help && !version) {
    if (!key) {
      throw new Error(
        `Environment variable ${keyEnv} must contain an OpenAI API key.`,
      );
    }
    if (!prompt) {
      throw new Error(`Positional argument 'prompt' must be provided.`);
    }
  }

  return {
    engine,
    prompt,
    template: preset.template,
    temp,
    tokens,
    help,
    version,
    key,
  };
}

// IMPLEMENTATION

export function cli(options: CliOptions) {
  try {
    const opts = parseArgs(options);
    if (opts.help) {
      return console.log(HELP);
    } else if (opts.version) {
      return console.log(VERSION);
    } else {
      return main(opts);
    }
  } catch (error) {
    console.error(fmt.red("shill error"));
    console.error(error);
  }
}

async function main(options: Options) {
  const prompt = options.template(options.prompt);
  // deno-lint-ignore camelcase
  const max_tokens = countTokens(prompt) + options.tokens;
  const data: QueryData = {
    engine: "cushman-codex",
    // deno-lint-ignore camelcase
    max_tokens,
    temperature: options.temp,
    prompt,
  };

  console.error(fmt.cyan(`API parameters:`));
  for (const key in data) {
    console.error(
      `- ${fmt.italic(key)}: ${fmt.bold(String(data[key as never]))}`,
    );
  }

  const result = await query({
    fetch,
    auth: () => Promise.resolve(options.key),
    data,
  });
  const output = result.choices[0].text
    .split("# ---")[0].trim();
  console.log(output);
}

// RUN

if (import.meta.main) {
  await cli(Deno);
}
