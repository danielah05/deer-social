import {
  AppBskyGraphVerification,
  type AppBskyGraphVerificationRecord,
  AtUri,
  type BskyAgent,
} from '@atproto/api'
import {
  type VerificationState,
  type VerificationView,
} from '@atproto/api/dist/client/types/app/bsky/actor/defs'
import {useQuery} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {useAgent} from '#/state/session'
import * as bsky from '#/types/bsky'
import {useConstellationInstance} from '../preferences/constellation-instance'
import {useDeerVerificationTrustedSet} from '../preferences/deer-verification'
import {
  asUri,
  asyncGenCollect,
  asyncGenFilter,
  asyncGenMap,
  asyncGenTake,
  type ConstellationLink,
  constellationLinks,
} from './constellation'
import {useCurrentAccountProfile} from './useCurrentAccountProfile'

const RQKEY_ROOT = 'deer-verification'
export const RQKEY = (did: string) => [RQKEY_ROOT, did]

async function requestDeerVerificationViews(
  agent: BskyAgent,
  instance: string,
  uri: string,
  trusted: Set<string>,
): Promise<VerificationView[] | undefined> {
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
        async link => {
          const {did, rkey} = link
          const docUrl = did.startsWith('did:plc:')
            ? `https://plc.directory/${did}`
            : `https://${did.substring(8)}/.well-known/did.json`

          // TODO: validate!
          const doc = await (await fetch(docUrl)).json()
          const service: string = doc.service.find(
            s => s.type === 'AtprotoPersonalDataServer',
          )?.serviceEndpoint
          const request = `${service}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=app.bsky.graph.verification&rkey=${rkey}`
          const resp = await (await fetch(request)).json()
          // TODO: assert uri, cid match and compare with computed?
          const record = resp.value
          return {link, record}
        },
      ),
      // the explicit return type shouldn't be needed...
      (
        d,
      ): d is {
        link: ConstellationLink
        record: AppBskyGraphVerificationRecord
      } =>
        bsky.validate<AppBskyGraphVerification.Record>(
          d.record,
          AppBskyGraphVerification.validateRecord,
        ),
    )

    const verificationViews = asyncGenMap(
      verifications,
      ({link}) =>
        ({
          issuer: link.did,
          isValid: true,
          createdAt: new Date().toISOString(),
          uri: asUri(link),
        } satisfies VerificationView),
    )

    // Array.fromAsync will do this but not available everywhere yet
    return asyncGenCollect(verificationViews)
  } catch (e) {
    console.error(e)
    return undefined
  }
}

export function useDeerVerificationState({
  did,
  enabled,
}: {
  did: string
  enabled?: boolean
}) {
  const agent = useAgent()
  const instance = useConstellationInstance()
  const trusted = useDeerVerificationTrustedSet()
  const currentAccountProfile = useCurrentAccountProfile()
  return useQuery<VerificationState | undefined>({
    // TODO: is this too high lol
    staleTime: STALE.SECONDS.FIFTEEN,
    queryKey: RQKEY(did || ''),
    async queryFn() {
      const verifications = await requestDeerVerificationViews(
        agent,
        instance,
        did,
        trusted,
      )
      if (verifications === undefined) return
      if (verifications.length > 0) console.log(verifications)
      return {
        verifications,
        verifiedStatus: verifications.length > 0 ? 'valid' : 'none',
        trustedVerifierStatus:
          currentAccountProfile?.did === did || trusted.has(did)
            ? 'valid'
            : 'none',
      } satisfies VerificationState
    },
    enabled: enabled && !!did,
  })
}
