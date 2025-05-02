import {type Did, isDid} from '@atproto/api'
import {useQuery} from '@tanstack/react-query'

import {STALE} from '.'
import {LRU} from './direct-fetch-record'

const RQKEY_ROOT = 'resolve-identity'
export const RQKEY = (did: string) => [RQKEY_ROOT, did]

// this isn't trusted...
export type DidDocument = {
  '@context': string[]
  id: string
  alsoKnownAs?: string[]
  verificationMethod: VerificationMethod[]
  service: Service[]
}

export type VerificationMethod = {
  id: string
  type: string
  controller: string
  publicKeyMultibase: string
}

export type Service = {
  id: string
  type: string
  serviceEndpoint: string
}

const serviceCache = new LRU<Did, DidDocument>()

export async function resolveDidDocument(did: Did) {
  return await serviceCache.getOrTryInsertWith(did, async () => {
    const docUrl = did.startsWith('did:plc:')
      ? `https://plc.directory/${did}`
      : `https://${did.substring(8)}/.well-known/did.json`

    // TODO: we should probably validate this...
    return await (await fetch(docUrl)).json()
  })
}

export function findService(doc: DidDocument, id: string, type?: string) {
  return doc.service.find(s => s.id === id && (!type || s.type === type))
}

export async function resolvePdsServiceUrl(did: Did) {
  const doc = await resolveDidDocument(did)
  return findService(doc, '#atproto_pds', 'AtprotoPersonalDataServer')
    ?.serviceEndpoint
}

export function useDidDocument({did}: {did: string}) {
  return useQuery<DidDocument | undefined>({
    staleTime: STALE.HOURS.ONE,
    queryKey: RQKEY(did || ''),
    async queryFn() {
      if (!isDid(did)) return undefined
      return await resolveDidDocument(did)
    },
    enabled: isDid(did),
  })
}
