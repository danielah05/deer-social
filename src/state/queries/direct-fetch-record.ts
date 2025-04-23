import {
  type AppBskyEmbedRecord,
  type AppBskyFeedDefs,
  AppBskyFeedPost,
  AtUri,
  type BskyAgent,
} from '@atproto/api'
import {type ProfileViewBasic} from '@atproto/api/dist/client/types/app/bsky/actor/defs'
import {useQuery} from '@tanstack/react-query'

import {retry} from '#/lib/async/retry'
import {STALE} from '#/state/queries'
import {useAgent} from '#/state/session'
import * as bsky from '#/types/bsky'

const RQKEY_ROOT = 'direct-fetch-record'
export const RQKEY = (uri: string) => [RQKEY_ROOT, uri]

export async function directFetchRecordAndProfile(
  agent: BskyAgent,
  uri: string,
) {
  const urip = new AtUri(uri)

  if (!urip.host.startsWith('did:')) {
    const res = await agent.resolveHandle({
      handle: urip.host,
    })
    urip.host = res.data.did
  }

  try {
    const [profile, record] = await Promise.all([
      (async () => (await agent.getProfile({actor: urip.host})).data)(),
      (async () =>
        (
          await retry(
            2,
            e => {
              if (e.message.includes(`Could not locate record:`)) {
                return false
              }
              return true
            },
            () =>
              agent.api.com.atproto.repo.getRecord({
                repo: urip.host,
                collection: 'app.bsky.feed.post',
                rkey: urip.rkey,
              }),
          )
        ).data.value)(),
    ])

    return {profile, record}
  } catch (e) {
    console.error(e)
    return undefined
  }
}

export async function directFetchEmbedRecord(
  agent: BskyAgent,
  uri: string,
): Promise<AppBskyEmbedRecord.ViewRecord | undefined> {
  const res = await directFetchRecordAndProfile(agent, uri)
  if (res === undefined) return undefined
  const {profile, record} = res

  if (record && bsky.validate(record, AppBskyFeedPost.validateRecord)) {
    return {
      $type: 'app.bsky.embed.record#viewRecord',
      uri,
      author: profile as ProfileViewBasic,
      cid: 'directfetch',
      value: record,
      indexedAt: new Date().toISOString(),
    } satisfies AppBskyEmbedRecord.ViewRecord
  } else {
    return undefined
  }
}

export function useDirectFetchEmbedRecord({
  uri,
  enabled,
}: {
  uri: string
  enabled?: boolean
}) {
  const agent = useAgent()
  return useQuery<AppBskyEmbedRecord.ViewRecord | undefined>({
    staleTime: STALE.HOURS.ONE,
    queryKey: RQKEY(uri || ''),
    async queryFn() {
      return directFetchEmbedRecord(agent, uri)
    },
    enabled: enabled && !!uri,
  })
}

export async function directFetchPostRecord(
  agent: BskyAgent,
  uri: string,
): Promise<AppBskyFeedDefs.PostView | undefined> {
  const res = await directFetchRecordAndProfile(agent, uri)
  if (res === undefined) return undefined
  const {profile, record} = res

  if (record && bsky.validate(record, AppBskyFeedPost.validateRecord)) {
    return {
      $type: 'app.bsky.feed.defs#postView',
      uri,
      author: profile as ProfileViewBasic,
      cid: 'directfetch',
      record,
      indexedAt: new Date().toISOString(),
    } satisfies AppBskyFeedDefs.PostView
  } else {
    return undefined
  }
}
