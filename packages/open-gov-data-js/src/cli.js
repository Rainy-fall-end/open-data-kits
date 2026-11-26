import { readFile } from 'node:fs/promises';

import { APIFY_SOURCES, RAPIDAPI_SOURCES, getCatalog } from './catalog.js';
import { OpenGovDataClient } from './client.js';
import { OpenGovDataError, safeError } from './errors.js';

const VERSION = '0.1.0';

export const USAGE = `open-gov-data ${VERSION}

Usage:
  open-gov-data catalog [--compact]
  open-gov-data apify <source> [options]
  open-gov-data rapidapi <source> [options]

Options:
  --input-json <json>              Request input JSON object (default: {})
  --input-file <path>              Read request input JSON from a file
  --max-items <integer>            Returned item cap (default: 10; max: 1000)
  --max-total-charge-usd <decimal> Apify hard run cap (default: 0.25)
  --timeout-ms <integer>           Timeout in milliseconds (default: 30000)
  --compact                        Emit compact JSON
  --help                           Show this help
  --version                        Show the version

Credentials are read only from APIFY_TOKEN and RAPIDAPI_KEY/X_RAPIDAPI_KEY.
Apify sources: ${Object.keys(APIFY_SOURCES).join(', ')}
RapidAPI sources: ${Object.keys(RAPIDAPI_SOURCES).join(', ')}
`;

function usageError(message = 'Invalid command-line arguments') {
  return new OpenGovDataError('CLI_USAGE', message);
}

function parseInteger(value, message) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw usageError(message);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw usageError(message);
  return number;
}

function takeValue(argv, index) {
  if (index + 1 >= argv.length) throw usageError('A command option is missing its value');
  return argv[index + 1];
}

function parseCommand(argv) {
  if (!Array.isArray(argv)) throw usageError();
  if (argv.length === 0 || argv.includes('--help')) return { command: 'help' };
  if (argv.length === 1 && argv[0] === '--version') return { command: 'version' };

  const command = argv[0];
  if (command === 'catalog') {
    if (argv.length > 2 || (argv[1] !== undefined && argv[1] !== '--compact')) {
      throw usageError();
    }
    return { command, compact: argv[1] === '--compact' };
  }
  if (command !== 'apify' && command !== 'rapidapi') throw usageError();
  if (typeof argv[1] !== 'string' || argv[1].startsWith('--')) {
    throw usageError('A source key is required');
  }

  const parsed = {
    command,
    source: argv[1],
    inputJson: '{}',
    inputFile: undefined,
    maxItems: 10,
    maxTotalChargeUsd: '0.25',
    timeoutMs: 30_000,
    compact: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--compact') {
      parsed.compact = true;
      continue;
    }
    if (argument === '--input-json') {
      parsed.inputJson = takeValue(argv, index);
      index += 1;
      continue;
    }
    if (argument === '--input-file') {
      parsed.inputFile = takeValue(argv, index);
      index += 1;
      continue;
    }
    if (argument === '--max-items') {
      parsed.maxItems = parseInteger(takeValue(argv, index), 'maxItems must be an integer');
      index += 1;
      continue;
    }
    if (argument === '--timeout-ms') {
      parsed.timeoutMs = parseInteger(takeValue(argv, index), 'timeoutMs must be an integer');
      index += 1;
      continue;
    }
    if (argument === '--max-total-charge-usd' && command === 'apify') {
      parsed.maxTotalChargeUsd = takeValue(argv, index);
      index += 1;
      continue;
    }
    throw usageError();
  }
  if (parsed.inputFile !== undefined && parsed.inputJson !== '{}') {
    throw usageError('Use either --input-json or --input-file, not both');
  }
  return parsed;
}

function writeJson(stream, value, compact) {
  stream.write(`${JSON.stringify(value, null, compact ? 0 : 2)}\n`);
}

export async function main(
  argv = process.argv.slice(2),
  { stdout = process.stdout, stderr = process.stderr, env = process.env } = {},
) {
  try {
    const args = parseCommand(argv);
    if (args.command === 'help') {
      stdout.write(USAGE);
      return 0;
    }
    if (args.command === 'version') {
      stdout.write(`${VERSION}\n`);
      return 0;
    }
    if (args.command === 'catalog') {
      writeJson(stdout, getCatalog(), args.compact);
      return 0;
    }

    const input = args.inputFile === undefined
      ? args.inputJson
      : await readFile(args.inputFile, { encoding: 'utf8' });
    const client = OpenGovDataClient.fromEnv({
      env,
      timeoutMs: args.timeoutMs,
      maxTotalChargeUsd: args.maxTotalChargeUsd,
    });
    const result = args.command === 'apify'
      ? await client.runActor(args.source, input, { maxItems: args.maxItems })
      : await client.queryRapidApi(args.source, input, { maxItems: args.maxItems });
    writeJson(stdout, result, args.compact);
    return 0;
  } catch (error) {
    if (error?.code === 'EPIPE' || error?.name === 'AbortError') return 130;
    writeJson(stderr, safeError(error), true);
    return error instanceof OpenGovDataError ? 2 : 1;
  }
}
