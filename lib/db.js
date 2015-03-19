var sqlite3 = require('sqlite3').verbose();
var q = require('q');


module.exports = function (config) {
	var localConfig = config;

	var db = new sqlite3.Database('yt_manager.sqlite3');
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
		", failed INT  " +
		")");
		db.run("CREATE TABLE IF NOT EXISTS obj_cache  (id TEXT PRIMARY KEY, content TEXT, expire INT)");
	});


	return {
		connection: db,

		insertIfNew: function(videoData){
			var def = q.defer();
			db.get("select 1 from yt_videos where video_id = ?", videoData.videoId, function (err, row) {
				if (err) throw err;
				if (!row) {
					db.run("insert into yt_videos values (?,?,?,?,?,?,?,?,?)", [
						videoData.videoId,
						videoData.channelTitle,
						videoData.description,
						videoData.publishedAtD.getTime(),
						videoData.title,
						videoData.thumbnail,
						(new Date()).getTime(),
						0,
						0
					], function (err) {
						if (err) throw err;
						def.resolve(true);
					});
				}
				else {
					def.resolve(false);
				}
			});
			return def.promise;
		},

		setDownloaded: function(videoId){
			var def = q.defer();
			db.run("update yt_videos set processed = 1 where video_id = ?", [videoId], function (err) {
				if (err) throw err;
				def.resolve(true);
			});
			return def.promise;
		},

		setFailed: function(videoId){
			var def = q.defer();
			db.get("select failed from yt_videos where video_id = ?", videoId, function (err, data) {
				if (err) throw err;
				var failed = data.failed + 1;
				oldDB.run("update yt_videos set failed = ? where video_id = ?", [failed, videoId], function (err) {
					if (err) throw err;
					def.resolve(false);
				});
			});
			return def.promise;
		},

		getToProcess: function(){
			var def = q.defer();
			db.all("select * from yt_videos where processed = ? and registered < ? and failed < ?",
				[0, ((new Date()).getTime()) - (localConfig.processDelay), localConfig.videoCommandRetries],
				function (err, data) {
					if (err) throw err;
					def.resolve(data);
				});
			return def.promise;
		},

		purgeExpired: function(){
			var def = q.defer();
			db.run("delete from yt_videos where registered < ?", new Date().getTime() - (config.purgeAfter), function(err){
				if (err) throw err;
				def.resolve(this.changes);
			});
			return def.promise;
		}

	}
};