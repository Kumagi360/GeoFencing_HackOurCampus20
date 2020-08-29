Contains code for the MARTHA webview, the demo population simulation system, and the cluster identification. Ideally, the last two would not be webapps, but the Firebase C++ SDK for Desktop seems hacky and was a 5GB download. 

**IMPORTANT**: None of this code will work without firebase_private.js. This file contains a configuration object containing an API key and associated metadata. The database's permissions are not fully configured, so the API key is not public to prevent abuse. 

**IMPORTANT**: Parcel is used for deployment, as can be seen in package.json. 