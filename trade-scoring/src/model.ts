/**
 * A thin wrapper around a real Random Forest classifier (the `ml-random-forest` library).
 *
 * The model learns to separate "worth following" wallets (label 1) from the rest (label 0)
 * based on the feature vectors in features.ts, and returns a probability in [0, 1] that a new
 * wallet is worth following — that probability is the wallet's score.
 */

import { RandomForestClassifier } from 'ml-random-forest'
import { FEATURE_KEYS, toRow, type FeatureVector } from './features.js'

/** One labeled training example: a wallet's features and whether it's worth following. */
export interface LabeledExample {
  /** Optional, for traceability in the training file. */
  wallet?: string
  label: 0 | 1
  features: FeatureVector
}

export class WalletScorer {
  private forest: RandomForestClassifier

  private constructor(forest: RandomForestClassifier) {
    this.forest = forest
  }

  /**
   * Minimum labeled rows to train. The random forest can't reliably bootstrap from a very
   * small set, and a model trained on a handful of wallets wouldn't generalize anyway.
   */
  static readonly MIN_TRAINING_EXAMPLES = 10

  /** Train a scorer on labeled wallet examples. Needs both labels and enough rows. */
  static train(examples: LabeledExample[]): WalletScorer {
    if (examples.length < WalletScorer.MIN_TRAINING_EXAMPLES) {
      throw new Error(
        `Need at least ${WalletScorer.MIN_TRAINING_EXAMPLES} labeled wallets to train ` +
          `(have ${examples.length}). Label more with: npm start -- label <wallet> <good|bad>`
      )
    }
    const labels = new Set(examples.map((e) => e.label))
    if (!labels.has(0) || !labels.has(1)) {
      throw new Error(
        'Training set needs at least one wallet of each label (0 and 1). ' +
          'Label more wallets with: npm start -- label <wallet> <good|bad>'
      )
    }

    const X = examples.map((e) => toRow(e.features))
    const y = examples.map((e) => e.label)

    const forest = new RandomForestClassifier({
      nEstimators: 100,
      // Standard random-forest practice: consider sqrt(nFeatures) features per split. This
      // also sidesteps an ml-random-forest boundary bug when maxFeatures == nFeatures.
      maxFeatures: Math.max(1, Math.floor(Math.sqrt(FEATURE_KEYS.length))),
      replacement: true,
      seed: 42,
    })
    forest.train(X, y)
    return new WalletScorer(forest)
  }

  /** Probability in [0, 1] that the given wallet is worth following. */
  score(features: FeatureVector): number {
    const probs = this.forest.predictProbability([toRow(features)], 1)
    return probs[0]
  }
}
