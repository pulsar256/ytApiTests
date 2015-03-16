var fs = require('fs');
if (!fs.existsSync("./config/config.js")) {
	console.log("config.js is missing. please read the documentation.");
	process.exit(1);
}

var yt = require("youtube-api");
var q = require("q");
var https = require('https');
var lockFile = require('lockfile');
var sys = require('sys');
var exec = require('child_process').execSync;
var S = require('string');

var db = require('./lib/db.js')();
var config = require('./config/config');
var cache = require('./lib/cache')(db.connection, config);



/**
 * Main
 *
 * retrieves an access_token based on the pre-configured refresh_token, starts the subscription scanner.
 **/
(function main(){

	var delLockfile = true;
	lockFile.lock('youtube-dl.lock', function (err) {
		delLockfile = false;
		if (err) throw err;
	});

	process.on('exit', function () {
		if (delLockfile) lockFile.unlock('youtube-dl.lock', function (err) {
			if (err) throw err;
		});
	});

	fs.writeFile('lastrun.txt', S('last execution time :{{date}}\n').template({date: new Date()}).s, function (err) {
		if (err) throw err;
	});

	refreshToken().then(function (token) {
		yt.authenticate({type: "oauth", token: token.access_token});
		cache.get("s_playlists").then(function (data) {
			if (!data) {
				collectSubscriptionPlaylists().then(function (playlists) {
					cache.put("s_playlists", playlists, null).then(handlePlaylists);
				});
			}
			else {
				handlePlaylists(data);
			}
		});
	});
})();


function collectSubscriptionPlaylists() {
	var def = q.defer();
	var collect = [];

	(function loop(page, collect) {

		yt.subscriptions.list({
			mine: true,
			part: "snippet",
			pageToken: page,
			maxResults: 50
		}, function (err, subscriptionData) {
			if (subscriptionData) {
				var channelIds = [];
				subscriptionData.items.forEach(function (i) {
					channelIds.push(i.snippet.resourceId.channelId);
				});
				yt.channels.list({
					part: "contentDetails",
					id: channelIds.join(",")
				}, function (err, channelData) {
					if (channelData) {
						console.log("collecting subscription playlists ... ",subscriptionData.nextPageToken);
						channelData.items.forEach(function (item) {
							collect.push(item.contentDetails.relatedPlaylists);
						});
					}
					if (subscriptionData.nextPageToken) {
						loop(subscriptionData.nextPageToken, collect);
					}
					else {
						console.log("no more tokens");
						def.resolve(collect);
					}
				});
			}
		})
	})("", collect);

	return def.promise;
}

function refreshToken() {
	var def = q.defer();
	var request = https.request({
		host: 'accounts.google.com',
		path: '/o/oauth2/token',
		port: '443',
		method: 'POST',
		headers: {
			'accept': '*/*',
			'Content-Type': 'application/x-www-form-urlencoded'
		}
	}, function (response) {
		var str = '';
		response.on('data', function (chunk) {
			str += chunk;
		});
		response.on('end', function () {
			def.resolve(JSON.parse(str));
		});
	});
	request.write(S("client_id={{client_id}}&" +
	"client_secret={{client_secret}}&" +
	"&refresh_token={{refresh_token}}&" +
	"&grant_type=refresh_token").template(config).s);
	request.end();
	return def.promise;
}

function getSpecialPlaylists() {
	var def = q.defer();
	yt.channels.list({
		"part": "contentDetails",
		"mine": true
	}, function (err, data) {
		if (err) {
			throw err;
		}
		if (data) {
			def.resolve(data.items[0].contentDetails.relatedPlaylists);
		}
	});
	return def.promise;
}

function handleVideoItems(items) {
	var def = q.defer();

	(function iterate(coll) {
		if (coll.length > 0) {
			var video = coll.splice(0, 1)[0];
			var data = {
				channelTitle: video.snippet.channelTitle,
				description: video.snippet.description,
				publishedAt: video.snippet.publishedAt,
				publishedAtD: new Date(video.snippet.publishedAt),
				title: video.snippet.title,
				thumbnail: (video.snippet.thumbnails.maxres || video.snippet.thumbnails.high).url,
				videoId: video.snippet.resourceId.videoId
			};

			if (((new Date()).getTime() - config.registerWindow) < data.publishedAtD.getTime()) {
				db.insertIfNew(data).then(function (isNew) {
					console.log(isNew ? "NEW:" : "OLD:", data.videoId, data.channelTitle, data.title);
					iterate(coll);
				});
			}
		}
		else {
			def.resolve(true);
		}
	})(items.slice(0));

	return def.promise;
}

function processDownload(row) {
	var d = q.defer();
	console.log("processing", row.video_id);

	try {
		console.log(exec(S(config.videoCommand).template(row).s));
		db.setDownloaded(row.video_id).then(function () {
			d.resolve(true);
		});
	}
	catch (err) {
		console.log("download command failed.");
		db.setFailed(row.video_id).then(function () {
			d.resolve(false)
		});
	}

	return d.promise;
}

function handlePlaylists(playlistList) {

	db.getToProcess(config).then(function (list) {
		var promises = [];
		list.forEach(function (item) {
			promises.push(processDownload(item));
		});
		q.all(promises).then(function () {
			console.log("download finished, reiterating...");
			var playlistPromises = [];
			console.log("looking for new videos in collected playlist ("+playlistList.length+" items)");
			playlistList.forEach(function (playlists) {
				var def = q.defer();
				playlistPromises.push(def.promise);
				yt.playlistItems.list({part: "snippet", maxResults: 25, playlistId: playlists.uploads},
					function (err, items) {
						if (items && items.items) {
							handleVideoItems(items.items).then(function () {
								def.resolve(items.items)
							});
						}
						else def.resolve(false);
					});
			});
			q.all(playlistPromises).then(
				function () {
					console.log("finished. Re-Run to download new registered videos after the configured time window.");
				}
			);
		});
	});
}
