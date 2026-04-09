(function () {
  'use strict';

  var MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  /**
   * Format an ISO date string (YYYY-MM-DD) as "Month D, YYYY".
   * @param {string} isoDate
   * @returns {string}
   */
  function formatDate(isoDate) {
    if (!isoDate) return '';
    var parts = isoDate.split('-');
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10) - 1;
    var day = parseInt(parts[2], 10);
    return MONTH_NAMES[month] + ' ' + day + ', ' + year;
  }

  /**
   * Get a random element from an array.
   */
  function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Show the loading overlay with a random message.
   */
  function showLoading(messages) {
    var overlay = document.getElementById('loading-overlay');
    var msgEl = document.getElementById('loading-message');
    if (msgEl && messages && messages.length) {
      msgEl.textContent = randomItem(messages);
    }
    if (overlay) overlay.classList.remove('hidden');
  }

  /**
   * Hide the loading overlay.
   */
  function hideLoading() {
    var overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  /**
   * Parse query parameters from the current URL.
   * @returns {object}
   */
  function parseParams() {
    var params = {};
    var search = window.location.search.slice(1);
    if (!search) return params;
    search.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx === -1) {
        params[decodeURIComponent(pair)] = '';
      } else {
        params[decodeURIComponent(pair.slice(0, idx))] = decodeURIComponent(pair.slice(idx + 1));
      }
    });
    return params;
  }

  /**
   * Build a URL from current params with overrides.
   */
  function buildUrl(overrides) {
    var params = parseParams();
    Object.assign(params, overrides);
    var pairs = [];
    Object.keys(params).forEach(function (k) {
      if (params[k] !== null && params[k] !== undefined && params[k] !== '') {
        pairs.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
      }
    });
    return window.location.pathname + (pairs.length ? '?' + pairs.join('&') : '');
  }

  /**
   * Render posts into #gallery using the card template.
   */
  function renderPosts(posts) {
    var gallery = document.getElementById('gallery');
    var tpl = document.getElementById('card-tpl');
    if (!gallery || !tpl) return;

    gallery.innerHTML = '<div class="masonry-sizer"></div>';

    posts.forEach(function (post) {
      var s3Url = window._config.s3.url;
      var dir = post.dir.replace(/\/$/, '');
      var isVideo = !!(post.video && post.video.trim());

      var clone = tpl.content.cloneNode(true);

      var anchor = clone.querySelector('.card-anchor');
      var img = clone.querySelector('.gallery-img');
      var titleEl = clone.querySelector('.card-title');
      var dateEl = clone.querySelector('.card-date');
      var tagEl = clone.querySelector('.card-tag');
      var playRing = clone.querySelector('.play-ring');
      var cardEl = clone.querySelector('.gallery-card');

      var thumbSrc = s3Url + '/' + dir + '/' + (post.thumb || (post.items && post.items[0]) || '');

      if (isVideo) {
        // Video post: link directly to video file
        var videoUrl = s3Url + '/' + dir + '/' + post.video;
        anchor.href = videoUrl;
        anchor.setAttribute('data-fancybox', 'gallery');
        anchor.setAttribute('data-caption', post.title || '');
        if (playRing) playRing.classList.remove('hidden');
      } else {
        // Photo post: build fancybox gallery from items
        var items = post.items || [];
        if (items.length === 0) {
          anchor.href = thumbSrc;
          anchor.setAttribute('data-fancybox', 'gallery');
          anchor.setAttribute('data-caption', post.title || '');
        } else if (items.length === 1) {
          anchor.href = s3Url + '/' + dir + '/' + items[0];
          anchor.setAttribute('data-fancybox', 'gallery');
          anchor.setAttribute('data-caption', post.title || '');
        } else {
          // Multi-image: use first item as anchor, rest as data-gallery
          anchor.href = s3Url + '/' + dir + '/' + items[0];
          anchor.setAttribute('data-fancybox', 'gallery-' + post.id);
          anchor.setAttribute('data-caption', post.title || '');

          // Create hidden anchors for remaining items
          var cardWrapper = clone.querySelector('.gallery-card');
          for (var i = 1; i < items.length; i++) {
            var extra = document.createElement('a');
            extra.href = s3Url + '/' + dir + '/' + items[i];
            extra.setAttribute('data-fancybox', 'gallery-' + post.id);
            extra.setAttribute('data-caption', post.title || '');
            extra.style.display = 'none';
            cardWrapper.appendChild(extra);
          }
        }
        if (playRing) playRing.classList.add('hidden');
      }

      img.src = thumbSrc;
      img.alt = post.title || '';

      if (titleEl) titleEl.textContent = post.title || '';
      if (dateEl) dateEl.textContent = formatDate(post.postdate);
      if (tagEl) {
        var tag = post.tag1 || post.tag2 || post.tag3 || '';
        if (tag && tag.toUpperCase() !== 'NULL') {
          tagEl.textContent = tag;
          tagEl.classList.remove('hidden');
        } else {
          tagEl.classList.add('hidden');
        }
      }

      gallery.appendChild(clone);
    });

    var msnry = new Masonry(gallery, {
      itemSelector: '.gallery-card',
      columnWidth: '.masonry-sizer',
      percentPosition: true,
      gutter: 12,
    });

    imagesLoaded(gallery).on('progress', function () {
      msnry.layout();
    });
  }

  /**
   * Load tags into the drawer's dynamic-tags container.
   */
  function loadTags() {
    Auth.apiFetch('/bot/tags').then(function (tags) {
      var container = document.getElementById('dynamic-tags');
      if (!container || !tags || !tags.length) return;
      container.innerHTML = '';
      tags.forEach(function (tag) {
        var a = document.createElement('a');
        a.href = '?nav=posts&tag=' + encodeURIComponent(tag);
        a.className = 'tag-chip';
        a.textContent = tag;
        container.appendChild(a);
      });
    }).catch(function () {
      // Tags are non-critical; silently fail
    });
  }

  /**
   * Update the mode strip label.
   */
  function updateModeLabel(params, total) {
    var label = document.getElementById('mode-label');
    if (!label) return;

    var text = '';
    if (params.post) {
      text = 'Single Post';
    } else if (params.search) {
      text = 'Search: \u201c' + params.search + '\u201d \u00b7 ' + total + ' result' + (total !== 1 ? 's' : '');
    } else if (params.nav === 'memories') {
      var today = new Date();
      var month = params.month ? parseInt(params.month, 10) - 1 : today.getMonth();
      var day = params.day ? parseInt(params.day, 10) : today.getDate();
      var dateStr = MONTH_NAMES[month] + ' ' + day;
      text = dateStr + ' \u00b7 ' + total + ' memor' + (total !== 1 ? 'ies' : 'y');
    } else if (params.nav === 'posts') {
      if (params.tag) {
        text = 'Tag: ' + params.tag + ' \u00b7 ' + total + ' post' + (total !== 1 ? 's' : '');
      } else {
        text = 'All Posts \u00b7 ' + total + ' total';
      }
    } else {
      text = 'Random Picks';
    }
    label.textContent = text;
  }

  /**
   * Set up pagination buttons.
   */
  function setupPagination(params, total, offset) {
    var prevBtn = document.getElementById('prev-btn');
    var nextBtn = document.getElementById('next-btn');
    var pageInfo = document.getElementById('page-info');

    var pageSize = 10;
    var currentPage = Math.floor(offset / pageSize) + 1;
    var totalPages = Math.ceil(total / pageSize) || 1;

    if (pageInfo) {
      pageInfo.textContent = 'Page ' + currentPage + ' of ' + totalPages;
    }

    if (prevBtn) {
      if (offset <= 0) {
        prevBtn.classList.add('hidden');
      } else {
        prevBtn.classList.remove('hidden');
        prevBtn.onclick = function () {
          var newOffset = Math.max(0, offset - pageSize);
          window.location.href = buildUrl({ offset: newOffset });
        };
      }
    }

    if (nextBtn) {
      if (offset + pageSize >= total) {
        nextBtn.classList.add('hidden');
      } else {
        nextBtn.classList.remove('hidden');
        nextBtn.onclick = function () {
          window.location.href = buildUrl({ offset: offset + pageSize });
        };
      }
    }
  }

  /**
   * Show a friendly empty-state message in the gallery.
   */
  function showEmptyMessage(msg) {
    var gallery = document.getElementById('gallery');
    if (!gallery) return;
    gallery.innerHTML = '<div class="empty-state"><p>' + msg + '</p></div>';
  }


  /**
   * Main entry point.
   */
  document.addEventListener('DOMContentLoaded', function () {
    // 1. Restore session or redirect
    Auth.restoreSession().then(function (ok) {
      if (!ok) {
        window.location.href = (window._config.basePath || '') + '/signin.html?ref=' + encodeURIComponent(window.location.href);
        return;
      }
      init();
    }).catch(function () {
      window.location.href = '/signin.html?ref=' + encodeURIComponent(window.location.href);
    });
  });

  function init() {
    var params = parseParams();

    // 3. Load messages and show loading overlay
    fetch((window._config.basePath || '') + '/js/messages.json').then(function (r) { return r.json(); }).then(function (messages) {
      showLoading(messages);
      run(params, messages);
    }).catch(function () {
      showLoading([]);
      run(params, []);
    });

    // 14. Search form
    var searchForm = document.getElementById('search-form');
    if (searchForm) {
      searchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = document.getElementById('search-input');
        var term = input ? input.value.trim() : '';
        if (term) {
          window.location.href = '?search=' + encodeURIComponent(term);
        }
      });
    }

    // Load tags for drawer
    loadTags();
  }

  function run(params, messages) {
    var offset = parseInt(params.offset || '0', 10);

    var apiPath;

    // 4. Determine API call
    if (params.post) {
      apiPath = '/bot/posts/' + encodeURIComponent(params.post);
    } else if (params.search) {
      apiPath = '/bot/search/' + encodeURIComponent(params.search) + '?offset=' + offset;
    } else if (params.nav === 'memories') {
      apiPath = '/bot/todayinhistory?offset=' + offset;
      if (params.month) apiPath += '&month=' + encodeURIComponent(params.month);
      if (params.day) apiPath += '&day=' + encodeURIComponent(params.day);
    } else if (params.nav === 'posts') {
      apiPath = '/bot/posts?offset=' + offset;
      if (params.tag) apiPath += '&tag=' + encodeURIComponent(params.tag);
    } else {
      apiPath = '/bot/posts?random=true';
    }

    // 5. Make API call
    Auth.apiFetch(apiPath).then(function (data) {
      // 6. Handle empty memories
      if (params.nav === 'memories' && data.total === 0) {
        showEmptyMessage('No memories today \u2014 go make some!');
        updateModeLabel(params, 0);
        hideLoading();

        // Fall back to random posts
        return Auth.apiFetch('/bot/posts?random=true').then(function (randomData) {
          if (randomData.posts && randomData.posts.length) {
            renderPosts(randomData.posts);
            Fancybox.bind('[data-fancybox]');
          }
          hideLoading();
        });
      }

      // 8. Render cards
      if (data.posts && data.posts.length) {
        renderPosts(data.posts);
        // 10. Init FancyBox
        Fancybox.bind('[data-fancybox]');
      } else {
        showEmptyMessage('Nothing to show here yet.');
      }

      // 11. Hide loading
      hideLoading();

      // 12. Pagination (not for random or single post)
      if (!params.post && params.nav !== undefined || params.search) {
        setupPagination(params, data.total, data.offset);
      } else if (params.nav === 'memories') {
        setupPagination(params, data.total, data.offset);
      }

      // 13. Mode label
      updateModeLabel(params, data.total);

    }).catch(function (err) {
      console.error('API error:', err);
      hideLoading();
      showEmptyMessage('Something went wrong. Please try again.');
    });
  }
})();
