import React from 'react'
import {View} from 'react-native'
import {
  type $Typed,
  type AppBskyFeedDefs,
  AppBskyFeedPost,
  AtUri,
  moderatePost,
  RichText as RichTextAPI,
} from '@atproto/api'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useQueryClient} from '@tanstack/react-query'

import {usePalette} from '#/lib/hooks/usePalette'
import {makeProfileLink} from '#/lib/routes/links'
import {useDirectFetchRecords} from '#/state/preferences/direct-fetch-records'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {useDirectFetchEmbedRecord} from '#/state/queries/direct-fetch-record'
import {unstableCacheProfileView} from '#/state/queries/profile'
import {useSession} from '#/state/session'
import {Link} from '#/view/com/util/Link'
import {PostMeta} from '#/view/com/util/PostMeta'
import {atoms as a, useTheme} from '#/alf'
import {ContentHider} from '#/components/moderation/ContentHider'
import {PostAlerts} from '#/components/moderation/PostAlerts'
import {RichText} from '#/components/RichText'
import {Embed as StarterPackCard} from '#/components/StarterPack/StarterPackCard'
import {SubtleHover} from '#/components/SubtleHover'
import * as bsky from '#/types/bsky'
import {
  type Embed as TEmbed,
  type EmbedType,
  parseEmbed,
} from '#/types/bsky/post'
import {ExternalEmbed} from './ExternalEmbed'
import {ModeratedFeedEmbed} from './FeedEmbed'
import {ImageEmbed} from './ImageEmbed'
import {ModeratedListEmbed} from './ListEmbed'
import {PostPlaceholder as PostPlaceholderText} from './PostPlaceholder'
import {
  type CommonProps,
  type EmbedProps,
  PostEmbedViewContext,
  QuoteEmbedViewContext,
} from './types'
import {VideoEmbed} from './VideoEmbed'

export {PostEmbedViewContext, QuoteEmbedViewContext} from './types'

export function Embed({embed: rawEmbed, ...rest}: EmbedProps) {
  const embed = parseEmbed(rawEmbed)

  switch (embed.type) {
    case 'images':
    case 'link':
    case 'video': {
      return <MediaEmbed embed={embed} {...rest} />
    }
    case 'feed':
    case 'list':
    case 'starter_pack':
    case 'labeler':
    case 'post':
    case 'post_not_found':
    case 'post_blocked':
    case 'post_detached': {
      return <RecordEmbed embed={embed} {...rest} />
    }
    case 'post_with_media': {
      return (
        <View style={rest.style}>
          <MediaEmbed embed={embed.media} {...rest} />
          <RecordEmbed embed={embed.view} {...rest} />
        </View>
      )
    }
    default: {
      return null
    }
  }
}

function MediaEmbed({
  embed,
  ...rest
}: CommonProps & {
  embed: TEmbed
}) {
  switch (embed.type) {
    case 'images': {
      return (
        <ContentHider
          modui={rest.moderation?.ui('contentMedia')}
          activeStyle={[a.mt_sm]}>
          <ImageEmbed embed={embed} {...rest} />
        </ContentHider>
      )
    }
    case 'link': {
      return (
        <ContentHider
          modui={rest.moderation?.ui('contentMedia')}
          activeStyle={[a.mt_sm]}>
          <ExternalEmbed
            link={embed.view.external}
            onOpen={rest.onOpen}
            style={[a.mt_sm, rest.style]}
          />
        </ContentHider>
      )
    }
    case 'video': {
      return (
        <ContentHider
          modui={rest.moderation?.ui('contentMedia')}
          activeStyle={[a.mt_sm]}>
          <VideoEmbed embed={embed.view} crop="constrained" />
        </ContentHider>
      )
    }
    default: {
      return null
    }
  }
}

function RecordEmbed({
  embed,
  ...rest
}: CommonProps & {
  embed: TEmbed
}) {
  const {_} = useLingui()
  const directFetchEnabled = useDirectFetchRecords()
  const shouldDirectFetch =
    (embed.type === 'post_blocked' || embed.type === 'post_detached') &&
    directFetchEnabled

  const directRecord = useDirectFetchEmbedRecord({
    uri:
      embed.type === 'post_blocked' || embed.type === 'post_detached'
        ? embed.view.uri
        : '',
    enabled: shouldDirectFetch,
  })

  switch (embed.type) {
    case 'feed': {
      return (
        <View style={a.mt_sm}>
          <ModeratedFeedEmbed embed={embed} {...rest} />
        </View>
      )
    }
    case 'list': {
      return (
        <View style={a.mt_sm}>
          <ModeratedListEmbed embed={embed} />
        </View>
      )
    }
    case 'starter_pack': {
      return (
        <View style={a.mt_sm}>
          <StarterPackCard starterPack={embed.view} />
        </View>
      )
    }
    case 'labeler': {
      // not implemented
      return null
    }
    case 'post': {
      if (rest.isWithinQuote && !rest.allowNestedQuotes) {
        return null
      }

      return (
        <QuoteEmbed
          {...rest}
          embed={embed}
          viewContext={
            rest.viewContext === PostEmbedViewContext.Feed
              ? QuoteEmbedViewContext.FeedEmbedRecordWithMedia
              : undefined
          }
          isWithinQuote={rest.isWithinQuote}
          allowNestedQuotes={rest.allowNestedQuotes}
        />
      )
    }
    case 'post_not_found': {
      return (
        <PostPlaceholderText>
          <Trans>Deleted</Trans>
        </PostPlaceholderText>
      )
    }
    case 'post_blocked': {
      const record = directRecord.data
      if (record !== undefined) {
        return (
          <DirectFetchEmbed
            {...rest}
            embed={record}
            visibilityLabel={_(msg`Blocked`)}
          />
        )
      }

      return (
        <PostPlaceholderText directFetchEnabled={directFetchEnabled}>
          <Trans>Blocked</Trans>
        </PostPlaceholderText>
      )
    }
    case 'post_detached': {
      const record = directRecord.data
      if (record !== undefined) {
        return (
          <DirectFetchEmbed
            {...rest}
            embed={record}
            visibilityLabel={_(msg`Removed by author`)}
            visibilityLabelOwner={_(`Removed by you`)}
          />
        )
      }

      return (
        <PostDetachedEmbed
          embed={embed}
          directFetchEnabled={directFetchEnabled}
        />
      )
    }
    default: {
      return null
    }
  }
}

export function DirectFetchEmbed({
  embed,
  visibilityLabel,
  visibilityLabelOwner,
  ...rest
}: Omit<CommonProps, 'viewContext'> & {
  embed: EmbedType<'post'>
  viewContext?: PostEmbedViewContext
  visibilityLabel: string
  visibilityLabelOwner?: string
}) {
  const {currentAccount} = useSession()
  const isViewerOwner = currentAccount?.did
    ? embed.view.uri.includes(currentAccount.did)
    : false

  return (
    <View>
      <QuoteEmbed
        {...rest}
        embed={embed}
        viewContext={
          rest.viewContext === PostEmbedViewContext.Feed
            ? QuoteEmbedViewContext.FeedEmbedRecordWithMedia
            : undefined
        }
        isWithinQuote={rest.isWithinQuote}
        allowNestedQuotes={rest.allowNestedQuotes}
        visibilityLabel={
          isViewerOwner && visibilityLabelOwner
            ? visibilityLabelOwner
            : visibilityLabel
        }
      />
    </View>
  )
}

export function PostDetachedEmbed({
  embed,
  directFetchEnabled,
}: {
  embed: EmbedType<'post_detached'>
  directFetchEnabled?: boolean
}) {
  const {currentAccount} = useSession()
  const isViewerOwner = currentAccount?.did
    ? embed.view.uri.includes(currentAccount.did)
    : false

  return (
    <PostPlaceholderText directFetchEnabled={directFetchEnabled}>
      {isViewerOwner ? (
        <Trans>Removed by you</Trans>
      ) : (
        <Trans>Removed by author</Trans>
      )}
    </PostPlaceholderText>
  )
}

/*
 * Nests parent `Embed` component and therefore must live in this file to avoid
 * circular imports.
 */
export function QuoteEmbed({
  embed,
  onOpen,
  style,
  isWithinQuote: parentIsWithinQuote,
  allowNestedQuotes: parentAllowNestedQuotes,
}: Omit<CommonProps, 'viewContext'> & {
  embed: EmbedType<'post'>
  viewContext?: QuoteEmbedViewContext
  visibilityLabel?: string
}) {
  const moderationOpts = useModerationOpts()
  const quote = React.useMemo<$Typed<AppBskyFeedDefs.PostView>>(
    () => ({
      ...embed.view,
      $type: 'app.bsky.feed.defs#postView',
      record: embed.view.value,
      embed: embed.view.embeds?.[0],
    }),
    [embed],
  )
  const moderation = React.useMemo(() => {
    return moderationOpts ? moderatePost(quote, moderationOpts) : undefined
  }, [quote, moderationOpts])

  const t = useTheme()
  const queryClient = useQueryClient()
  const pal = usePalette('default')
  const itemUrip = new AtUri(quote.uri)
  const itemHref = makeProfileLink(quote.author, 'post', itemUrip.rkey)
  const itemTitle = `Post by ${quote.author.handle}`

  const richText = React.useMemo(() => {
    if (
      !bsky.dangerousIsType<AppBskyFeedPost.Record>(
        quote.record,
        AppBskyFeedPost.isRecord,
      )
    )
      return undefined
    const {text, facets} = quote.record
    return text.trim()
      ? new RichTextAPI({text: text, facets: facets})
      : undefined
  }, [quote.record])

  const onBeforePress = React.useCallback(() => {
    unstableCacheProfileView(queryClient, quote.author)
    onOpen?.()
  }, [queryClient, quote.author, onOpen])

  const [hover, setHover] = React.useState(false)
  return (
    <View
      style={[a.mt_sm]}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}>
      <ContentHider
        modui={moderation?.ui('contentList')}
        style={[a.rounded_md, a.border, t.atoms.border_contrast_low, style]}
        activeStyle={[a.p_md, a.pt_sm]}
        childContainerStyle={[a.pt_sm]}>
        {({active}) => (
          <>
            {!active && <SubtleHover hover={hover} style={[a.rounded_md]} />}
            <Link
              style={[!active && a.p_md]}
              hoverStyle={{borderColor: pal.colors.borderLinkHover}}
              href={itemHref}
              title={itemTitle}
              onBeforePress={onBeforePress}>
              <View pointerEvents="none">
                <PostMeta
                  author={quote.author}
                  moderation={moderation}
                  showAvatar
                  postHref={itemHref}
                  timestamp={quote.indexedAt}
                />
              </View>
              {moderation ? (
                <PostAlerts
                  modui={moderation.ui('contentView')}
                  style={[a.py_xs]}
                />
              ) : null}
              {richText ? (
                <RichText
                  value={richText}
                  style={a.text_md}
                  numberOfLines={20}
                  disableLinks
                />
              ) : null}
              {quote.embed && (
                <Embed
                  embed={quote.embed}
                  moderation={moderation}
                  isWithinQuote={parentIsWithinQuote ?? true}
                  // already within quote? override nested
                  allowNestedQuotes={
                    parentIsWithinQuote ? false : parentAllowNestedQuotes
                  }
                />
              )}
            </Link>
          </>
        )}
      </ContentHider>
    </View>
  )
}
