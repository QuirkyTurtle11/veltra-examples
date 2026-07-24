/**
 * Load and grow the labeled training set (training-data.json).
 *
 * The file ships with a handful of illustrative example rows so `score` works on a fresh
 * clone. Replace them with your own judgments using `label` mode — the more real wallets you
 * label, the better the model gets.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { LabeledExample } from './model.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA_PATH = join(HERE, '..', 'training-data.json')

export async function loadTrainingData(): Promise<LabeledExample[]> {
  const raw = await readFile(DATA_PATH, 'utf8')
  return JSON.parse(raw) as LabeledExample[]
}

/** Append one labeled example and persist. Returns the new total count. */
export async function appendTrainingExample(example: LabeledExample): Promise<number> {
  const data = await loadTrainingData()
  data.push(example)
  await writeFile(DATA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8')
  return data.length
}

/** How many of the rows are the shipped illustrative examples vs. real labeled wallets. */
export function countRealExamples(data: LabeledExample[]): number {
  return data.filter((e) => !e.wallet?.startsWith('example-')).length
}
