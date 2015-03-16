## obtaining a refresh_token:

- head over to https://code.google.com/apis/console/
- create a project
- create API Access for "installed Application"
- obtain a refresh token as described below:

## Quote from http://stackoverflow.com/questions/5850287/youtube-api-single-user-scenario-with-oauth-uploading-videos
```
Try OAuth 2.0 for installed application: http://code.google.com/apis/youtube/2.0/developers_guide_protocol.html#OAuth2_Installed_Applications_Flow
First, register the API to get a client_id.
Then, log into your google account, type the following URL, change the client_id with yours. redirect_uri should be set to "urn:ietf:wg:oauth:2.0:oob".
https://accounts.google.com/o/oauth2/auth?client_id=1084945748469-eg34imk572gdhu83gj5p0an9fut6urp5.apps.googleusercontent.com&redirect_uri=urn:ietf:wg:oauth:2.0:oob&scope=https://gdata.youtube.com&response_type=code&access_type=offline
Then you authorize your own application and get an authorization code.
Then open a terminal and type (change your code, client_id, and client_secret):
curl https://accounts.google.com/o/oauth2/token -d "code=4/ux5gNj-_mIu4DOD_gNZdjX9EtOFf&client_id=1084945748469-eg34imk572gdhu83gj5p0an9fut6urp5.apps.googleusercontent.com&client_secret=hDBmMRhz7eJRsM9Z2q1oFBSe&redirect_uri=urn:ietf:wg:oauth:2.0:oob&grant_type=authorization_code"
You will get response like:
{ "access_token" : "ya29.AHES6ZTtm7SuokEB-RGtbBty9IIlNiP9-eNMMQKtXdMP3sfjL1Fc", "token_type" : "Bearer", "expires_in" : 3600, "refresh_token" : "1/HKSmLFXzqP0leUihZp2xUt3-5wkU7Gmu2Os_eBnzw74" }
Remember the refresh_token, and every time you run your application, you need to get a new access_token with the refresh_token.
```
