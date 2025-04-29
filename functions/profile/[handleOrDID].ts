import {AtpAgent} from '@atproto/api'

type PResp = Awaited<ReturnType<AtpAgent['getProfile']>>

// based on https://github.com/Janpot/escape-html-template-tag/blob/master/src/index.ts

const ENTITIES: {
  [key: string]: string
} = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
}

const ENT_REGEX = new RegExp(Object.keys(ENTITIES).join('|'), 'g')

function escapehtml(unsafe: HtmlSafeString | string): string {
  if (unsafe instanceof HtmlSafeString) {
    return unsafe.toString()
  }
  return String(unsafe).replace(ENT_REGEX, char => ENTITIES[char])
}

export class HtmlSafeString {
  private _parts: readonly string[]
  private _subs: readonly (HtmlSafeString | string)[]
  constructor(
    parts: readonly string[],
    subs: readonly (HtmlSafeString | string)[],
  ) {
    this._parts = parts
    this._subs = subs
  }

  toString(): string {
    let result = this._parts[0]
    for (let i = 1; i < this._parts.length; i++) {
      result += escapehtml(this._subs[i - 1]) + this._parts[i]
    }
    return result
  }
}

function html(
  parts: TemplateStringsArray,
  ...subs: (HtmlSafeString | string)[]
) {
  return new HtmlSafeString(parts, subs)
}

class HeadHandler {
  profile: PResp
  url: string
  constructor(profile: PResp, url: string) {
    this.profile = profile
    this.url = url
  }
  async element(element) {
    const view = this.profile.data

    const title = view.displayName
      ? html`<meta
          property="og:title"
          content="${view.displayName} (@${view.handle})" />`
      : html`<meta property="og:title" content="${view.handle}" />`
    const description = view.description
      ? html`
          <meta name="description" content="${view.description}" />
          <meta property="og:description" content="${view.description}" />
        `
      : ''
    const img = view.banner
      ? html`
          <meta property="og:image" content="${view.banner}" />
          <meta name="twitter:card" content="summary_large_image" />
        `
      : view.avatar
      ? html`<meta name="twitter:card" content="summary" />`
      : ''
    element.append(
      html`
        <meta property="og:site_name" content="deer.social" />
        <meta property="og:type" content="profile" />
        <meta property="profile:username" content="${view.handle}" />
        <meta property="og:url" content="${this.url}" />
        ${title} ${description} ${img}
        <meta name="twitter:label1" content="Account DID" />
        <meta name="twitter:value1" content="${view.did}" />
        <link
          rel="alternate"
          href="at://${view.did}/app.bsky.actor.profile/self" />
      `,
      {html: true},
    )
  }
}

class TitleHandler {
  profile: PResp
  constructor(profile: PResp) {
    this.profile = profile
  }
  async element(element) {
    const view = this.profile.data

    element.setInnerContent(
      view.handle
        ? `${view.displayName} (@${view.handle})`
        : `@${view.handle} on deer.social`,
    )
  }
}

class NoscriptHandler {
  profile: PResp
  constructor(profile: PResp) {
    this.profile = profile
  }
  async element(element) {
    const view = this.profile.data

    element.append(
      html`
        <div id="bsky_profile_summary">
          <h3>Profile</h3>
          <p id="bsky_display_name">${view.displayName ?? ''}</p>
          <p id="bsky_handle">${view.handle}</p>
          <p id="bsky_did">${view.did}</p>
          <p id="bsky_profile_description">${view.description ?? ''}</p>
        </div>
      `,
      {html: true},
    )
  }
}

export async function onRequest(context) {
  const agent = new AtpAgent({service: 'https://public.api.bsky.app/'})
  const {request, env} = context
  const origin = new URL(request.url).origin

  const base = env.ASSETS.fetch(new URL('/', origin))
  try {
    const profile = await agent.getProfile({
      actor: context.params.handleOrDID,
    })
    return new HTMLRewriter()
      .on(`head`, new HeadHandler(profile, request.url))
      .on(`title`, new TitleHandler(profile))
      .on(`noscript`, new NoscriptHandler(profile))
      .transform(await base)
  } catch (e) {
    return await base
  }
}
