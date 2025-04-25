import {type AppBskyActorGetProfile} from '@atproto/api'
import {useMutation, useQueryClient} from '@tanstack/react-query'

import {until} from '#/lib/async/until'
import {logger} from '#/logger'
import {useConstellationInstance} from '#/state/preferences/constellation-instance'
import {
  useDeerVerificationEnabled,
  useDeerVerificationTrusted,
} from '#/state/preferences/deer-verification'
import {useUpdateProfileVerificationCache} from '#/state/queries/verification/useUpdateProfileVerificationCache'
import {useAgent, useSession} from '#/state/session'
import type * as bsky from '#/types/bsky'
import {asUri, asyncGenFind, type ConstellationLink} from '../constellation'
import {
  getTrustedConstellationVerifications,
  RQKEY as DEER_VERIFICATION_RQKEY,
} from '../deer-verification'

export function useVerificationCreateMutation() {
  const agent = useAgent()
  const {currentAccount} = useSession()
  const updateProfileVerificationCache = useUpdateProfileVerificationCache()

  const qc = useQueryClient()
  const deerVerificationEnabled = useDeerVerificationEnabled()
  const deerVerificationTrusted = useDeerVerificationTrusted(
    currentAccount?.did,
  )
  const constellationInstance = useConstellationInstance()

  return useMutation({
    async mutationFn({profile}: {profile: bsky.profile.AnyProfileView}) {
      if (!currentAccount) {
        throw new Error('User not logged in')
      }

      const {uri} = await agent.app.bsky.graph.verification.create(
        {repo: currentAccount.did},
        {
          subject: profile.did,
          createdAt: new Date().toISOString(),
          handle: profile.handle,
          displayName: profile.displayName || '',
        },
      )

      if (deerVerificationEnabled) {
        await until(
          10,
          2e3,
          (link: ConstellationLink | undefined) => {
            console.log(link)
            return link !== undefined
          },
          () => {
            return asyncGenFind(
              getTrustedConstellationVerifications(
                constellationInstance,
                profile.did,
                deerVerificationTrusted,
              ),
              link => asUri(link) === uri,
            )
          },
        )
      } else {
        await until(
          5,
          1e3,
          ({data: profile}: AppBskyActorGetProfile.Response) => {
            if (
              profile.verification &&
              profile.verification.verifications.find(v => v.uri === uri)
            ) {
              return true
            }
            return false
          },
          () => {
            return agent.getProfile({actor: profile.did ?? ''})
          },
        )
      }
    },
    async onSuccess(_, {profile}) {
      logger.metric('verification:create', {})
      await updateProfileVerificationCache({profile})
      qc.invalidateQueries({
        queryKey: DEER_VERIFICATION_RQKEY(profile.did, deerVerificationTrusted),
      })
    },
  })
}
