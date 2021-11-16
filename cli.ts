import * as fmt from "https://deno.land/std@0.111.0/fmt/colors.ts";
import { parse } from "https://deno.land/std@0.111.0/flags/mod.ts";
import { countTokens } from "https://raw.githubusercontent.com/eibens/gpt3_utils/v1.0.0-alpha.3/tokenize.ts";
import {
  CompletionParams,
  CompletionResult,
  create,
} from "https://raw.githubusercontent.com/eibens/gpt3_utils/v1.0.0-alpha.3/completions.ts";
import { parse as parseVersion } from "https://deno.land/x/module_url@v0.3.0/mod.ts";

// PRESETS

type Preset = Partial<CompletionParams> & {
  template: (x: string) => string;
  tokens: number;
  temperature: number;
};

const presets: Record<string, Preset> = {
  default: {
    tokens: 100,
    temperature: 0.5,
    template: (x) => x,
  },
  bash: {
    tokens: 100,
    temperature: 0.2,
    stop: "",
    template: (x: string) =>
      [
        "# Navigate out of the current directory.",
        "cd ..",
        ``,
        x,
      ].join("\n"),
  },
  preact: {
    tokens: 1000,
    temperature: 0.2,
    template: (x: string) =>
      [
        'import * as React from "preact";',
        "",
        x,
      ].join("\n"),
  },
  react: {
    tokens: 1000,
    temperature: 0.2,
    template: (x: string) =>
      [
        'import * as React from "react";',
        "",
        x,
      ].join("\n"),
  },
};

// CLI PAGES

const HELP = `
shill: generates text using OpenAI's API

USAGE:
\tshill [...options] <prompt>

ARGUMENTS:
\tprompt
\t\tinput text for the OpenAI API query

OPTIONS: 
\t-h, --help
\t\tshow this help message and exit
\t-v, --version
\t\tshow the shill command's version and exit
\t-e, --engine=<name>
\t\tname of language engine (default: davinci-codex)
\t-t, --temp=<num>
\t\tquery temperature (default: 0.5)
\t-n, --tokens=<num>
\t\tmaximum output length excluding prompt length (default: 100)
\t-p, --preset=<name>
\t\tname of the preset that should be used (default: default)
\t-f, --fast
\t\tshorthand for using cushman-codex as engine
\t    --dry
\t\ttry the shill command without making an API request

PRESETS:
${Object.keys(presets).map((x) => `\t${x}\n`).join("")}

ENVIRONMENT:
\tOPENAI_API_KEY
\t\tsecret key provided by OpenAI
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
  dry: boolean;
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
    boolean: ["help", "version", "dry", "fast"],
    alias: {
      preset: "p",
      engine: "e",
      temp: "t",
      tokens: "n",
      help: "h",
      version: "v",
      fast: "f",
    },
  });

  const help = Boolean(flags.help);
  const version = Boolean(flags.version);
  const dry = Boolean(flags.dry);

  const presetName = flags.preset || "default";
  const preset = presets[presetName];
  if (!preset) {
    throw new Error(`Option 'preset' must be a valid preset.`);
  }

  const presetEngine = flags.fast ? "cushman-codex" : "davinci-codex";
  const engine = flags.engine || presetEngine;

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
  const keyEnv = "OPENAI_API_KEY";
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
    dry,
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
  const maxTokens = countTokens(prompt) + options.tokens;
  const params: CompletionParams = {
    maxTokens,
    prompt,
    temperature: options.temp,
    engine: options.engine,
  };
  await logRequest(params, () => {
    if (options.dry) {
      // Return some placeholder data for the dry run.
      return Promise.resolve({
        id: "<none>",
        model: "<none>",
        object: "<none>",
        created: Math.round(Date.now() / 1000),
        choices: [{
          index: 0,
          logprobs: null,
          finishReason: "<none>",
          text: fmt.bold(fmt.red("\n(this was a dry run)")),
        }],
      });
    } else {
      // Return the result of an actual OpenAI API request.
      return create({
        fetch,
        apiKey: options.key,
        params,
      });
    }
  });
}

async function logRequest(
  params: CompletionParams,
  run: () => Promise<CompletionResult>,
) {
  // Log prompt parameters.
  logObject(fmt.green(`request`), {
    engine: params.engine,
    temperature: params.temperature,
    max_tokens: params.maxTokens,
  });

  const result = await run();

  logObject(fmt.green(`response ${fmt.bold(result.id)}`), {
    model: result.model,
    object: result.object,
    created: result.created,
    choices: result.choices.length,
  });

  for (const choice of result.choices) {
    logObject(fmt.yellow(`choice ${fmt.bold(String(choice.index))}`), {
      finish_reason: choice.finishReason,
      logprobs: choice.logprobs,
    });
    log("\n" + params.prompt + choice.text + "\n");
  }
}

function log(value: unknown) {
  Deno.stderr.write(new TextEncoder().encode(String(value)));
}

function logObject(title: string, props: Record<string, unknown>) {
  log("\n" + title + "\n");
  for (const key in props) {
    const value = props[key];
    log(`  - ${key}: ${fmt.bold(String(value))}` + "\n");
  }
}

// RUN

if (import.meta.main) {
  await cli(Deno);
}
