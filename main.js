var yt = require("youtube-api");
var q = require("q");
var https = require('https');
var sqlite3 = require('sqlite3').verbose();
var config = require('./config');
var lockFile = require('lockfile');
var sys = require('sys');
var exec = require('child_process').execSync;
var fs = require('fs');
var S = require('string');
var delLockfile = true;

lockFile.lock('youtube-dl.lock', function (err) {
	delLockfile = false;
	if(err) throw err;
});

process.on('exit', function () {
	if(delLockfile) lockFile.unlock('youtube-dl.lock', function (err) {
		if(err) throw err;
	});
});

https.globalAgent.maxSockets = 25;

(function ytSubscriptionsManager() {
	// chained execution order: initDB -> ytRunner -> refreshToken -> ....
	var db;

	initDB();

	fs.writeFile('lastrun.txt', S('last execution time :{{date}}\n').template({date: new Date()}).s,
		function (err) {
			if(err) throw err;
			console.log('lastrun updated, serializing...');
			ytRunner();
		});

	var cache = {
		get: function (key, callback) {
			db.get("select * from obj_cache where id = ?", key, function (err, row) {
				if(err) {
					throw err;
				}
				if(row) {
					if(row.expire < (new Date()).getTime()) {
						console.log("cache expired for ", key);
						callback(null);
					}
					else {
						callback(JSON.parse(row.content));
					}
				}
				else {
					callback(null);
				}
			})
		},
		put: function (key, value, ttl, callback) {
			db.run("insert or replace into obj_cache values (?,?,?)", [key, JSON.stringify(value), (new Date()).getTime() + (ttl || config.defaultCacheTTL)], function (err, row) {
				if(err) {
					throw err;
				}
				callback(value);
			})
		}
	};

	function initDB() {
		db = new sqlite3.Database('yt_manager.sqlite3');
		db.serialize(function () {
			db.run("CREATE TABLE IF NOT EXISTS yt_videos (" +
			" video_id TEXT PRIMARY KEY " +
			", channel_title TEXT" +
			", description TEXT" +
			", published INT" +
			", title TEXT" +
			", thumbnail TEXT" +
			", registered INT " +
			", processed INT  " +
			")");
			db.run("CREATE TABLE IF NOT EXISTS obj_cache  (id TEXT PRIMARY KEY, content TEXT, expire INT)");
		});
	}

	function maybeRegisterVideo(videoData, callback) {
		if(config.registerWindow > videoData.publishedAtD.getTime()) {
			callback(false);
			return;
		}

		db.get("select 1 from yt_videos where video_id = ?", videoData.videoId, function (err, row) {
			if(err) { throw err; }
			if(!row) {
				db.run("insert into yt_videos values (?,?,?,?,?,?,?,?)", [
					videoData.videoId,
					videoData.channelTitle,
					videoData.description,
					videoData.publishedAtD.getTime(),
					videoData.title,
					videoData.thumbnail,
					(new Date()).getTime(),
					0
				], function (err) {
					if(err) { throw err; }
					callback(true)
				});
			}
			else {
				callback(false);
			}
		})
	}

	function ytRunner() {

		refreshToken(function (token) {
			yt.authenticate({type: "oauth", token: token.access_token});
			cache.get("s_playlists", function (data) {
				if(!data) {
					collectSubscriptionPlaylists(function (playlists) {
						cache.put("s_playlists", playlists, null, handlePlaylists);
					});
				}
				else {
					handlePlaylists(data);
				}
			});
		});

		function collectSubscriptionPlaylists(callback) {
			var data = [];
			(function loop(page, collect) {

				yt.subscriptions.list({
					mine: true,
					part: "snippet",
					pageToken: page,
					maxResults: 50
				}, function (err, subscriptionData) {
					if(subscriptionData) {
						var channelIds = [];
						subscriptionData.items.forEach(function (i) {
							channelIds.push(i.snippet.resourceId.channelId);
						});
						yt.channels.list({
							part: "contentDetails",
							id: channelIds.join(",")
						}, function (err, channelData) {
							if(channelData) {
								channelData.items.forEach(function (item) {
									collect.push(item.contentDetails.relatedPlaylists);
								});
							}
							if(subscriptionData.nextPageToken) {
								console.log("next page: ", subscriptionData.nextPageToken);
								loop(subscriptionData.nextPageToken, collect);
							}
							else {
								console.log("no more tokens");
								callback(collect)
							}
						});
					}
				})
			})("", data);
		}

		function getPlaylists(callback) {
			yt.playlists.list({
				"part": "snippet",
				"mine": true
			}, function (err, data) {
				if(err) {
					throw err;
				}
				if(data) {
					callback(data);
				}
			});
		}

		function refreshToken(callback) {

			var post = S("client_id={{client_id}}&" +
			"client_secret={{client_secret}}&" +
			"&refresh_token={{refresh_token}}&" +
			"&grant_type=refresh_token").template(config).s;

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
					callback(JSON.parse(str));
				});
			});
			request.write(post);
			request.end();
		}

		function getSpecialPlaylists(callback) {
			yt.channels.list({
				"part": "contentDetails",
				"mine": true
			}, function (err, data) {
				if(err) {
					throw err;
				}
				if(data) {
					var playlists = data.items[0].contentDetails.relatedPlaylists;
					callback(playlists);
				}
			});
		}

		function handleVideoItems(items, callback) {
			function iterate(coll) {
				if(coll.length > 0) {
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

					maybeRegisterVideo(data, function (registered) {
						if(registered) console.log(data.videoId, registered ? "registered" : "skipped");
						iterate(coll);
					})
				}
				else {
					callback();
				}
			}

			iterate(items.slice(0));
		}

		function processDownload(row) {
			var d = q.defer();
			console.log("processing", row.video_id);
			try{
				console.log(exec(S(config.videoCommand).template(row).s));
				db.serialize(function () {
					db.run("update yt_videos set processed = 1 where video_id = ?", [row.video_id], function (err) {
						if(err) throw err;
						d.resolve(true);
					});
				});
			} catch (err) {
				console.log("download command failed.");
				d.resolve(false);
				return;
			}

			return d.promise;
		}

		function getToProcessList() {
			var d = q.defer();
			console.log("looking for videos to process");
			db.all("select * from yt_videos where processed = ? and registered < ?", [0, ((new Date()).getTime()) - (2 * 60 * 60 * 100)],
				function (err, data) {
					if(err) throw err;
					d.resolve(data);
				});
			return d.promise;
		}

		function handlePlaylists(playlistList) {

			getToProcessList().then(function (list) {
				var promises = [];
				list.forEach(function (item) {
					promises.push(processDownload(item));
				});
				q.all(promises).then(function () {
					console.log("download finished, reiterating...");
					var playlistPromises = [];
					playlistList.forEach(function (playlists) {
						var def = q.defer();
						playlistPromises.push(def.promise);
						yt.playlistItems.list({part: "snippet", maxResults: 25, playlistId: playlists.uploads},
							function (err, items) {
								console.log("looking for new videos in playlist", playlists.uploads);
								if(items && items.items) {
									handleVideoItems(items.items, function () {
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
	}
})();
