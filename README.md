# [shill]

[shill] is a command-line tool for interacting with OpenAI's API.

[![License][license-shield]](LICENSE) [![Github
tag][github-shield]][github]
[![Build][build-shield]][build] [![Code
coverage][coverage-shield]][coverage]

## Install

```sh
deno install -f -n shill \
--allow-env=OPENAI_API_KEY \
--allow-net=api.openai.com \
https://raw.githubusercontent.com/eibens/shill/master/cli.ts
```

## Usage

An OpenAI API key is needed to use [shill]. Specify it by setting the
`OPENAI_API_KEY` environment variable.

```sh
export OPENAI_API_KEY="<your key>"
shill [options] <prompt>
```

# Examples

These examples demonstrate the `bash` preset. The bash code after the `shill`
command was generated by Codex.

```sh
shill --preset bash "Create a directory called 'x100'. In this directory \
create 100 JSON files numbered 001 to 100 (with leading zeros). To each file \
write the square of its number as a JSON object with a single 'number' field."

mkdir x100
for i in {1..100}
do
  echo -e '{\n"number":'$(($i*$i))'\n}' > x100/$(printf "%03d" $i).json
done
```

```sh
shill --preset bash "Replace the text 'number' with 'value' in each JSON file \
in the x100 directory."

for file in $(find x100 -name '*.json'); do
  sed -i 's/number/value/g' $file
done
```

```sh
shill --preset bash "# Get the 'value' property from all JSON files in the \
x100 directory. Write each value to a CSV table named 'list.csv' with two \
columns. The 'file' column contains the file name and the 'value' column \
contains the value from the file."

for file in $(find x100 -name '*.json'); do
  value=$(jq -r '.value' $file)
  echo $file,$value >> list.csv
done
```

# Development

```sh
# Format, lint, and run tests.
deno run -A dev.ts
```

[shill]: #

<!-- badges -->

[github]: https://github.com/eibens/shill
[github-shield]: https://img.shields.io/github/v/tag/eibens/shill?label&logo=github
[license-shield]: https://img.shields.io/github/license/eibens/shill?color=informational
[coverage-shield]: https://codecov.io/gh/eibens/shill/branch/master/graph/badge.svg?token=tf4kbmsw2A
[coverage]: https://codecov.io/gh/eibens/shill
[build]: https://github.com/eibens/shill/actions/workflows/ci.yml
[build-shield]: https://github.com/eibens/shill/actions/workflows/ci.yml/badge.svg
