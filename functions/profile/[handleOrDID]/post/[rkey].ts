import {
  AppBskyEmbedExternal,
  AppBskyEmbedRecord,
  AppBskyEmbedRecordWithMedia,
  AppBskyFeedDefs,
  type AppBskyRichtextFacet,
  AtpAgent,
  type Facet,
  RichText,
} from '@atproto/api'
import {isViewRecord} from '@atproto/api/dist/client/types/app/bsky/embed/record'

import {html} from '../../[handleOrDID].ts'

type Thread = AppBskyFeedDefs.ThreadViewPost

export function expandPostTextRich(
  postView: AppBskyFeedDefs.ThreadViewPost,
): string {
  if (
    !postView.post ||
    AppBskyFeedDefs.isNotFoundPost(postView) ||
    AppBskyFeedDefs.isBlockedPost(postView)
  ) {
    return ''
  }

  const post = postView.post
  const record = post.record
  const embed = post.embed
  const originalText = typeof record?.text === 'string' ? record.text : ''
  const facets = record?.facets as [Facet] | undefined

  let expandedText = originalText

  // Use RichText to process facets if they exist
  if (originalText && facets && facets.length > 0) {
    try {
      const rt = new RichText({text: originalText, facets})
      const modifiedSegmentsText: string[] = []

      for (const segment of rt.segments()) {
        // Check for link facets that appear shortened (e.g., example.com...)
        const link =
          segment.isLink() && (segment as unknown as AppBskyRichtextFacet.Link)
        if (
          link &&
          segment.text.endsWith('...') &&
          link.uri.includes(segment.text.slice(0, -3))
        ) {
          // Replace shortened text with full URI
          modifiedSegmentsText.push(link.uri)
        } else {
          // Keep original segment text
          modifiedSegmentsText.push(segment.text)
        }
      }
      expandedText = modifiedSegmentsText.join('')
    } catch (error) {
      // console.error("Error processing RichText segments:", error);
      // Fallback to original text on error
      expandedText = originalText
    }
  }

  // Append external link URL if present and not already in text
  if (AppBskyEmbedExternal.isView(embed) && embed.external?.uri) {
    const externalUri = embed.external.uri
    if (!expandedText.includes(externalUri)) {
      expandedText = expandedText
        ? `${expandedText}\n${externalUri}`
        : externalUri
    }
  }

  // Append placeholder for quote posts or other record embeds
  if (
    AppBskyEmbedRecord.isView(embed) ||
    AppBskyEmbedRecordWithMedia.isView(embed)
  ) {
    if (isViewRecord(embed.record)) {
      const quote = `↘️ quoting ${
        embed.record.author.displayName
          ? `${embed.record.author.displayName} (@${embed.record.author.handle})`
          : `@${embed.record.author.handle}`
      }\n\n${embed.record.value.text}`
      expandedText = expandedText ? `${expandedText}\n\n${quote}` : quote
    } else {
      const placeholder = '[quote/embed]'
      if (!expandedText.includes(placeholder)) {
        expandedText = expandedText
          ? `${expandedText}\n\n${placeholder}`
          : placeholder
      }
    }
  }

  return expandedText
}

class HeadHandler {
  thread: Thread
  url: string
  constructor(thread: Thread, url: string) {
    this.thread = thread
    this.url = url
  }
  async element(element) {
    const author = this.thread.post.author
    const title = author.displayName
      ? html`<meta
          property="og:title"
          content="${author.displayName} (@${author.handle})" />`
      : html`<meta property="og:title" content="${author.handle}" />`

    const postTextString = expandPostTextRich(this.thread)
    const postText = postTextString
      ? html`
          <meta name="description" content="${postTextString}" />
          <meta property="og:description" content="${postTextString}" />
        `
      : ''

    // const img = view.banner
    //   ? html`
    //       <meta property="og:image" content="${view.banner}" />
    //       <meta name="twitter:card" content="summary_large_image" />
    //     `
    //   : view.avatar
    //   ? html`<meta name="twitter:card" content="summary" />`
    //   : ''
    element.append(
      html`
        <meta property="og:site_name" content="deer.social" />
        <meta property="og:type" content="article" />
        <meta property="profile:username" content="${author.handle}" />
        <meta property="og:url" content="${this.url}" />
        ${title} ${postText}
        <meta name="twitter:label1" content="Account DID" />
        <meta name="twitter:value1" content="${author.did}" />
      `,
      {html: true},
    )
  }
}

export async function onRequest(context) {
  const agent = new AtpAgent({service: 'https://public.api.bsky.app/'})
  const {request, env} = context
  const origin = new URL(request.url).origin
  const {handleOrDID, rkey}: {handleOrDID: string; rkey: string} =
    context.params

  const base = env.ASSETS.fetch(new URL('/', origin))
  try {
    const {data} = await agent.getPostThread({
      uri: `at://${handleOrDID}/app.bsky.feed.post/${rkey}`,
      depth: 1,
      parentHeight: 0,
    })
    if (!AppBskyFeedDefs.isThreadViewPost(data.thread)) {
      throw new Error('Expected a ThreadViewPost')
    }
    return new HTMLRewriter()
      .on(`head`, new HeadHandler(data.thread, request.url))
      .transform(await base)
  } catch (e) {
    return await base
  }
}
