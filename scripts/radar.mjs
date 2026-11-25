import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

function runCli(entry) {
  const child = spawnSync(process.execPath, ['--use-env-proxy', '--import', 'tsx', entry], {
    cwd: root, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit']
  });
  if (child.error) throw child.error;
  if (child.signal) throw new Error('Processo interrompido por ' + child.signal);
  if (!child.stdout.trim()) throw new Error('Comando sem relatório: ' + entry);
  return { code: child.status, value: JSON.parse(child.stdout) };
}

export function runCycle(run = runCli) {
  const report = { startedAt: new Date().toISOString(), sources: [], opportunities: [], errors: [], submissions: 0 };
  try {
    const { code, value } = run('src/discovery/collect-cli.ts');
    if (!Array.isArray(value)) throw new Error('Resultado da coleta inválido');
    report.sources = value;
    if (code !== 0) report.errors.push('Coleta parcial. Consulte o resultado de cada fonte.');
  } catch (err) {
    report.errors.push('Falha na coleta: ' + err.message);
  }
  try {
    const { code, value } = run('src/applications/simulate-cli.ts');
    if (code !== 0 || value.mode !== 'simulation' || value.realSubmission !== false || !Array.isArray(value.results)) {
      throw new Error('Resultado de planejamento inválido');
    }
    // O simulador inclui as vagas do histórico, inclusive em ciclos de coleta parcial.
    report.opportunities = value.results.map(({ identity, title, url, status, pending, reasons }) =>
      ({ identity, title, url, status, pending, reasons }));
  } catch (err) {
    report.errors.push('Falha no planejamento: ' + err.message);
  }
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = join(root, 'private', 'radar');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dest = mkdtempSync(join(dir, new Date().toISOString().replace(/[:.]/g, '-') + '-'));
  const report = runCycle();
  const output = join(dest, 'resultado.json');
  writeFileSync(output + '.tmp', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  renameSync(output + '.tmp', output);
  console.log(output);
  for (const message of report.errors) console.error(message);
  process.exitCode = report.errors.length ? 1 : 0;
}
