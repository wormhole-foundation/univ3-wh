import { WritableDraft } from 'immer/dist/internal'
import { MigrationConfig, MigrationState, MigrationStep } from '../../migrations'

import createDeployContractStep, { DeployContractStepArgs } from './createDeployContractStep'

export default function createConditionalDeployContractStep(
  args: DeployContractStepArgs,
  condition?: (state: WritableDraft<MigrationState>, config: MigrationConfig) => Promise<[boolean, string | undefined]>
): MigrationStep {
  return async (state, config) => {
    if (condition) {
      const [skip, extraResult] = await condition(state, config)
      if (skip) {
        return [
          {
            message: `Skipped deploying ${args.artifact.contractName}`,
            address: extraResult,
          },
        ]
      }
      if (extraResult !== undefined) {
        state[args.key] = extraResult
        return [
          {
            message: `Contract ${args.artifact.contractName} predeployed`,
            address: extraResult,
          },
        ]
      }
    }
    return createDeployContractStep(args)(state, config)
  }
}
