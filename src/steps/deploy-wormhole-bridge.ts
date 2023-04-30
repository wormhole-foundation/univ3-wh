import createConditionalDeployContractStep from './meta/createConditionalDeployContractStep'

export const DEPLOY_WORMHOLE_BRIDGE = createConditionalDeployContractStep(
  {
    key: 'wormholeBridgeAddress',
    artifact: {} as any,
    computeArguments(_) {
      return []
    },
  },
  async (_, config) => {
    if (!config.wormhole) {
      return [true, undefined]
    }
    if (config.wormhole.bridge_deploy === true) {
      return [false, undefined]
    } else {
      if (config.wormhole.bridge_address) {
        return [false, config.wormhole.bridge_address]
      }
    }
    return [false, undefined]
  }
)
