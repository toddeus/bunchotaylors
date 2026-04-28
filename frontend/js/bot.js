function wait(ms) {
    var defer = $.Deferred();
    setTimeout(function() { defer.resolve(); }, ms);
    return defer;
}

function getTags() {
	Auth.apiFetch('bot/tags').then(function (json) {
		updateMenu(json);
	}).catch(function(err) {
		console.error('getTags error:', err);
		showError('getTags', err);
	}).finally(function() {
		removeSpinner();
	});
}

function updateMenu(tags) {
	var html = '';
	for (var tag of tags) {
		html += '<h2 class="d-flex justify-content-center"><a href="index.html?nav=posts&tag='+ tag + '">'+ tag + '</a></h2>';
	}
	html += '<h2 class="d-flex justify-content-center mt-4"><a href="edit.html">add post</a></h2>';
	html += '<h2 class="d-flex justify-content-center mt-4"><a href="#" onclick="Auth.signOut();return false;">sign out</a></h2>';

	$('#menu h2:last').after(html);
}    

function getPosts(nav, tag, offset, month, day) {
	var endpoint = 'bot/posts?random=true';
	
	if (nav == 'posts') 
		endpoint = 'bot/posts?';
	else if (nav == 'memories') 
		endpoint = 'bot/todayinhistory?';
			
	if (tag) endpoint += 'tag=' + tag + '&';		
	if (offset) endpoint += 'offset=' + offset + '&';
	if (month) endpoint += 'month=' + month + '&';
	if (day) endpoint += 'day=' + day + '&';

	if (endpoint[endpoint.length - 1] === "&" || endpoint[endpoint.length - 1] === "?")
		endpoint = endpoint.substring(0, endpoint.length-1);	
	
	console.log('Calling ' + endpoint);
	
	Auth.apiFetch(endpoint).then(function (json) {
		console.log(json);
	
		checkOffset(json.offset, json.total);
		
		if (json.posts.length == 0) {			
			$('#nomemories').removeClass('d-none');
			getPosts('', '', '');
		}
		else {			
			$.each(json.posts, function(i, post) {							
				if (post.video)
					addVideo(post);					
				else{
					$.each(post.items, function(i, item) {						
						addPhoto(post,item);    					
					});
				}		   						
			});			
		}
				
        formatGrid(); 
               
	}).catch(function (err) {
      console.error('API error:', err);
      showError('getPosts', err);
      removeSpinner();
    });
}

function getPost(id) {
	var endpoint= 'bot/posts/' + id;
	console.log('Calling ' + endpoint);

	Auth.apiFetch(endpoint).then(function (json) {
		console.log(json);

		$("#anchornext").addClass("d-none");
		$("#anchorprevious").addClass("d-none");

		var post = json.posts[0];
		if (!post) { removeSpinner(); return; }

		var isSingle = post.video || post.items.length === 1;

		if (isSingle) {
			$('.thegrid').removeClass('row-cols-1 row-cols-md-2 row-cols-xxl-4');
			$('.thegrid').css({ 'max-width': '600px', 'margin': '0 auto' });
		} else {
			$('.thegrid').removeClass('row-cols-xxl-4');
		}

		$.each(json.posts, function(i, post) {
			if (post.video)
				addVideo(post, true);
			else {
				$.each(post.items, function(i, item) {
					addPhoto(post, item, true);
				});
			}
		});

		var postDate = getFormattedDate(post.postdate);
		var editUrl = 'edit.html?post=' + encodeURIComponent(post.id);
		$('.thegrid').before(
			'<div class="post-single-meta text-center mt-3 mb-2">' +
			'<a href="' + editUrl + '" class="post-title-edit-link">' + post.title + '</a>' +
			'<div class="post-single-date">' + postDate + '</div>' +
			'</div>'
		);
		formatGrid();
	}).catch(function (err) {
      console.error('API error:', err);
      showError('getPost', err);
      removeSpinner();
    });
}

function searchPosts(searchterm, offset) {
	var endpoint= 'bot/search/' + searchterm;
	
	if (offset) endpoint += '?offset=' + offset;
	
	console.log('Calling search ' + endpoint);
	
	Auth.apiFetch(endpoint).then(function (json) {
		console.log(json);
		
		checkOffset(json.offset, json.total);
		
		$.each(json.posts, function(i, post) {
			if (post.video)
				addVideo(post);
			else {
				$.each(post.items, function(i, item) {
					addPhoto(post,item);
				});
			}
		});

    	formatGrid();
	}).catch(function (err) {
      console.error('API error:', err);
      showError('searchPosts', err);
      removeSpinner();
    });
}

function addPhoto(post, item, hideOverlay) {
	var url = _config.s3.url + post.dir + '/' + item;
	var postDate = getFormattedDate(post.postdate);
	var overlayHtml = hideOverlay ? '' :
		`<div class="gallery-overlay rounded">
			<div class="overlay-title">${post.title}</div>
			<div class="overlay-date">${postDate}</div>
		</div>`;

	var html =
		`<div class="grid-item col p-1 card border-0">
			<a data-fancybox="gallery" data-caption="${post.title} ${postDate}" href="${url}" data-post="${post.id}">
				<img class="img-fluid rounded card-img" src="${url}" alt="" title=""/>
				${overlayHtml}
			</a>
		</div>
		`;
	$('.thegrid').append(html);
}

function addVideo(post, hideOverlay) {
	var urlThumb = _config.s3.url + post.dir + '/' + post.thumb;
	var urlVideo = _config.s3.url + post.video;
	var postDate = getFormattedDate(post.postdate);
	var playSvgLarge = `<svg width="64" height="64" viewBox="0 0 64 64">
		<circle cx="32" cy="32" r="29" fill="none" stroke="white" stroke-width="3" opacity="0.9"/>
		<polygon points="25,18 50,32 25,46" fill="white" opacity="0.9"/>
	</svg>`;
	var playSvgSmall = `<svg style="display:block;margin-top:-25px;margin-left:94%;opacity:0.7" width="25" height="25" viewBox="0 0 64 64">
		<circle cx="32" cy="32" r="29" fill="none" stroke="white" stroke-width="3"/>
		<polygon points="25,18 50,32 25,46" fill="white"/>
	</svg>`;
	var overlayHtml = hideOverlay ?
		`<div class="card-img-overlay d-flex align-items-center justify-content-center">
			${playSvgLarge}
		</div>` :
		`<div class="card-img-overlay d-flex flex-column justify-content-end">
			<div class="gallery-overlay rounded">
				<div class="overlay-title">${post.title}</div>
				<div class="overlay-date">${postDate}</div>
				${playSvgSmall}
			</div>
		</div>`;

	var html =
		`<div class="grid-item col p-1 card border-0">
			<a data-fancybox="gallery" data-type="html5video" data-caption="${post.title} ${postDate}" href="${urlVideo}" data-post="${post.id}">
				<img class="img-fluid rounded card-img" src="${urlThumb}" alt="" title=""/>
				${overlayHtml}
			</a>
		</div>
		`;

	$('.thegrid').append(html);
}

function getFormattedDate(date) {
	var monthNames = ["January", "February", "March", "April", "May", "June",
		  "July", "August", "September", "October", "November", "December"];
		
	var year = date.substring(0, 4);

	var month = date.substring(5, 7);
	month = month.startsWith('0') ? month.substring(1) : month;	

	var day = date.substring(8, 10);
	day = day.startsWith('0') ? day.substring(1) : day;
  
	return monthNames[month-1] + ' ' + day + ', ' + year;
}

function checkOffset(offset, total) {
	if (offset + 10 >= total)
		$("#anchornext").addClass("d-none");
}	
        
function formatGrid(onComplete) {
	$('.thegrid').masonry({
		itemSelector: '.grid-item',
		columnWidth: '.grid-item',
		percentPosition: true
	});

	$('.thegrid').imagesLoaded().done(function() {
		$('.thegrid').masonry('reloadItems').masonry('layout');
		removeSpinner();
		Fancybox.bind('[data-fancybox]');
		if (onComplete) onComplete();
	});
}

function removeSpinner() {
	$('#spinner').remove();
}

function showError(context, err) {
	var msg = (err && err.message) ? err.message : String(err);
	$('main').prepend(
		'<div class="alert alert-danger m-3" role="alert">' +
		'<strong>' + context + ':</strong> ' + msg +
		'</div>'
	);
}

function displayLoadingMessage() {
    $.getJSON('/js/loading-messages.json', function(data) {
        let messages = data.messages; 
        let randomMessage = messages[Math.floor(Math.random() * messages.length)];
        $('#loadingMessage').text(randomMessage);
    }).fail(function() {
        $('#loadingMessage').text('Oops! Could not load messages.');
    });
}