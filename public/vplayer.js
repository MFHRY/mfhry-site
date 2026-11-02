/* 统一视频外链解析：把各站链接转成站内可播放的播放器 */
(function () {
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  function frame(src, extra) {
    return '<div class="nvideo"><iframe src="' + esc(src) + '" scrolling="no" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>' + (extra || '');
  }
  function video(src) {
    return '<div class="nvideo"><video controls autoplay playsinline src="' + esc(src) + '"></video></div>';
  }
  function link(url, text, note) {
    return '<p class="nvlink"><a href="' + esc(url) + '" target="_blank" rel="noreferrer">' + esc(text) + ' ↗</a></p>' + (note ? '<p class="vnote">' + esc(note) + '</p>' : '');
  }
  function note(t) {
    return '<p class="vnote">' + esc(t) + '</p>';
  }
  function hit(re, s, i) {
    var m = re.exec(s);
    return m ? m[i == null ? 1 : i] : null;
  }

  window.vplayerHtml = function (raw) {
    if (!raw) return '';
    var u = String(raw).trim();
    var m;

    /* ---------- B 站 ---------- */
    if ((m = hit(/bilibili\.com\/video\/(BV[0-9A-Za-z]{6,})/i, u))) {
      var p = hit(/[?&]p=(\d+)/, u) || '1';
      return frame('https://player.bilibili.com/player.html?bvid=' + m + '&page=' + p + '&autoplay=1&high_quality=1&danmaku=1');
    }
    if ((m = hit(/bilibili\.com\/video\/av(\d+)/i, u))) {
      return frame('https://player.bilibili.com/player.html?aid=' + m + '&autoplay=1&high_quality=1');
    }
    if ((m = hit(/bilibili\.com\/bangumi\/play\/ep(\d+)/i, u))) {
      return frame('https://player.bilibili.com/player.html?ep_id=' + m + '&autoplay=1&danmaku=1');
    }
    if (/b23\.tv\//i.test(u)) {
      return link(u, 'B 站短链（b23.tv）', '短链无法在站内识别，点开后用完整 BV 链接重新上传');
    }

    /* ---------- YouTube ---------- */
    if ((m = hit(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([0-9A-Za-z_-]{6,})/i, u))) {
      return frame('https://www.youtube-nocookie.com/embed/' + m + '?autoplay=1&rel=0') + note('YouTube 视频，大陆需科学上网');
    }

    /* ---------- Vimeo ---------- */
    if ((m = hit(/vimeo\.com\/(?:video\/)?(\d+)/i, u))) {
      return frame('https://player.vimeo.com/video/' + m + '?autoplay=1');
    }

    /* ---------- 腾讯视频 ---------- */
    if ((m = hit(/v\.qq\.com\/(?:x\/page|x\/cover\/[^/]+|cover\/[^/]+)\/([0-9A-Za-z]+)\.html/i, u))) {
      return frame('https://v.qq.com/txp/iframe/player.html?vid=' + m + '&autoplay=0');
    }

    /* ---------- 优酷 ---------- */
    if ((m = hit(/v_show\/id_([0-9A-Za-z=]+)\.html/i, u)) || (m = hit(/youku\.com\/[^ ]*?id_([0-9A-Za-z=]+)/i, u))) {
      return frame('https://player.youku.com/embed/' + m);
    }

    /* ---------- 西瓜视频 ---------- */
    if ((m = hit(/ixigua\.com\/(\d+)/i, u))) {
      return frame('https://www.ixigua.com/iframe/' + m + '?autoplay=0');
    }

    /* ---------- AcFun ---------- */
    if ((m = hit(/acfun\.cn\/v\/(ac\d+)/i, u))) {
      return frame('https://www.acfun.cn/player/' + m);
    }

    /* ---------- Dailymotion ---------- */
    if ((m = hit(/dailymotion\.com\/video\/([0-9A-Za-z]+)/i, u)) || (m = hit(/dai\.ly\/([0-9A-Za-z]+)/i, u))) {
      return frame('https://www.dailymotion.com/embed/video/' + m);
    }

    /* ---------- Twitch ---------- */
    if ((m = hit(/twitch\.tv\/videos\/(\d+)/i, u))) {
      return frame('https://player.twitch.tv/?video=' + m + '&parent=' + location.hostname + '&autoplay=true');
    }

    /* ---------- PeerTube（810video 等分布式实例） ---------- */
    if ((m = hit(/^(https?:\/\/[^/]+)\/videos\/embed\/([A-Za-z0-9-]+)/i, u, 2))) {
      return frame(u);
    }
    var pt = /^(https?:\/\/[^/]+)\/w\/([A-Za-z0-9]{18,24})\/?$/i.exec(u) ||
      /^(https?:\/\/[^/]+)\/videos\/watch\/([0-9a-f-]{36})/i.exec(u);
    if (pt) return frame(pt[1] + '/videos/embed/' + pt[2] + '?autoplay=1');

    /* ---------- 只能跳原站 ---------- */
    if (/douyin\.com|iesdouyin\.com/i.test(u)) return link(u, '抖音视频', '抖音不允许站内嵌入，点开原站观看');
    if (/kuaishou\.com/i.test(u)) return link(u, '快手视频', '快手不允许站内嵌入，点开原站观看');
    if (/weibo\.(com|cn)/i.test(u)) return link(u, '微博视频', '微博不允许站内嵌入，点开原站观看');
    if (/iqiyi\.com/i.test(u)) return link(u, '爱奇艺视频', '爱奇艺需要会员鉴权，点开原站观看');
    if (/xiaohongshu\.com|xhslink\.com/i.test(u)) return link(u, '小红书视频', '小红书不允许站内嵌入，点开原站观看');
    if (/music\.163\.com|y\.qq\.com/i.test(u)) return link(u, '音乐页面', '点开原站收听');

    /* ---------- 直链 ---------- */
    if (/\.(mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i.test(u)) return video(u);
    if (/\.m3u8(\?|#|$)/i.test(u)) return video(u) + note('m3u8 流媒体只有部分浏览器能直接播放');

    return link(u, '打开视频', '这个站点不支持站内播放，点开原站观看');
  };
})();
