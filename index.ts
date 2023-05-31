import { program } from 'commander'
import { Wallet } from '@ethersproject/wallet'
import { JsonRpcProvider, TransactionReceipt } from '@ethersproject/providers'
import { AddressZero } from '@ethersproject/constants'
import { getAddress } from '@ethersproject/address'
import fs from 'fs'
import deploy from './src/deploy'
import { MigrationState } from './src/migrations'
import { asciiStringToBytes32 } from './src/util/asciiStringToBytes32'
import { version } from './package.json'
import { WormholeSettings } from './src/options/whSettings'

program
  .requiredOption('-pk, --private-key <string>', 'Private key used to deploy all contracts')
  .requiredOption('-j, --json-rpc <url>', 'JSON RPC URL where the program should be deployed')
  .requiredOption('-w9, --weth9-address <address>', 'Address of the WETH9 contract on this chain')
  .requiredOption('-ncl, --native-currency-label <string>', 'Native currency label, e.g. ETH')
  .option(
    '-o, --owner-address <address>',
    `Contract address that will own the deployed artifacts after the script runs. If --wormhole-enable is set, this setting will be ignored, and the owner will be set to the receiver`
  )
  .option('-s, --state <path>', 'Path to the JSON file containing the migrations state (optional)', './state.json')
  .option('-v2, --v2-core-factory-address <address>', 'The V2 core factory address used in the swap router (optional)')
  .option('-g, --gas-price <number>', 'The gas price to pay in GWEI for each transaction (optional)')
  .option('-c, --confirmations <number>', 'How many confirmations to wait for after each transaction (optional)', '2')
  .option('-wh, --wormhole-enable', 'Whether or not to enable Wormhole for the deployment. Wormhole settings are ignored unless this is set to true', false)
  .option('--wormhole-chain-id <number>', 'Chain ID to configure wormhole using', "1")
  .option('--wormhole-bridge-address <address>', 'Address of the Wormhole bridge', "")
  .option('--wormhole-receiver-address <address>', 'Address of the Wormhole receiver', "")
  .option('--wormhole-receiver-deploy', 'If true, deploy a Wormhole receiver. The setting is ignored if --wormhole-receiver-address is set', false)
  .option('--wormhole-message-sender-address <address>', 'Address of the Wormhole message sender. Required if --wormhole-receiver-deploy is set', "")

program.name('npx @uniswap/deploy-v3').version(version).parse(process.argv)

const tryWith = (fn: ()=>void, errorTmpl:string)=>{
  try {
    fn()
  } catch(error) {
    console.error(errorTmpl, (error as Error).message)
    process.exit(1)
  }
}

/// wormhole config
let wormhole: WormholeSettings = {
  enabled: false,
  chain_id: 0,
  receiver_deploy: false,
  message_sender: "",
}
wormhole.enabled = program.wormholeEnable
wormhole.receiver_deploy = program.wormholeReceiverDeploy
if(wormhole.enabled) {
  tryWith(()=>{
    wormhole.chain_id = parseInt(program.wormholeChainId)
  },'Failed to parse Wormhole Chain ID')

  tryWith(()=>{
      wormhole.bridge_address = getAddress(program.wormholeBridgeAddress)
  },'Failed to parse Wormhole Bridge configuration')
  tryWith(()=>{
    if(wormhole.receiver_deploy === false ) {
      wormhole.receiver_address = getAddress(program.wormholeReceiverAddress)
    }
  },'Failed to parse Wormhole Receiver configuration')

  if(wormhole.receiver_deploy) {
    tryWith(()=>{
      wormhole.message_sender = getAddress(program.wormholeMessageSenderAddress)
    },'Failed to parse Wormhole Message Sender Address')
  }
}
// end wormhole config

if (!/^0x[a-zA-Z0-9]{64}$/.test(program.privateKey)) {
  console.error('Invalid private key!')
  process.exit(1)
}

let url: URL

tryWith(()=>{
  url = new URL(program.jsonRpc)
},'Invalid JSON RPC URL')

let gasPrice: number | undefined
tryWith(()=>{
  gasPrice = program.gasPrice ? parseInt(program.gasPrice) : undefined
},'Failed to parse gas price')

let confirmations: number
tryWith(()=>{
  confirmations = parseInt(program.confirmations)
},'Failed to parse confirmations')

let nativeCurrencyLabelBytes: string
tryWith(()=>{
  nativeCurrencyLabelBytes = asciiStringToBytes32(program.nativeCurrencyLabel)
},'Invalid native currency label')

let weth9Address: string
tryWith(()=>{
  weth9Address = getAddress(program.weth9Address)
},'Invalid WETH9 address')

let v2CoreFactoryAddress: string
if (typeof program.v2CoreFactoryAddress === 'undefined') {
  v2CoreFactoryAddress = AddressZero
} else {
  tryWith(()=>{
    v2CoreFactoryAddress = getAddress(program.v2CoreFactoryAddress)
  },'Invalid V2 factory address')
}

let ownerAddress: string
if(wormhole.enabled === false) {
  if(!program.ownerAddress || program.ownerAddress == "") {
    console.error('Owner address must be set if wormhole is disabled')
    process.exit(1)
  }
  tryWith(()=>{
    ownerAddress = getAddress(program.ownerAddress)
  },'Invalid owner address')
}

const wallet = new Wallet(program.privateKey, new JsonRpcProvider({ url: url!.href }))

let state: MigrationState
if (fs.existsSync(program.state)) {
  try {
    state = JSON.parse(fs.readFileSync(program.state, { encoding: 'utf8' }))
  } catch (error) {
    console.error('Failed to load and parse migration state file', (error as Error).message)
    process.exit(1)
  }
} else {
  state = {}
}

let finalState: MigrationState
const onStateChange = async (newState: MigrationState): Promise<void> => {
  fs.writeFileSync(program.state, JSON.stringify(newState))
  finalState = newState
}

async function run() {
  let step = 1
  const results = []
  const generator = deploy({
    signer: wallet,
    gasPrice,
    nativeCurrencyLabelBytes,
    v2CoreFactoryAddress,
    ownerAddress,
    weth9Address,
    initialState: state,
    onStateChange,
    wormhole,
  })

  for await (const result of generator) {
    console.log(`Step ${step++} complete`, result)
    results.push(result)

    // wait 15 minutes for any transactions sent in the step
    await Promise.all(
      result.map(
        (stepResult): Promise<TransactionReceipt | true> => {
          if (stepResult.hash) {
            return wallet.provider.waitForTransaction(stepResult.hash, confirmations, /* 15 minutes */ 1000 * 60 * 15)
          } else {
            return Promise.resolve(true)
          }
        }
      )
    )
  }

  return results
}

run()
.then((results) => {
  console.log('Deployment succeeded')
  console.log(JSON.stringify(results))
  console.log('Final state')
  console.log(JSON.stringify(finalState))
  process.exit(0)
})
.catch((error) => {
  console.error('Deployment failed', error)
  console.log('Final state')
  console.log(JSON.stringify(finalState))
  process.exit(1)
})
