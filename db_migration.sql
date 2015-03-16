-- pre initial commit.
BEGIN TRANSACTION;
ALTER TABLE yt_videos RENAME TO yt_videos60b8;
CREATE TABLE yt_videos
(
video_id TEXT PRIMARY KEY,
channel_title TEXT,
description TEXT,
published INTEGER,
title TEXT,
thumbnail TEXT,
registered INTEGER,
processed INTEGER
);
INSERT INTO yt_videos SELECT * FROM yt_videos60b8;
DROP TABLE yt_videos60b8;
COMMIT;


-- for > f332bba20fc2b84ab82408d7b7c49ebc52260113
ALTER TABLE yt_videos ADD failed INT DEFAULT 0 NOT NULL;