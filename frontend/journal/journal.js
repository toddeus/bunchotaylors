/*global _config*/

AWS.config.update({region: _config.cognito.region});

function getMetadata() {
	var metadata = new Object();
	
	metadata.health = ["no complaints","read","abs","sit ups","push ups","meditate","yoga","gym","spin","pickleball","walk","boxing"];
	metadata.fun = ["golf","paddleboard","pool","beach","fishing","fly fishing","surf","music","art","code"];
	metadata.owie = ["hip","knee","foot","back","neck"];	
	
	return metadata;
}

function getJournalRecord(date) {
	displayMetadata();
	
	getAuthToken((err, authToken) => {
		
		if (err) {
            console.error("Error retrieving auth token:", err);
            window.location.href = '../signin.html?ref=journal'; 
            return;
        }
        
		jQuery.ajax({
			url: 'https://api.bunch-o-taylors.com/journal/' + date,
			method: 'GET',
			headers: {
				'Authorization': authToken
			},
			dataType: 'json',
			success: function (rec) {	
				console.log(rec);
				loadJournal(rec);				
			},
			error: function () {				
				console.log('No journal found for ' + date);
			}	
		});
	});
}

function displayMetadata() {
	var metadata = getMetadata();
	var html = '';
	
	$.each(metadata.health, function(i, item) {
		html += '<button type="button" class="btn btn-outline-dark opt" data-bs-toggle="button">' + item + '</button>';
	});
	
	$.each(metadata.fun, function(i, item) {
		html += '<button type="button" class="btn btn-outline-dark opt" data-bs-toggle="button">' + item + '</button>';
	});
	
	html += '<table class="w-100 mt-3">';
	$.each(metadata.owie, function(i, item) {
		html += '<tr>';  		
    	html += '<td>' + item + '</td>';  		  		
		html += '<td><input type="range" class="form-range" value="0" min="0" max="2" id="' + item + '"></td>';
			
  		html += '</tr>'; 
	});
	
	html += '<tr>';  		
    html += '<td>work hours</td>';
    html += '<td>';
	html += '<select class="form-select" id="workhours">';
	html += '<option value="0"></option>';
  	html += '<option value="1">1</option>';
	html += '<option value="2">2</option>';
	html += '<option value="3">3</option>';
	html += '<option value="4">4</option>';
	html += '<option value="5">5</option>';
	html += '<option value="6">6</option>';
	html += '<option value="7">7</option>';
	html += '<option value="8">8</option>';
	html += '<option value="9">9</option>';    
	html += '</select>';
	html += '</td></tr>';
	
	html += '</table>';			
	html += '<textarea class="form-control w-100 mt-3" id="note" rows="5"></textarea>';
				
	$('#health').html(html);
}
			
function loadJournal(rec) {
	$.each(rec.health, function(i, item) {
		if($('button:contains("' + item + '")').length == 0) {
			$('#health').prepend('<button type="button" class="btn btn-outline-dark opt active" data-bs-toggle="button" aria-pressed="true">' + item + '</button>');
		}
		else {
			$('button:contains("' + item + '")').attr('aria-pressed','true');
			$('button:contains("' + item + '")').addClass('active');
		}
	});
	
	$.each(rec.owie, function(i, item) {
		$('#' + item.id).val(item.value);
	});
	
	$('#note').text(rec.note);
	$("#workhours").val(rec.workhours);	
}

function save(date,request) {
	
	getAuthToken((err, authToken) => {
		
		if (err) {
            console.error("Error retrieving auth token:", err);
            window.location.href = '../signin.html?ref=journal'; 
            return;
        }
        
		jQuery.ajax({
			url: 'https://api.bunch-o-taylors.com/journal/' + date,
			method: 'PUT',
			headers: {
				'Authorization': authToken,
				'Content-Type': 'application/json'
			},	
			dataType: 'json',					
			data: request,		
			success: function (rec) {	
				console.log('Success ' + console.log(request));						
			},
			error: function () {				
				console.log('Error ' + console.log(request));
			}	
		});
	});
}

// Format a date to YYYY-MM-DD
function formatDateYMD(d) {
	var month = d.getMonth()+1;
	var day = d.getDate();

	return d.getFullYear() + '-' +
    ((''+month).length<2 ? '0' : '') + month + '-' +
    ((''+day).length<2 ? '0' : '') + day;
}

