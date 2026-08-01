import { spawn } from 'child_process';
import { tmpdir } from 'os';

/**
 * Headless `claude -p` text generation — reuses the Claude Code subscription
 * (same mechanism deploy/run-pipeline.sh uses for the 4-hourly pipeline)
 * instead of a metered Anthropic API key.
 *
 * launchd's PATH for com.immigration.web is minimal (see app/lib/videoJobs.ts
 * for the same issue with python3/ffmpeg), so both the claude binary and its
 * own node runtime need to be spelled out explicitly.
 */
const CLAUDE_BIN = '/Users/nguyenbaole/.local/bin/claude';
const CLAUDE_PATH = '/Users/nguyenbaole/.local/bin:/Users/nguyenbaole/.nvm/versions/node/v20.20.2/bin:/usr/local/bin:/usr/bin:/bin';
const TIMEOUT_MS = 60_000;

export async function generateViaClaudeCli(systemPrompt: string, userMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      CLAUDE_BIN,
      [
        '-p',
        '--system-prompt', systemPrompt,
        '--model', 'claude-sonnet-5',
        '--tools', '', // pure text generation — no file/bash access needed
        '--output-format', 'text',
        '--no-session-persistence',
        '--', userMessage, // end-of-options marker — userMessage may start with "--" (e.g. "--- TITLE ---")
      ],
      {
        // Neutral cwd — avoids this project's CLAUDE.md (compliance rules, coding
        // style, etc.) leaking irrelevant context into a plain generation call.
        cwd: tmpdir(),
        env: { ...process.env, PATH: CLAUDE_PATH },
        timeout: TIMEOUT_MS,
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      if (code === 0 && stdout.trim()) resolve(stdout.trim());
      else reject(new Error(stderr.trim().slice(-500) || `claude -p exited ${code}`));
    });
    child.on('error', reject);
  });
}
