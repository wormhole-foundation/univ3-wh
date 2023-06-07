import createConditionalDeployContractStep from './meta/createConditionalDeployContractStep'

import dappToolsArtifact from '../../contracts/UniswapWormholeMessageReceiver.json'

export const DEPLOY_WORMHOLE_RECEIVER = createConditionalDeployContractStep(
  {
    key: 'wormholeReceiverAddress',
    artifact: {
      abi: dappToolsArtifact.abi,
      contractName: 'UniswapWormholeMessageReceiver',
      bytecode: dappToolsArtifact.bytecode.object,
      linkReferences: dappToolsArtifact.bytecode.linkReferences,
    },
    computeArguments(_, config) {
      if (config.wormhole.bridge_address === undefined) {
        throw new Error('Missing Wormhole Bridge')
      }
      if (config.wormhole.message_sender === undefined) {
        throw new Error('Missing Wormhole Message Sender')
      }
      return [config.wormhole.bridge_address, config.wormhole.message_sender, config.wormhole.chain_id]
    },
  },
  async (_, config) => {
    if (!config.wormhole) {
      return [true, undefined]
    }
    if (config.wormhole.receiver_deploy === true) {
      return [false, undefined]
    } else {
      if (config.wormhole.receiver_address) {
        return [false, config.wormhole.receiver_address]
      }
    }
    return [false, undefined]
  }
)
