import {isDid} from '@atproto/api'

import {device, useStorage} from '#/storage'

export function useCustomAppViewDid() {
  const [customAppViewDid = undefined, setCustomAppViewDid] = useStorage(
    device,
    ['customAppViewDid'],
  )

  return [customAppViewDid, setCustomAppViewDid] as const
}

export function readCustomAppViewDidUri() {
  const maybeDid = device.get(['customAppViewDid'])
  if (!isDid(maybeDid)) {
    return undefined
  }

  return `${maybeDid}#bsky_appview` as `did:${string}#bsky_appview`
}
