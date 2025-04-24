import {AppBskyGraphVerification, AtUri, type BskyAgent} from '@atproto/api'
import {
  type VerificationState,
  type VerificationView,
} from '@atproto/api/dist/client/types/app/bsky/actor/defs'
import {useQuery} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {useAgent} from '#/state/session'
import * as bsky from '#/types/bsky'
import {type AnyProfileView} from '#/types/bsky/profile'
import {useConstellationInstance} from '../preferences/constellation-instance'
import {
  useDeerVerificationEnabled,
  useDeerVerificationTrusted,
} from '../preferences/deer-verification'
import {
  asUri,
  asyncGenCollect,
  asyncGenDedupe,
  asyncGenFilter,
  asyncGenMap,
  asyncGenTake,
  type ConstellationLink,
  constellationLinks,
} from './constellation'
import {useCurrentAccountProfile} from './useCurrentAccountProfile'

const RQKEY_ROOT = 'deer-verification'
export const RQKEY = (did: string, trusted: Set<string>) => [
  RQKEY_ROOT,
  did,
  Array.from(trusted).sort(),
]

async function requestDeerVerificationViews(
  agent: BskyAgent,
  instance: string,
  profile: AnyProfileView,
  trusted: Set<string>,
): Promise<VerificationView[] | undefined> {
  const urip = new AtUri(profile.did)

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
        asyncGenDedupe(
          asyncGenFilter(verificationLinks, ({did}) => trusted.has(did)),
          ({did}) => did,
        ),
        async link => {
          const {did, rkey} = link
          const docUrl = did.startsWith('did:plc:')
            ? `https://plc.directory/${did}`
            : `https://${did.substring(8)}/.well-known/did.json`

          // TODO: validate!
          const doc = await (await fetch(docUrl)).json()
          const service: string | undefined = doc.service.find(
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
      (d: {
        link: ConstellationLink
        record: unknown
      }): d is {
        link: ConstellationLink
        record: AppBskyGraphVerification.Record
      } =>
        bsky.validate<AppBskyGraphVerification.Record>(
          d.record,
          AppBskyGraphVerification.validateRecord,
        ),
    )

    const verificationViews = asyncGenMap(
      verifications,
      ({link, record}) =>
        ({
          issuer: link.did,
          isValid:
            profile.displayName === record.displayName &&
            profile.handle === record.handle,
          createdAt: record.createdAt,
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

function createVerificationState(
  verifications: VerificationView[],
  profile: AnyProfileView,
  trusted: Set<string>,
) {
  return {
    verifications,
    verifiedStatus:
      verifications.length > 0 && verifications.findIndex(v => v.isValid) !== -1
        ? 'valid'
        : 'none',
    trustedVerifierStatus: trusted.has(profile.did) ? 'valid' : 'none',
  }
}

function useDeerVerifierCtx() {
  const agent = useAgent()
  const instance = useConstellationInstance()
  const currentAccountProfile = useCurrentAccountProfile()
  const trusted = useDeerVerificationTrusted(currentAccountProfile?.did)

  return {agent, instance, trusted}
}

export function useDeerVerificationState({
  profile,
  enabled,
}: {
  profile: AnyProfileView | undefined
  enabled?: boolean
}) {
  const {agent, instance, trusted} = useDeerVerifierCtx()

  return useQuery<VerificationState | undefined>({
    staleTime: STALE.HOURS.ONE,
    queryKey: RQKEY(profile?.did || '', trusted),
    async queryFn() {
      if (!profile) return undefined

      const verifications = await requestDeerVerificationViews(
        agent,
        instance,
        profile,
        trusted,
      )
      if (verifications === undefined) return
      const verificationState = createVerificationState(
        verifications,
        profile,
        trusted,
      )

      return verificationState
    },
    enabled: enabled && profile !== undefined,
  })
}

export function useDeerVerificationProfileOverlay<V extends AnyProfileView>(
  profile: V,
): V {
  const enabled = useDeerVerificationEnabled()
  const verificationState = useDeerVerificationState({
    profile,
    enabled,
  })

  return enabled
    ? {
        ...profile,
        verification: verificationState.data,
      }
    : profile
}

export function useMaybeDeerVerificationProfileOverlay<
  V extends AnyProfileView,
>(profile: V | undefined): V | undefined {
  const enabled = useDeerVerificationEnabled()
  const verificationState = useDeerVerificationState({
    profile,
    enabled,
  })

  if (!profile) return undefined

  return enabled
    ? {
        ...profile,
        verification: verificationState.data,
      }
    : profile
}
