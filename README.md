YouTube Data API v3 Playground
==============================

Nothing to see here, move along. If you decide to stay, you will find some "tryouts" related to the Youtube Data API v3
here. If you find a snippet or two worth copy & pasting into your code - go ahead and fork off :)

If you decide to tinker with the code, make sure to create a config.js file next to main.js, an example config file
is provided (config.js.dist)

Looking at the code it should be obvious that a) the code has been hacked together and b) i am not a prolific node.js
dev by any means.

# what does it do?

Main motivation was the deprecation of the new subscription videos rss feed found in the YouTube DATA API v2
without providing an equivalent rest resource (gdata-issues #3946). To obtain a list of most recent uploads for a users
subscriptions using the v3 API the following steps are required:

 * obtain an access_token from a pre-configured oauth refresh token
 * fetch all subscriptions / channel ids
 * for each channel id, lookup subscription channel details
 * from each channel detail collect all uploads playlist
 * for each upload playlist list playlistItems
 * apply a time window to the playlistItems to collect "recently" uploaded videos for a user's subscriptions.

This implementation does all the steps above, caches the subscription playlists in an "embedded" database and calls
an external configurable process/script. Status of the process execution and basic video metadata is also tracked
in a local "embedded" database. A delay between a new registered video and the process execution can also be configured.

This is not a turn-key ready solution but it can be customized easily to with few configuration tweaks to build an
xml feed generator or call... a nice python tool provided by rg3. Read the code and you should get an idea. If you do, expect
not that many comments in this hack and some aversions against callbacks.

Happy hacking.

* [x] Move all database related stuff into a dedicated module
* [ ] Move youtube related code into a dedicated module
* [x] perhaps replace all remaining callback patterns with a q / promise based approach
* [ ] cleanup expired / processed entries
