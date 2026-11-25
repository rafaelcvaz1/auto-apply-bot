import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCycle } from './radar.mjs';

const result = { identity: 'vaga-1', title: 'Analista', status: 'pending', filled: { email: 'private' } };
const simulation = { mode: 'simulation', realSubmission: false, results: [result] };

test('grava as fontes e as pendências sem copiar respostas pessoais', () => {
  const run = runCycle(entry => entry.includes('collect') ? { code: 0, value: [] } : { code: 0, value: simulation });
  assert.equal(run.errors.length, 0);
  assert.equal(run.opportunities[0].identity, 'vaga-1');
  assert.ok(!('filled' in run.opportunities[0]));
  assert.equal(run.submissions, 0);
});

test('mantém fontes parciais e informa a falha sem descartar o histórico', () => {
  const run = runCycle(entry => entry.includes('collect') ? { code: 1, value: [{ error: 'timeout' }] } : { code: 0, value: simulation });
  assert.equal(run.sources[0].error, 'timeout');
  assert.equal(run.opportunities.length, 1);
  assert.equal(run.errors.length, 1);
});

test('informa falhas das duas etapas separadamente', () => {
  const run = runCycle(() => { throw new Error('perfil ausente'); });
  assert.equal(run.errors.length, 2);
  assert.equal(run.opportunities.length, 0);
});
