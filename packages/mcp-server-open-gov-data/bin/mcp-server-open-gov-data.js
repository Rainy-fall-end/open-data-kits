#!/usr/bin/env node

import { runStdioServer } from '../src/index.js';

try {
  await runStdioServer();
} catch {
  process.stderr.write('mcp-server-open-gov-data: startup failed; check environment configuration\n');
  process.exitCode = 1;
}
