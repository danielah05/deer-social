import {AppBskyGraphVerification, AtUri, type BskyAgent} from '@atproto/api'
import {useQuery} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {useAgent} from '#/state/session'
import * as bsky from '#/types/bsky'
import {useConstellationInstance} from '../preferences/constellation-instance'
import {useDeerVerificationTrustedSet} from '../preferences/deer-verification'
import {
  asyncGenCollect,
  asyncGenFilter,
  asyncGenMap,
  asyncGenTake,
  constellationLinks,
} from './constellation'

const RQKEY_ROOT = 'deer-verification'
export const RQKEY = (uri: string) => [RQKEY_ROOT, uri]

async function requestDeerTrustedVerifications(
  agent: BskyAgent,
  instance: string,
  uri: string,
  trusted: Set<string>,
): Promise<AppBskyGraphVerification.Record[] | undefined> {
  const urip = new AtUri(uri)

  if (!urip.host.startsWith('did:')) {
    const res = await agent.resolveHandle({
      handle: urip.host,
    })
    urip.host = res.data.did
  }

  try {
    const verificationLinks = asyncGenTake(
      constellationLinks(instance, {
        target: urip.host,
        collection: 'app.bsky.graph.verification',
        path: '.subject',
        // TODO: remove this when constellation supports filtering
        // without a max here, a malicious user could create thousands of verification records and hang a client
        // since we can't filter to only trusted verifiers before searching for backlinks yet
      }),
      100,
    )

    const verifications = asyncGenFilter(
      asyncGenMap(
        asyncGenFilter(verificationLinks, ({did}) => trusted.has(did)),
        async ({did, rkey}) => {
          const docUrl = did.startsWith('did:plc:')
            ? `https://plc.directory/${did}`
            : `https://${did.substring(8)}/.well-known/did.json`

          // TODO: validate!
          const doc = await (await fetch(docUrl)).json()
          const service: string = doc.service.find(
            s => s.type === 'AtprotoPersonalDataServer',
          )?.serviceEndpoint
          const request = `${service}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=app.bsky.graph.verification&rkey=${rkey}`
          const record = await (await fetch(request)).json()

          return record.value
        },
      ),
      r =>
        bsky.validate<AppBskyGraphVerification.Record>(
          r,
          AppBskyGraphVerification.validateRecord,
        ),
    )

    // Array.fromAsync will do this but not available everywhere yet
    return asyncGenCollect(verifications)
  } catch (e) {
    console.error(e)
    return undefined
  }
}

export function useDeerTrustedVerificationRecords({
  uri,
  enabled,
}: {
  uri: string
  enabled?: boolean
}) {
  const agent = useAgent()
  const instance = useConstellationInstance()
  const trusted = useDeerVerificationTrustedSet()
  return useQuery<AppBskyGraphVerification.Record[] | undefined>({
    // TODO: is this too high lol
    staleTime: STALE.MINUTES.THIRTY,
    queryKey: RQKEY(uri || ''),
    async queryFn() {
      return requestDeerTrustedVerifications(agent, instance, uri, trusted)
    },
    enabled: enabled && !!uri,
  })
}
