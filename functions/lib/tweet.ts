// 抓取 X（推特）单条推文：文字 + 配图（图片直接下载成 base64，存进 D1）
export interface TweetPhoto {
  mime: string;
  b64: string;
  size: number;
}

/** 原帖里的「引用推文」/「被回复的推文」（转贴、评论上下文） */
export interface TweetQuote {
  author?: string;
  handle?: string;
  text?: string;
  date?: string;
  photos?: TweetPhoto[];
}

export interface TweetData {
  url: string;
  id?: string;
  author?: string;
  handle?: string;
  text?: string;
  date?: string;
  photos?: TweetPhoto[];
  /** 原帖引用/转贴的那条推文（供评论、转贴上下文展示） */
  quote?: TweetQuote;
  /** 原帖是对谁说的（in_reply_to） */
  replyTo?: { handle?: string };
  /** 原帖的回复/评论（能抓到的部分） */
  replies?: TweetQuote[];
  /** 原帖作者头像 */
  avatar?: string;
  /** 原文语言（en 等），用于「翻译自 xx」 */
  lang?: string;
  /** 统计数据 */
  stats?: { likes?: number; replies?: number; retweets?: number; quotes?: number };
  error?: string;
}

const MAX_PHOTO = 380 * 1024;

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/\s+/g, ' ')
    .trim();

export function tweetId(url: string) {
  const m = /(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/i.exec(url);
  return m ? m[1] : null;
}

function token(id: string) {
  return (Number(id) / 1e15 * Math.PI).toString(36).replace(/0/g, '').replace(/\./g, '');
}

export async function fetchTweet(url: string): Promise<TweetData> {
  const id = tweetId(url);
  if (!id) return { url, error: '不是有效的 X 链接' };
  const canon = `https://x.com/i/status/${id}`;

  let author = '';
  let handle = '';
  let text = '';
  let date = '';
  try {
    const r = await fetch(
      `https://publish.twitter.com/oembed?omit_script=1&dnt=1&url=${encodeURIComponent(canon)}`
    );
    if (r.ok) {
      const j: any = await r.json();
      const html = String(j.html || '');
      author = j.author_name || '';
      handle = (String(j.author_url || '').split('/').pop() || '').trim();
      text = decode((html.match(/<p[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '');
      date = decode((/<a[^>]*>([^<]+)<\/a>\s*<\/blockquote>/.exec(html) || [])[1] || '');
    }
  } catch {
    // 继续尝试 syndication
  }

  const photos: TweetPhoto[] = [];
  let quote: TweetQuote | undefined;
  let replyTo: { handle?: string } | undefined;
  const replies: TweetQuote[] = [];
  let avatar = '';
  let lang = '';
  let stats: { likes?: number; replies?: number; retweets?: number; quotes?: number } = {};
  try {
    const s = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${token(id)}`, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        accept: 'application/json, text/plain, */*',
        referer: 'https://platform.twitter.com/',
        origin: 'https://platform.twitter.com',
      },
    });
    if (s.ok) {
      const j: any = await s.json();
      if (!text && j.text) text = String(j.text);
      if (!author && j.user?.name) author = String(j.user.name);
      if (!handle && j.user?.screen_name) handle = String(j.user.screen_name);
      if (!date && j.created_at) date = String(j.created_at).slice(0, 10);
      if (j.user?.profile_image_url_https) avatar = String(j.user.profile_image_url_https);
      if (j.lang) lang = String(j.lang);
      stats = {
        likes: Number(j.favorite_count) || 0,
        replies: Number(j.conversation_count) || Number(j.reply_count) || 0,
        retweets: Number(j.retweet_count) || 0,
        quotes: Number(j.quote_count) || 0,
      };

      // 引用/转贴的原推文（quoted_tweet）
      const q = j.quoted_tweet || j.quotedTweet;
      if (q) {
        quote = {
          author: q.user?.name ? String(q.user.name) : undefined,
          handle: q.user?.screen_name ? String(q.user.screen_name) : undefined,
          text: q.text ? String(q.text) : undefined,
          date: q.created_at ? String(q.created_at).slice(0, 10) : undefined,
        };
      }
      // 原帖是回复某人的（in_reply_to）——用于展示「回复 @xxx」
      if (j.in_reply_to_screen_name) replyTo = { handle: String(j.in_reply_to_screen_name) };
      // parent（部分接口会给被回复推文内容）
      if (j.parent?.text) {
        replies.push({
          author: j.parent.user?.name ? String(j.parent.user.name) : undefined,
          handle: j.parent.user?.screen_name ? String(j.parent.user.screen_name) : undefined,
          text: String(j.parent.text),
        });
      }

      const list: string[] = [];
      for (const p of j.photos || []) if (p?.url) list.push(String(p.url));
      for (const m of j.mediaDetails || []) {
        const u = m?.media_url_https || m?.url;
        if (u) list.push(String(u));
      }
      const uniq = [...new Set(list)].slice(0, 4);

      for (const u of uniq) {
        try {
          const src = u.includes('?') ? `${u}&name=small` : `${u}?name=small`;
          const ir = await fetch(src, { signal: AbortSignal.timeout(8000) });
          if (!ir.ok) continue;
          const buf = new Uint8Array(await ir.arrayBuffer());
          if (buf.length > MAX_PHOTO) continue;
          const mime = ir.headers.get('content-type') || 'image/jpeg';
          if (!/^image\//.test(mime)) continue;
          let bin = '';
          for (let i = 0; i < buf.length; i += 0x8000) {
            bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)) as any);
          }
          photos.push({ mime, b64: btoa(bin), size: buf.length });
        } catch {
          // 单张失败不影响整体
        }
      }
    }
  } catch {
    // 拿不到配图就算了
  }

  if (!text && !photos.length && !author) return { url: canon, error: '抓取失败' };
  return { url: canon, id, author, handle, text, date, photos, quote, replyTo, replies, avatar, lang, stats };
}
