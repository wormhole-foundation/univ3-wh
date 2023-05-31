export interface WormholeSettings {
  enabled: boolean

  chain_id: number

  bridge_address?: string

  receiver_deploy: boolean
  receiver_address?: string

  message_sender?: string
}
