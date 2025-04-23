import {
  type AppBskyGraphVerification,
  AtUri,
  type BskyAgent,
} from '@atproto/api'
import {useQuery} from '@tanstack/react-query'

import {retry} from '#/lib/async/retry'
import {STALE} from '#/state/queries'
import {useAgent} from '#/state/session'
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

    const verifications = asyncGenMap(
      asyncGenFilter(verificationLinks, link => trusted.has(link.did)),
      link =>
        retry(
          2,
          e => {
            // i have ZERO idea if this is reasonable, i saw it somewhere else
            // but that was a record fetch, where as this has a client method. dunno
            // TODO: is this reasonable?
            if (e.message.includes(`Could not locate record:`)) {
              return false
            }
            return true
          },
          () =>
            agent.app.bsky.graph.verification.get({
              repo: link.did,
              rkey: link.rkey,
            }),
        ),
    )
    // we could be checking the uri and cid? the appview could lie (sholud we just be direct fetching here?)

    // Array.fromAsync will do this but not available everywhere yet
    return asyncGenCollect(asyncGenMap(verifications, r => r.value))
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
