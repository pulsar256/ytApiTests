var q = require('q');

module.exports = function (db,config) {
	return {
		get: function (key) {
			var def = q.defer();
			db.get("select * from obj_cache where id = ?", key, function (err, row) {
				if (err) {
					throw err;
				}
				if (row) {
					if (row.expire < (new Date()).getTime()) {
						console.log("cache expired for ", key);
						def.resolve(null);
					}
					else {
						def.resolve(JSON.parse(row.content));
					}
				}
				else {
					def.resolve(null);
				}
			});
			return def.promise;
		},
		put: function (key, value, ttl) {
			var def = q.defer();
			var now = new Date().getTime();
			db.run("insert or replace into obj_cache values (?,?,?)",
				[key, JSON.stringify(value), (now + (ttl || config.defaultCacheTTL)) ], function (err) {
					if (err) throw err;
					def.resolve(value);
				});
			return def.promise;
		}
	}
};